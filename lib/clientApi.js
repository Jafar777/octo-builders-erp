// Sent after every successful request, so the dashboard can confirm changes with a
// short "Saved" / "Deleted" message (components/erp/ui/Feedback.jsx). `quiet: true`
// skips it for a request that changes nothing the person would want confirmed.
export const API_DONE_EVENT = "erp:api-done";

// fetch wrapper for the dashboard: JSON in/out, throws Error(code) on failure so
// screens can show t(`errors.${code}`).
export async function api(url, { method = "GET", body, quiet = false } = {}) {
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
  if (!res.ok) {
    const err = new Error(data.error || "server_error");
    err.data = data; // the error's details (e.g. the clashing task's number)
    throw err;
  }
  if (!quiet && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(API_DONE_EVENT, { detail: { method, url } }));
  return data;
}

// Translates an API error code, falling back to the generic message.
export function errorText(t, err) {
  const key = `errors.${err?.message || "server_error"}`;
  // Details sent with the error (a task number…) fill the message's {placeholders}.
  const { error: _code, ...vars } = err?.data || {};
  const text = t(key, vars);
  return text === key ? t("errors.server_error") : text;
}
