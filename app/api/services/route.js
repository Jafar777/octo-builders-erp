import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Service from "@/models/Service";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  await connectDB();
  const services = await Service.find().sort({ order: 1, createdAt: 1 }).lean();
  return NextResponse.json({
    services: services.map((s) => ({ ...s, id: s._id.toString(), _id: undefined })),
  });
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json();
  await connectDB();

  const count = await Service.countDocuments();
  const service = await Service.create({
    title: body.title,
    description: body.description,
    imageUrl: body.imageUrl || "",
    order: count,
  });

  return NextResponse.json({ id: service._id.toString() }, { status: 201 });
}
