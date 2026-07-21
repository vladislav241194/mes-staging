import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const EMPLOYEE_PIN_HASH_BYTES = 64;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function createEmployeePinHash(pin, salt = randomBytes(16).toString("hex")) {
  const hash = await scryptAsync(String(pin ?? ""), String(salt), EMPLOYEE_PIN_HASH_BYTES);
  return `scrypt:v1:${salt}:${Buffer.from(hash).toString("hex")}`;
}

export async function verifyEmployeePin(pin, storedHash) {
  const [algorithm, version, salt, expectedHash] = String(storedHash ?? "").split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !/^[a-f\d]{128}$/i.test(expectedHash || "")) {
    return false;
  }
  const actualHash = await scryptAsync(String(pin ?? ""), salt, EMPLOYEE_PIN_HASH_BYTES);
  return safeEqual(Buffer.from(actualHash).toString("hex"), expectedHash.toLowerCase());
}

export function signEmployeeSessionPayload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const signature = createHmac("sha256", String(secret ?? "")).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyEmployeeSessionToken(token, secret) {
  const [body, signature, extra] = String(token ?? "").split(".");
  if (!body || !signature || extra !== undefined || !secret) return null;
  const expectedSignature = createHmac("sha256", String(secret)).update(body).digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}
