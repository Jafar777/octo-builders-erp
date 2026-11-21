import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/realtime/server";
import { COMPANY_TASKS_CHANNEL } from "@/lib/tasks";
import { canDelete, purgeTrash, restoreTrash } from "@/lib/trash";

// { action: "restore" } puts it back as it was; { action: "purge" } erases it now.
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user || !canDelete(user)) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const { action } = await readJson(request);
  if (action === "restore") {
    const res = await restoreTrash(id);
    if (res.error === "not_found") return notFound();
    if (res.error) return fail(res.error, 409);
    await audit(user, `${res.item.kind}.restored`, { entityType: res.item.kind, entityId: String(res.item.refId), summary: res.item.label });
    await publish([COMPANY_TASKS_CHANNEL], "task:updated", { id: "restored" }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (action === "purge") {
    if (!(await purgeTrash(id))) return notFound();
    await audit(user, "trash.purged", { entityType: "trash", entityId: id });
    return NextResponse.json({ ok: true });
  }
  return fail("invalid_request");
}
