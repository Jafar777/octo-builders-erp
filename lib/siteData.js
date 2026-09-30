import { connectDB } from "@/lib/db";
import SiteContent from "@/models/SiteContent";
import Service from "@/models/Service";
import Project from "@/models/Project";
import { DEFAULTS, SECTIONS } from "@/lib/siteContentDefaults";
import { ensureSeeded } from "@/lib/seed";

// Strips Mongo internals so the result can be passed to client components.
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function getSiteContent() {
  try {
    await connectDB();
    const docs = await SiteContent.find({ key: { $in: SECTIONS } }).lean();
    const result = {};
    for (const key of SECTIONS) {
      const doc = docs.find((d) => d.key === key);
      result[key] = doc?.[key] ? { ...DEFAULTS[key], ...toPlain(doc[key]) } : DEFAULTS[key];
    }
    return result;
  } catch (err) {
    console.error("getSiteContent error", err);
    return DEFAULTS;
  }
}

function serialize(doc) {
  const { _id, __v, createdAt, updatedAt, ...rest } = toPlain(doc);
  return { ...rest, id: _id };
}

export async function getServices() {
  try {
    await connectDB();
    await ensureSeeded();
    const services = await Service.find().sort({ order: 1, createdAt: 1 }).lean();
    return services.map(serialize);
  } catch (err) {
    console.error("getServices error", err);
    return [];
  }
}

export async function getProjects() {
  try {
    await connectDB();
    await ensureSeeded();
    const projects = await Project.find().sort({ order: 1, createdAt: 1 }).lean();
    return projects.map(serialize);
  } catch (err) {
    console.error("getProjects error", err);
    return [];
  }
}
