import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import SiteContent from "@/models/SiteContent";
import { requireAdmin } from "@/lib/requireAdmin";

const DEFAULTS = {
  hero: {
    mediaType: "image",
    mediaUrl: "",
    title: { ar: "نبني رؤيتك بإتقان", en: "We build your vision with precision" },
    subtitle: { ar: "شركة مقاولات وتشييد رائدة", en: "A leading construction & contracting company" },
  },
  about: {
    title: { ar: "من نحن", en: "About Us" },
    body: { ar: "", en: "" },
    imageUrl: "",
  },
  contact: {
    title: { ar: "تواصل معنا", en: "Contact Us" },
    body: { ar: "", en: "" },
    email: "",
    phone: "",
    address: { ar: "", en: "" },
  },
};

const SECTIONS = ["hero", "about", "contact"];

export async function GET() {
  await connectDB();
  const docs = await SiteContent.find({ key: { $in: SECTIONS } }).lean();

  const result = {};
  for (const section of SECTIONS) {
    const doc = docs.find((d) => d.key === section);
    result[section] = doc ? doc[section] : DEFAULTS[section];
  }

  return NextResponse.json(result);
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

  await connectDB();

  const updated = await SiteContent.findOneAndUpdate(
    { key: section },
    { key: section, [section]: data },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return NextResponse.json({ [section]: updated[section] });
}
