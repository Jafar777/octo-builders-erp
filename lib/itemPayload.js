import { isBilingualComplete, hasPartialBilingual } from "@/lib/validateBilingual";

const EMPTY = { ar: "", en: "" };

function bilingual(value) {
  return { ar: String(value?.ar || ""), en: String(value?.en || "") };
}

function strings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v) : [];
}

// Picks the editable fields of a service from a request body.
// Returns null when the bilingual rules are not met.
export function servicePayload(body) {
  const data = {
    title: bilingual(body.title),
    description: bilingual(body.description),
    category: String(body.category || ""),
    icon: String(body.icon || ""),
    imageUrl: String(body.imageUrl || ""),
  };
  if (!isBilingualComplete(data.title) || !isBilingualComplete(data.description)) return null;
  return data;
}

export function projectPayload(body) {
  const data = {
    title: bilingual(body.title),
    description: bilingual(body.description),
    categories: strings(body.categories),
    location: bilingual(body.location || EMPTY),
    style: bilingual(body.style || EMPTY),
    designers: bilingual(body.designers || EMPTY),
    client: bilingual(body.client || EMPTY),
    year: String(body.year || ""),
    area: String(body.area || ""),
    imageUrl: String(body.imageUrl || ""),
    gallery: strings(body.gallery),
    link: String(body.link || ""),
  };
  if (!isBilingualComplete(data.title) || !isBilingualComplete(data.description)) return null;
  if (hasPartialBilingual(data)) return null;
  return data;
}
