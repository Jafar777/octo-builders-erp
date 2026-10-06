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

  const { firstName, lastName, avatarUrl, phone, emergencyContact } = await readJson(request);
  const update = {};
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
  const next = { ...user, ...update };
  return NextResponse.json({ user: publicUser({ ...next, displayName: pickName(next, await viewerLang()) }) });
}
