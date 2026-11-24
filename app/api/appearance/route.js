import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanAppearance } from "@/lib/appearance";
import { isTopRole } from "@/lib/permissions";
import Setting from "@/models/Setting";
import User from "@/models/User";

// The CEO (and the programmer) set the company default — as themselves.
const managesDefault = (user) => isTopRole(user?.role) && !user.actingAs;

// Their own look and the company default.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  const company = (await Setting.findOne({ key: "appearance" }, { value: 1 }).lean())?.value || null;
  const me = await User.findById(user.id, { "ui.appearance": 1 }).lean();
  return NextResponse.json({ mine: me?.ui?.appearance || null, company, canManageDefault: managesDefault(user) });
}

// { scope: "me" | "company", appearance: {...} | null (back to the default) }
export async function PUT(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  const { scope, appearance } = await readJson(request);
  const value = appearance ? cleanAppearance(appearance) : null;

  if (scope === "me") {
    // Viewing as someone never changes their screens.
    if (user.actingAs) return NextResponse.json({ ok: true, appearance: value });
    await User.updateOne({ _id: user.id }, { $set: { "ui.appearance": value, ...(value ? { "ui.theme": value.mode } : {}) } });
    return NextResponse.json({ ok: true, appearance: value });
  }
  if (scope === "company") {
    if (!managesDefault(user)) return forbidden();
    if (value) await Setting.findOneAndUpdate({ key: "appearance" }, { key: "appearance", value }, { upsert: true });
    else await Setting.deleteOne({ key: "appearance" });
    await audit(user, "settings.updated", { entityType: "settings", entityId: "appearance", summary: value ? `appearance: ${value.preset}` : "appearance: built-in" });
    return NextResponse.json({ ok: true, appearance: value });
  }
  return fail("invalid_request");
}
