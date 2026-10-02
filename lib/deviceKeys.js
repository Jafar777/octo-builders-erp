import crypto from "crypto";

export const hashDeviceKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");

export function newDeviceKey() {
  return `octo_${crypto.randomBytes(24).toString("base64url")}`;
}
