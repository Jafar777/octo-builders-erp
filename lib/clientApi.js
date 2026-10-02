// fetch wrapper for the dashboard: JSON in/out, throws Error(code) on failure so
// screens can show t(`errors.${code}`).
export async function api(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || "server_error");
  return data;
}

// Translates an API error code, falling back to the generic message.
export function errorText(t, err) {
  const key = `errors.${err?.message || "server_error"}`;
  const text = t(key);
  return text === key ? t("errors.server_error") : text;
}
