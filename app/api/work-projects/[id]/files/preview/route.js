import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { fileRights } from "@/lib/projectFileAccess";
import { makePreview, previewKind } from "@/lib/filePreview";
import { resolveUpload } from "@/lib/storage";
import ProjectFile from "@/models/ProjectFile";
import WorkProject from "@/models/WorkProject";

// ?fileId=&n= — a small picture of a project file's version (change request CR-3), for
// whoever may see the project's files (seeing is enough: it isn't the file itself).
export async function GET(request, { params }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const q = new URL(request.url).searchParams;
  const fileId = q.get("fileId");
  if (!isObjectId(fileId)) return notFound();
  const project = await WorkProject.findById(id, { department: 1, fileAccess: 1 }).lean();
  if (!project) return notFound();
  if (!fileRights(user, project).view) return forbidden();
  const file = await ProjectFile.findOne({ _id: fileId, project: project._id }, { versions: 1 }).lean();
  const n = Number(q.get("n"));
  const version = file?.versions.find((v) => v.n === n) || file?.versions.at(-1);
  const kind = version?.url ? previewKind(version.fileName || version.url) : "";
  if (!kind) return notFound();
  const abs = resolveUpload(version.url);
  const picture = abs ? await makePreview(abs, kind) : null;
  if (!picture) return notFound();
  return new Response(picture, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
