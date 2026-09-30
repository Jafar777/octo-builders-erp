import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Service from "@/models/Service";
import { requireAdmin } from "@/lib/requireAdmin";
import { getServices } from "@/lib/siteData";
import { servicePayload } from "@/lib/itemPayload";

export async function GET() {
  return NextResponse.json({ services: await getServices() });
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = servicePayload(await request.json());
  if (!data) return NextResponse.json({ error: "bilingual_required" }, { status: 400 });

  await connectDB();
  const count = await Service.countDocuments();
  const doc = await Service.create({ ...data, order: count });

  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}

// Body: { ids: [...] } in the new display order.
export async function PATCH(request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { ids } = await request.json();
  if (!Array.isArray(ids)) return NextResponse.json({ error: "invalid_order" }, { status: 400 });

  await connectDB();
  await Service.bulkWrite(
    ids.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { order } } }))
  );

  return NextResponse.json({ ok: true });
}
