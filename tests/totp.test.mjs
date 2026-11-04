import { base32Decode, base32Encode, hotp, otpauthUri, verifyTotp } from "../lib/totp.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// RFC 6238 SHA-1 vectors (secret "12345678901234567890"), last 6 digits.
const s = base32Encode(Buffer.from("12345678901234567890"));
ok("base32 round trip", base32Decode(s).toString() === "12345678901234567890");
ok("T=59", hotp(s, Math.floor(59 / 30)) === "287082", hotp(s, 1));
ok("T=1111111109", hotp(s, Math.floor(1111111109 / 30)) === "081804");
ok("T=1234567890", hotp(s, Math.floor(1234567890 / 30)) === "005924");
ok("T=2000000000", hotp(s, Math.floor(2000000000 / 30)) === "279037");

const now = 1234567890 * 1000;
ok("accepts current", verifyTotp(s, "005924", now) !== null);
ok("accepts previous step", verifyTotp(s, hotp(s, Math.floor(1234567890 / 30) - 1), now) !== null);
ok("rejects wrong", verifyTotp(s, "000000", now) === null);
const used = verifyTotp(s, "005924", now);
ok("rejects replay", verifyTotp(s, "005924", now, used) === null);
ok("uri", otpauthUri(s, "a@b.c").startsWith("otpauth://totp/"));

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("totp: all passed");
