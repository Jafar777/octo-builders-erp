import { SignJWT } from "jose";

// People and data the global setup creates (tests/e2e/global-setup.mjs).
export const IDS = {
  department: "650000000000000000000001",
  ceo: "650000000000000000000101",
  employee: "650000000000000000000102",
  project: "650000000000000000000201",
};
export const PROJECT_NAME = "E2E Villa Interior";

// Signs in as one of the seeded people by setting the session cookie directly.
export async function signInAs(context, who) {
  const token = await new SignJWT({ sub: IDS[who], email: `${who}@e2e.test`, role: who === "ceo" ? "ceo" : "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  await context.addCookies([{ name: "octa_session", value: token, url: "http://localhost:3100" }]);
}
