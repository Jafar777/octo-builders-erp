import { connectDB } from "@/lib/db";
import SiteContent from "@/models/SiteContent";
import Service from "@/models/Service";
import Project from "@/models/Project";

const DEFAULTS = {
  hero: {
    mediaType: "image",
    mediaUrl: "",
    title: { ar: "نبني رؤيتك بإتقان", en: "We build your vision with precision" },
    subtitle: { ar: "شركة مقاولات وتشييد رائدة", en: "A leading construction & contracting company" },
  },
  about: {
    title: { ar: "من نحن", en: "About Us" },
    body: {
      ar: "نحن شركة متخصصة في تقديم حلول بناء وتشييد متكاملة بأعلى معايير الجودة.",
      en: "We are a company specialized in delivering complete construction solutions to the highest quality standards.",
    },
    imageUrl: "",
  },
  contact: {
    title: { ar: "تواصل معنا", en: "Contact Us" },
    body: { ar: "نحن هنا للإجابة على استفساراتك.", en: "We're here to answer your questions." },
    email: "",
    phone: "",
    address: { ar: "", en: "" },
  },
};

export async function getSiteContent() {
  try {
    await connectDB();
    const docs = await SiteContent.find({ key: { $in: Object.keys(DEFAULTS) } }).lean();
    const result = {};
    for (const key of Object.keys(DEFAULTS)) {
      const doc = docs.find((d) => d.key === key);
      result[key] = doc ? { ...DEFAULTS[key], ...doc[key] } : DEFAULTS[key];
    }
    return result;
  } catch (err) {
    console.error("getSiteContent error", err);
    return DEFAULTS;
  }
}

export async function getServices() {
  try {
    await connectDB();
    const services = await Service.find().sort({ order: 1, createdAt: 1 }).lean();
    return services.map((s) => ({ ...s, id: s._id.toString(), _id: undefined }));
  } catch (err) {
    console.error("getServices error", err);
    return [];
  }
}

export async function getProjects() {
  try {
    await connectDB();
    const projects = await Project.find().sort({ order: 1, createdAt: 1 }).lean();
    return projects.map((p) => ({ ...p, id: p._id.toString(), _id: undefined }));
  } catch (err) {
    console.error("getProjects error", err);
    return [];
  }
}
