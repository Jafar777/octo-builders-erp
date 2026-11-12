import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import {
  browseGrants,
  compactGrants,
  fileServerReady,
  gatewaySecret,
  getFileServer,
  legacyGrant,
  publicVolumes,
  refGrants,
  signGatewayToken,
} from "@/lib/fileServer";
import { projectFolder, taskFolder } from "@/lib/fileServerPaths";
import { canViewTask } from "@/lib/tasks";
import { projectAccess } from "@/lib/projects";
import { conversationAccess } from "@/lib/messaging";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";
import ProjectFile from "@/models/ProjectFile";
import Message from "@/models/Message";
import Conversation from "@/models/Conversation";

const OPEN_STATUSES = ["todo", "in_progress", "on_hold", "help"];
const PROJECT_FIELDS = { code: 1, name: 1, stages: 1, department: 1, serverFolder: 1, folderLink: 1, customer: 1 };

// A token for the file gateway, for one screen:
//   { for: "browse" }                  the Files page / picking files anywhere
//   { for: "task", id }                a task's delivery (the assignee adds to its folder)
//   { for: "project", id }             a project's folder and files
//   { for: "message", id }             files shared in a chat message
// → { enabled, url, token, expiresAt, grants, volumes, start, folder, canManage }
// The browser renews it before it runs out (components/erp/files/useFileSession).
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || (!user.isStaff && !user.isCustomer)) return forbidden();
  const fs = await getFileServer();
  const secret = await gatewaySecret();
  if (!fileServerReady(fs, secret)) return NextResponse.json({ enabled: false });

  const body = await readJson(request);
  const browse = browseGrants(user, fs);
  let grants = [];
  let folder = null;

  if (body.for === "browse") {
    if (!user.isStaff || user.limited) return forbidden();
    grants = browse;
  } else if (body.for === "task") {
    if (!isObjectId(body.id)) return notFound();
    const task = await Task.findById(body.id, { number: 1, revision: 1, stage: 1, project: 1, department: 1, assignee: 1, status: 1, deliveryFiles: 1, deliveryLink: 1, review: 1 }).lean();
    if (!task) return notFound();
    const project = task.project ? await WorkProject.findById(task.project, PROJECT_FIELDS).lean() : null;
    // Staff see every task; a customer only the tasks marked for their review.
    const customer = !user.isStaff && project && String(project.customer) === user.id && task.review?.customer;
    if (!(user.isStaff && canViewTask(user, task)) && !customer) return forbidden();
    folder = taskFolder(task, project, fs);
    grants = [...(user.isStaff ? browse : []), ...refGrants(task.deliveryFiles), ...legacyGrant(task.deliveryLink, fs)];
    if (folder) {
      const assignee = String(task.assignee) === user.id;
      grants.push([folder.vol, folder.path, assignee && OPEN_STATUSES.includes(task.status) ? "rw" : "r"]);
    }
  } else if (body.for === "project") {
    if (!isObjectId(body.id)) return notFound();
    const project = await WorkProject.findById(body.id, PROJECT_FIELDS).lean();
    const access = projectAccess(user, project);
    if (!access) return forbidden();
    folder = projectFolder(project, fs);
    const files = await ProjectFile.find({ project: project._id }, { "versions.server": 1 }).lean();
    const versions = files.flatMap((f) => f.versions.map((v) => v.server).filter((x) => x?.path));
    // Anyone who can open the project adds files (as on the Files tab); its managers
    // also tidy its folder.
    grants = [...browse, ...refGrants(versions), ...legacyGrant(project.folderLink, fs)];
    if (folder) grants.push([folder.vol, folder.path, access === "manage" ? "rmw" : "rw"]);
  } else if (body.for === "message") {
    if (!isObjectId(body.id)) return notFound();
    const message = await Message.findById(body.id, { conversation: 1, attachments: 1, deletedAt: 1 }).lean();
    if (!message) return notFound();
    const conversation = await Conversation.findById(message.conversation, { members: 1, type: 1 }).lean();
    if (!(await conversationAccess(user, conversation))) return forbidden();
    grants = [...browse, ...refGrants((message.attachments || []).filter((a) => a.path))];
  } else {
    return fail("invalid_request");
  }

  grants = compactGrants(grants);
  const { token, expiresAt } = await signGatewayToken(user, grants, secret);
  const start = folder || (grants[0] ? { vol: grants[0][0], path: grants[0][1] } : null);
  return NextResponse.json({
    enabled: true,
    url: fs.url,
    token,
    expiresAt,
    grants,
    volumes: publicVolumes(fs),
    start,
    folder,
    canManage: hasPermission(user, "files.manage"),
  });
}
