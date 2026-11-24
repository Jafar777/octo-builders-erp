import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { canDelete, serializeTrash, TRASH_DAYS, trashScope } from "@/lib/trash";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import Trash from "@/models/Trash";
import User from "@/models/User";

// Deleted items, newest first (without the stored documents).
export async function GET() {
  const user = await requireStaff();
  if (!user || !canDelete(user)) return forbidden();
  const items = await Trash.collection.find(trashScope(user), { projection: { docs: 0 } }).sort({ deletedAt: -1 }).toArray();
  const people = await User.find({ _id: { $in: items.map((i) => i.deletedBy).filter(Boolean) } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(people.map((p) => [String(p._id), pickName(p, lang)]));
  return NextResponse.json({ days: TRASH_DAYS, items: items.map((i) => serializeTrash(i, names)) });
}
