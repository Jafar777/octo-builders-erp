"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Input } from "@/components/erp/ui/fields";

const EMPTY = { ar: "", en: "" };

// First and last name, each in Arabic and English (all four required).
// value = { firstName: { ar, en }, lastName: { ar, en } }
export default function NameFields({ value, onChange }) {
  const { t } = useLanguage();
  const first = value.firstName || EMPTY;
  const last = value.lastName || EMPTY;
  const set = (part, lang) => (v) => onChange({ ...value, [part]: { ...(part === "firstName" ? first : last), [lang]: v } });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label={t("erp.names.firstAr")} value={first.ar} onChange={set("firstName", "ar")} dir="rtl" />
      <Input label={t("erp.names.lastAr")} value={last.ar} onChange={set("lastName", "ar")} dir="rtl" />
      <Input label={t("erp.names.firstEn")} value={first.en} onChange={set("firstName", "en")} dir="ltr" />
      <Input label={t("erp.names.lastEn")} value={last.en} onChange={set("lastName", "en")} dir="ltr" />
    </div>
  );
}

export const namesComplete = (v) => [v.firstName?.ar, v.firstName?.en, v.lastName?.ar, v.lastName?.en].every((x) => x?.trim());

// Starting values: the saved parts, or the old single name split into English first / last.
export function initialNames(person) {
  const firstName = { ...EMPTY, ...person?.firstName };
  const lastName = { ...EMPTY, ...person?.lastName };
  if (![firstName.ar, firstName.en, lastName.ar, lastName.en].some(Boolean) && person?.name) {
    const [head, ...rest] = person.name.trim().split(/\s+/);
    firstName.en = head || "";
    lastName.en = rest.join(" ");
  }
  return { firstName, lastName };
}
