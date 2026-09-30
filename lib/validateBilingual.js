export function isBilingualComplete(value) {
  return Boolean(value?.ar?.trim() && value?.en?.trim());
}
