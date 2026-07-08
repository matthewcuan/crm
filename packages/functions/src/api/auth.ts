import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

// Google's public signing keys — cached across warm Lambda invocations
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const encoder = new TextEncoder();
const jwtSecret = () => encoder.encode(process.env.JWT_SECRET!);

/** Verify a Google Sign-In ID token and return the verified email. */
export async function verifyGoogleCredential(
  credential: string,
): Promise<string> {
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  if (!payload.email || payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  return String(payload.email);
}

/** Issue our own session JWT (the browser stores this and replays it). */
export async function issueToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(jwtSecret());
}

/** Hono middleware: every request must carry a valid JWT for the allowed email. */
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.email !== process.env.ALLOWED_EMAIL) {
      return c.json({ error: "Forbidden" }, 403);
    }
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}
