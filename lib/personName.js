import { cookies } from "next/headers";

// People have a first and last name in Arabic and English. `name` (English) and
// `nameAr` are the full names kept on the user for display and sorting.

const clean = (v) => String(v || "").trim().slice(0, 40);

export function cleanNameParts(first, last) {
  const firstName = { ar: clean(first?.ar), en: clean(first?.en) };
  const lastName = { ar: clean(last?.ar), en: clean(last?.en) };
  if (![firstName.ar, firstName.en, lastName.ar, lastName.en].every(Boolean)) return { error: "name_required" };
  return {
    firstName,
    lastName,
    name: `${firstName.en} ${lastName.en}`,
    nameAr: `${firstName.ar} ${lastName.ar}`,
  };
}

export const nameParts = (u) => ({
  firstName: { ar: u.firstName?.ar || "", en: u.firstName?.en || "" },
  lastName: { ar: u.lastName?.ar || "", en: u.lastName?.en || "" },
});

// The viewer's language, which the browser keeps in the `octa_lang` cookie.
export async function viewerLang() {
  try {
    return (await cookies()).get("octa_lang")?.value === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

// A person's name in `lang`, falling back to the other name, then the email.
export function pickName(u, lang) {
  if (!u) return "";
  return (lang === "ar" && u.nameAr) || u.name || u.nameAr || u.email || "";
}

// Projection fields needed by pickName().
export const NAME_FIELDS = { name: 1, nameAr: 1, email: 1 };
