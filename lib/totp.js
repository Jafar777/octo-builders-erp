// Authenticator-app codes (TOTP, RFC 6238): the 6-digit codes Google Authenticator,
// Microsoft Authenticator, Authy… show every 30 seconds. No outside service involved.
// The secret is stored encrypted with the server's JWT_SECRET (AES-256-GCM).

import crypto from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20));

// The code for a given 30-second counter.
export function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const num = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(num % 1_000_000).padStart(6, "0");
}

export const totp = (secret, now = Date.now()) => hotp(secret, Math.floor(now / 1000 / STEP));

// Accepts the current code and one step either side (phone clocks drift). Returns the
// counter that matched (to refuse the same code twice), or null.
export function verifyTotp(secret, code, now = Date.now(), lastCounter = -1) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c) || !secret) return null;
  const counter = Math.floor(now / 1000 / STEP);
  for (const k of [counter, counter - 1, counter + 1]) {
    if (k > lastCounter && crypto.timingSafeEqual(Buffer.from(hotp(secret, k)), Buffer.from(c))) return k;
  }
  return null;
}

export function otpauthUri(secret, account, issuer = "Octa Builders") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

const key = () => crypto.createHash("sha256").update(`totp:${process.env.JWT_SECRET || ""}`).digest();

export function sealSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function openSecret(sealed) {
  try {
    const [iv, tag, enc] = String(sealed).split(".").map((s) => Buffer.from(s, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
