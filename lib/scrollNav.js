export const NAVBAR_OFFSET = 84;

export function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET;
  window.scrollTo({ top: y, behavior: "smooth" });
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}
