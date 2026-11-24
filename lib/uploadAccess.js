// Who may open an uploaded file (app/uploads/[...path]/route.js).
//   octabuilders/hr/<userId>/…    an HR document: whoever may see that person's HR file
//   octabuilders/chat/…           chat attachments: signed-in staff
//   octabuilders/projects/…       project files: signed-in staff
//   anything else in octabuilders  website pictures, profile photos: public — except an
//                                 older HR document uploaded there before the HR folder
//                                 existed (found by its address on the person's file).
//
//   octabuilders/office/…         the office's correspondence files: office.manage only
//   octabuilders/cv/…             candidates' CVs: recruitment (manage / assist) and the office
//
// Production: Nginx must not serve the private folders itself. In the /uploads/ block:
//   location ~ ^/uploads/octabuilders/(hr|chat|projects|office|cv)/ { proxy_pass http://<the Next.js app>; }
// (placed before the plain `location /uploads/` that serves files from disk), and the
// older HR documents in the main folder need the same until they're moved.
import { getCurrentUser } from "@/lib/currentUser";
import { canSeePerson } from "@/lib/hrAccess";
import { isObjectId } from "@/lib/apiUtils";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

const STAFF_FOLDERS = ["chat", "projects"];

// `rel`: "octabuilders/…/file.ext". Returns { allowed, private }.
export async function canOpenUpload(rel) {
  const parts = String(rel || "").split("/").filter(Boolean);
  const [root, folder, owner] = parts;
  if (root !== "octabuilders") return { allowed: true, private: false };
  if (folder === "hr") {
    const user = await getCurrentUser();
    return { allowed: isObjectId(owner) && (await canSeePerson(user, owner, "attendance.view")), private: true };
  }
  // The office's correspondence files: the office (office.manage) and the CEO only.
  if (folder === "office") {
    const user = await getCurrentUser();
    return { allowed: Boolean(user?.isStaff && user.permissions?.includes("office.manage")), private: true };
  }
  // Candidates' CVs: whoever runs or helps with hiring, and the office.
  if (folder === "cv") {
    const user = await getCurrentUser();
    const p = user?.permissions || [];
    return { allowed: Boolean(user?.isStaff && ["recruitment.manage", "recruitment.assist", "office.manage"].some((x) => p.includes(x))), private: true };
  }
  if (STAFF_FOLDERS.includes(folder) && parts.length > 2) {
    const user = await getCurrentUser();
    return { allowed: Boolean(user?.isStaff), private: true };
  }
  // An HR document from before the HR folder: private to whoever may see that file.
  await connectDB();
  const holder = await User.findOne({ "documents.url": `/uploads/${parts.join("/")}` }, { _id: 1 }).lean();
  if (holder) {
    const user = await getCurrentUser();
    return { allowed: await canSeePerson(user, holder._id.toString(), "attendance.view"), private: true };
  }
  return { allowed: true, private: false };
}
