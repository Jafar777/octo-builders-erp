// Only these email providers are allowed to sign up / log in.
export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "yahoo.com",
  "protonmail.com",
  "proton.me",
  "outlook.com",
  "icloud.com",
];

export function isEmailDomainAllowed(email) {
  if (!email || typeof email !== "string") return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
