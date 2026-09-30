export function isBilingualComplete(value) {
  return Boolean(value?.ar?.trim() && value?.en?.trim());
}

function isBilingualPair(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.ar === "string" &&
    typeof value.en === "string"
  );
}

// True when any {ar, en} pair nested anywhere in `value` has text in one
// language but not the other. Optional fields may be left empty in both
// languages, but never filled in just one, so the language switch never
// shows a blank.
export function hasPartialBilingual(value) {
  if (isBilingualPair(value)) {
    return Boolean(value.ar.trim()) !== Boolean(value.en.trim());
  }
  if (Array.isArray(value)) return value.some(hasPartialBilingual);
  if (value && typeof value === "object") return Object.values(value).some(hasPartialBilingual);
  return false;
}
