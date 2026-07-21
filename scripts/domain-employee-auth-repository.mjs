import postgres from "postgres";
import { verifyEmployeePin } from "./employee-auth-crypto.mjs";

const CLIENTS_BY_URL = new Map();
const DUMMY_EMPLOYEE_PIN_HASH = "scrypt:v1:mes-employee-auth-dummy-v1:08ed0947b2a2c6ee4c4e66c27fa419f1c6cc30106f4e72b80be262197f881a53b4fdd0d4619befa41d3ba8468a93b89dada003b758358fe050ede1517ec81964";

function getClient(databaseUrl) {
  const existing = CLIENTS_BY_URL.get(databaseUrl);
  if (existing) return existing;
  const client = postgres(databaseUrl, {
    max: 3,
    idle_timeout: 10,
    connect_timeout: 5,
    prepare: false,
  });
  CLIENTS_BY_URL.set(databaseUrl, client);
  return client;
}

export async function closeEmployeeAuthClients() {
  await Promise.all([...CLIENTS_BY_URL.values()].map((client) => client.end({ timeout: 5 })));
  CLIENTS_BY_URL.clear();
}

function normalizedEmployeeId(value) {
  return String(value ?? "").trim();
}

function normalizedDate(value, fallback = new Date()) {
  const candidate = value instanceof Date ? value : new Date(value ?? fallback);
  return Number.isFinite(candidate.getTime()) ? candidate : fallback;
}

function normalizedPositiveInteger(value, fallback) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : fallback;
}

function iso(value) {
  return value?.toISOString?.() || (value ? new Date(value).toISOString() : "");
}

export function getFailedEmployeeAuthenticationUpdate(row, {
  now = new Date(),
  maxAttempts = 5,
  lockSeconds = 15 * 60,
} = {}) {
  const at = normalizedDate(now);
  const attemptLimit = normalizedPositiveInteger(maxAttempts, 5);
  const lockDurationSeconds = normalizedPositiveInteger(lockSeconds, 15 * 60);
  const priorLockedUntil = row?.locked_until ? normalizedDate(row.locked_until, new Date(0)) : null;
  const lockExpired = Boolean(priorLockedUntil && priorLockedUntil.getTime() <= at.getTime());
  const priorAttempts = lockExpired ? 0 : Math.max(0, Number(row?.failed_attempts || 0));
  const failedAttempts = priorAttempts + 1;
  const lockedUntil = failedAttempts >= attemptLimit
    ? new Date(at.getTime() + lockDurationSeconds * 1000)
    : null;
  return Object.freeze({
    failedAttempts,
    lockedUntil,
    locked: Boolean(lockedUntil),
  });
}

function sessionInspection(row, expectedAuthVersion) {
  if (!row) return { valid: false, reason: "missing-credential" };
  if (row.is_active === false) return { valid: false, reason: "inactive-employee" };
  if (Number(row.auth_version) !== Number(expectedAuthVersion)) {
    return { valid: false, reason: "revoked-session" };
  }
  return {
    valid: true,
    reason: "valid",
    employeeId: normalizedEmployeeId(row.employee_id),
    displayName: String(row.display_name ?? "").trim(),
    personnelNumber: String(row.personnel_number ?? "").trim(),
    authVersion: Number(row.auth_version),
  };
}

export function createEmployeeAuthRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for employee authentication");
  const sql = getClient(databaseUrl);

  return {
    async schemaStatus() {
      const [row] = await sql`
        SELECT to_regclass('system_employee_auth_credentials') IS NOT NULL AS credentials_ready`;
      return { ready: row?.credentials_ready === true };
    },

    async inspectEmployee(employeeId) {
      const normalizedId = normalizedEmployeeId(employeeId);
      if (!normalizedId) return null;
      const [row] = await sql`
        SELECT id, personnel_number, display_name, is_active
        FROM system_employees
        WHERE id = ${normalizedId}`;
      return row ? {
        employeeId: normalizedEmployeeId(row.id),
        personnelNumber: String(row.personnel_number ?? "").trim(),
        displayName: String(row.display_name ?? "").trim(),
        active: row.is_active !== false,
      } : null;
    },

    async authenticate({ employeeId, pin, now = new Date(), maxAttempts = 5, lockSeconds = 15 * 60 } = {}) {
      const normalizedId = normalizedEmployeeId(employeeId);
      const at = normalizedDate(now);
      if (!normalizedId || typeof pin !== "string" || !pin || Buffer.byteLength(pin, "utf-8") > 128) {
        return { ok: false, reason: "invalid-credentials" };
      }

      return sql.begin(async (tx) => {
        const [row] = await tx`
          SELECT credentials.employee_id, credentials.pin_hash, credentials.auth_version,
            credentials.failed_attempts, credentials.locked_until,
            employees.display_name, employees.personnel_number, employees.is_active
          FROM system_employee_auth_credentials AS credentials
          JOIN system_employees AS employees ON employees.id = credentials.employee_id
          WHERE credentials.employee_id = ${normalizedId}
          FOR UPDATE OF credentials, employees`;

        if (!row || row.is_active === false) {
          // Keep missing/inactive identifiers on the same expensive verifier
          // path as a real credential. The employee picker is not secret, but
          // the authentication endpoint still should not add a timing oracle.
          await verifyEmployeePin(pin, row?.pin_hash || DUMMY_EMPLOYEE_PIN_HASH);
          return { ok: false, reason: "invalid-credentials" };
        }

        const lockedUntil = row.locked_until ? normalizedDate(row.locked_until, new Date(0)) : null;
        if (lockedUntil && lockedUntil.getTime() > at.getTime()) {
          return { ok: false, reason: "locked", lockedUntil: iso(lockedUntil) };
        }

        if (!await verifyEmployeePin(pin, row.pin_hash)) {
          const failed = getFailedEmployeeAuthenticationUpdate(row, { now: at, maxAttempts, lockSeconds });
          await tx`
            UPDATE system_employee_auth_credentials
            SET failed_attempts = ${failed.failedAttempts}, locked_until = ${failed.lockedUntil},
              last_failure_at = ${at}, updated_at = ${at}
            WHERE employee_id = ${normalizedId}`;
          return {
            ok: false,
            reason: failed.locked ? "locked" : "invalid-credentials",
            lockedUntil: iso(failed.lockedUntil),
          };
        }

        await tx`
          UPDATE system_employee_auth_credentials
          SET failed_attempts = 0, locked_until = NULL, last_success_at = ${at}, updated_at = ${at}
          WHERE employee_id = ${normalizedId}`;
        return {
          ok: true,
          reason: "authenticated",
          employeeId: normalizedId,
          displayName: String(row.display_name ?? "").trim(),
          personnelNumber: String(row.personnel_number ?? "").trim(),
          authVersion: Number(row.auth_version),
        };
      });
    },

    async inspectSession({ employeeId, authVersion } = {}) {
      const normalizedId = normalizedEmployeeId(employeeId);
      if (!normalizedId || !Number.isInteger(Number(authVersion)) || Number(authVersion) <= 0) {
        return { valid: false, reason: "invalid-session-payload" };
      }
      const [row] = await sql`
        SELECT credentials.employee_id, credentials.auth_version,
          employees.display_name, employees.personnel_number, employees.is_active
        FROM system_employee_auth_credentials AS credentials
        JOIN system_employees AS employees ON employees.id = credentials.employee_id
        WHERE credentials.employee_id = ${normalizedId}`;
      return sessionInspection(row, authVersion);
    },

    async setPinHash({ employeeId, pinHash, now = new Date() } = {}) {
      const normalizedId = normalizedEmployeeId(employeeId);
      const normalizedHash = String(pinHash ?? "").trim();
      const at = normalizedDate(now);
      if (!normalizedId || !/^scrypt:v1:[^:]+:[a-f\d]{128}$/i.test(normalizedHash)) {
        throw new TypeError("A valid employee id and scrypt:v1 PIN hash are required");
      }
      const [row] = await sql`
        INSERT INTO system_employee_auth_credentials (
          employee_id, pin_hash, auth_version, failed_attempts, locked_until,
          pin_changed_at, created_at, updated_at
        ) VALUES (${normalizedId}, ${normalizedHash}, 1, 0, NULL, ${at}, ${at}, ${at})
        ON CONFLICT (employee_id) DO UPDATE SET
          pin_hash = EXCLUDED.pin_hash,
          auth_version = system_employee_auth_credentials.auth_version + 1,
          failed_attempts = 0,
          locked_until = NULL,
          pin_changed_at = EXCLUDED.pin_changed_at,
          updated_at = EXCLUDED.updated_at
        RETURNING employee_id, auth_version`;
      return { employeeId: row.employee_id, authVersion: Number(row.auth_version) };
    },

    async revokeSessions(employeeId, now = new Date()) {
      const normalizedId = normalizedEmployeeId(employeeId);
      if (!normalizedId) throw new TypeError("Employee id is required");
      const at = normalizedDate(now);
      const [row] = await sql`
        UPDATE system_employee_auth_credentials
        SET auth_version = auth_version + 1, updated_at = ${at}
        WHERE employee_id = ${normalizedId}
        RETURNING auth_version`;
      return row ? { revoked: true, authVersion: Number(row.auth_version) } : { revoked: false, authVersion: 0 };
    },

    async close() {},
  };
}
