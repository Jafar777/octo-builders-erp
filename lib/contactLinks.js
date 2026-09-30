// Turns the contact section content into display items with links, shared by
// the contact section and the footer. Empty fields are skipped.
export function contactLinks(contact, lang) {
  if (!contact) return [];
  const digits = (v) => v.replace(/[^\d]/g, "");
  const handle = (contact.instagram || "").replace(/^@/, "");
  const website = contact.website || "";

  return [
    { key: "email", value: contact.email, href: contact.email && `mailto:${contact.email}` },
    { key: "phone", value: contact.phone, href: contact.phone && `tel:${contact.phone.replace(/\s/g, "")}` },
    { key: "whatsapp", value: contact.whatsapp, href: contact.whatsapp && `https://wa.me/${digits(contact.whatsapp)}` },
    {
      key: "website",
      value: website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      href: website && (/^https?:\/\//.test(website) ? website : `https://${website}`),
    },
    { key: "instagram", value: handle && `@${handle}`, href: handle && `https://instagram.com/${handle}` },
    { key: "address", value: contact.address?.[lang], href: null },
  ].filter((item) => item.value);
}
