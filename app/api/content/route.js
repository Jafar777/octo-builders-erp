import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import SiteContent from "@/models/SiteContent";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSiteContent } from "@/lib/siteData";
import { SECTIONS } from "@/lib/siteContentDefaults";
import { hasPartialBilingual } from "@/lib/validateBilingual";

export async function GET() {
  return NextResponse.json(await getSiteContent());
}

export async function PUT(request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { section, data } = await request.json();

  if (!SECTIONS.includes(section)) {
    return NextResponse.json({ error: "invalid_section" }, { status: 400 });
  }
  if (!data || typeof data !== "object" || hasPartialBilingual(data)) {
    return NextResponse.json({ error: "bilingual_required" }, { status: 400 });
  }

  await connectDB();

  const updated = await SiteContent.findOneAndUpdate(
    { key: section },
    { key: section, [section]: data },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return NextResponse.json({ [section]: updated[section] });
}
