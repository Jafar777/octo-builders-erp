import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import Client from "@/models/Client";
import { serializeClient } from "@/lib/financeEntries";

export async function GET() {
  const user = await requirePermission("finance.view");
  if (!user) return forbidden();
  const clients = await Client.find().sort({ name: 1 }).lean();
  return NextResponse.json({ clients: clients.map(serializeClient) });
}

export async function POST(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 150);
  if (!name) return fail("name_required");
  const client = await Client.create({
    name,
    phone: String(body.phone || "").slice(0, 40),
    email: String(body.email || "").slice(0, 120),
    notes: String(body.notes || "").slice(0, 1000),
  });
  await audit(user, "finance.client_created", { entityType: "client", entityId: client._id, summary: name });
  return NextResponse.json({ client: serializeClient(client.toObject()) }, { status: 201 });
}
