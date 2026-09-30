import crypto from "crypto";

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
