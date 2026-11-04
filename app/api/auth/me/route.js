import { NextResponse } from "next/server";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { cleanNameParts, pickName, viewerLang } from "@/lib/personName";
import User from "@/models/User";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: publicUser(user) });
}

export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();

  const { firstName, lastName, avatarUrl, phone, emergencyContact, ui } = await readJson(request);
  const update = {};
  // Screen preferences: only what changed is sent; page keys are short words.
  if (ui && typeof ui === "object") {
    const keys = (list) => (Array.isArray(list) ? [...new Set(list.map(String).filter((k) => /^[a-zA-Z]{1,40}$/.test(k)))].slice(0, 40) : undefined);
    if (["dark", "light"].includes(ui.theme)) update["ui.theme"] = ui.theme;
    if (keys(ui.favorites)) update["ui.favorites"] = keys(ui.favorites);
    if (keys(ui.collapsed)) update["ui.collapsed"] = keys(ui.collapsed);
    if (ui.welcomed === true) update["ui.welcomedAt"] = new Date();
  }
  if (firstName !== undefined || lastName !== undefined) {
    const names = cleanNameParts(firstName, lastName);
    if (names.error) return fail(names.error);
    Object.assign(update, names);
  }
  if (typeof avatarUrl === "string") update.avatarUrl = avatarUrl;
  if (typeof phone === "string") update.phone = phone.trim().slice(0, 30);
  // Same limits as the HR file (app/api/hr/employees/[id]).
  if (emergencyContact && typeof emergencyContact === "object") {
    update.emergencyContact = {
      name: String(emergencyContact.name || "").trim().slice(0, 100),
      phone: String(emergencyContact.phone || "").trim().slice(0, 40),
      relation: String(emergencyContact.relation || "").trim().slice(0, 60),
    };
  }

  await User.findByIdAndUpdate(user.id, update);
  const next = { ...user, ...Object.fromEntries(Object.entries(update).filter(([k]) => !k.startsWith("ui."))) };
  return NextResponse.json({ user: publicUser({ ...next, displayName: pickName(next, await viewerLang()) }) });
}
