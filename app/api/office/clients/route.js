import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canUseOffice, cleanClient, serializeClient } from "@/lib/officeServer";
import Client from "@/models/Client";
import Interaction from "@/models/Interaction";
import OfficeItem from "@/models/OfficeItem";
import { OPEN_STATUSES } from "@/lib/office";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The office's clients, with their last contact and open items. ?q= searches name / phone.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const q = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  const query = q ? { $or: [{ name: { $regex: esc(q), $options: "i" } }, { phone: { $regex: esc(q) } }, { "contacts.name": { $regex: esc(q), $options: "i" } }] } : {};
  const clients = await Client.find(query).sort({ updatedAt: -1 }).limit(300).lean();
  const ids = clients.map((c) => c._id);
  const [last, open] = await Promise.all([
    Interaction.aggregate([{ $match: { client: { $in: ids } } }, { $sort: { at: -1 } }, { $group: { _id: "$client", at: { $first: "$at" }, summary: { $first: "$summary" } } }]),
    OfficeItem.aggregate([{ $match: { client: { $in: ids }, status: { $in: OPEN_STATUSES } } }, { $group: { _id: "$client", n: { $sum: 1 } } }]),
  ]);
  const lastBy = Object.fromEntries(last.map((l) => [String(l._id), l]));
  const openBy = Object.fromEntries(open.map((o) => [String(o._id), o.n]));
  return NextResponse.json({
    clients: clients.map((c) => ({ ...serializeClient(c), lastContact: lastBy[String(c._id)] || null, openItems: openBy[String(c._id)] || 0 })),
  });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const data = cleanClient(await readJson(request));
  if (!data.name) return fail("name_required");
  const client = await Client.create({ ...data, createdBy: user.id });
  await audit(user, "office.client_created", { entityType: "client", entityId: client._id, summary: client.name });
  return NextResponse.json({ client: serializeClient(client.toObject()) }, { status: 201 });
}
