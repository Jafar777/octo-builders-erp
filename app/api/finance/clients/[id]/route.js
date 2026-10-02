import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import Client from "@/models/Client";
import FinanceEntry from "@/models/FinanceEntry";

async function load(params) {
  const user = await requirePermission("finance.manage");
  if (!user) return { error: forbidden() };
  const { id } = await params;
  const client = isObjectId(id) ? await Client.findById(id) : null;
  return client ? { user, client } : { error: notFound() };
}

export async function PATCH(request, { params }) {
  const { user, client, error } = await load(params);
  if (error) return error;
  const body = await readJson(request);
  const name = String(body.name ?? client.name).trim().slice(0, 150);
  if (!name) return fail("name_required");
  client.set({
    name,
    phone: String(body.phone ?? client.phone).slice(0, 40),
    email: String(body.email ?? client.email).slice(0, 120),
    notes: String(body.notes ?? client.notes).slice(0, 1000),
  });
  await client.save();
  await audit(user, "finance.client_updated", { entityType: "client", entityId: client._id, summary: name });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { user, client, error } = await load(params);
  if (error) return error;
  if (await FinanceEntry.exists({ client: client._id })) return fail("in_use", 409);
  await client.deleteOne();
  await audit(user, "finance.client_deleted", { entityType: "client", entityId: client._id, summary: client.name });
  return NextResponse.json({ ok: true });
}
