import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/Project";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  await connectDB();
  const projects = await Project.find().sort({ order: 1, createdAt: 1 }).lean();
  return NextResponse.json({
    projects: projects.map((p) => ({ ...p, id: p._id.toString(), _id: undefined })),
  });
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json();
  await connectDB();

  const count = await Project.countDocuments();
  const project = await Project.create({
    title: body.title,
    description: body.description,
    imageUrl: body.imageUrl || "",
    link: body.link || "",
    order: count,
  });

  return NextResponse.json({ id: project._id.toString() }, { status: 201 });
}
