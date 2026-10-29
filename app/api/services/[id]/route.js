import { NextResponse } from "next/server";
import { isObjectId } from "@/lib/apiUtils";
import { connectDB } from "@/lib/db";
import Service from "@/models/Service";
import { requireAdmin } from "@/lib/requireAdmin";
import { servicePayload } from "@/lib/itemPayload";

export async function PUT(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data = servicePayload(await request.json());
  if (!data) return NextResponse.json({ error: "bilingual_required" }, { status: 400 });

  await connectDB();
  await Service.findByIdAndUpdate(id, data);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await connectDB();
  await Service.findByIdAndDelete(id);

  return NextResponse.json({ ok: true });
}
