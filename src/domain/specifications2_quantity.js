export const SPECIFICATIONS2_QUANTITY_SCALE = 3;
export const SPECIFICATIONS2_QUANTITY_MAX = 99_999_999_999.999;
export const SPECIFICATIONS2_QUANTITY_MAX_SCALED = 99_999_999_999_999;

export function inspectSpecifications2Quantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return { valid: false, reason: "finite", quantity: null, scaled: null };
  if (quantity < 0) return { valid: false, reason: "nonnegative", quantity, scaled: null };

  // Number#toString exposes the exact canonical decimal that will enter the
  // v6 fingerprint. Parse that representation instead of rounding a binary
  // float: PostgreSQL NUMERIC(14,3) must store the exact same value.
  const decimal = String(quantity);
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(decimal);
  if (!match) return { valid: false, reason: "scale", quantity, scaled: null };
  const fraction = match[2] || "";
  if (fraction.length > SPECIFICATIONS2_QUANTITY_SCALE) {
    return { valid: false, reason: "scale", quantity, scaled: null };
  }
  const scaled = (Number(match[1]) * 1000) + Number(fraction.padEnd(SPECIFICATIONS2_QUANTITY_SCALE, "0") || "0");
  if (!Number.isSafeInteger(scaled) || scaled > SPECIFICATIONS2_QUANTITY_MAX_SCALED
    || scaled / 1000 !== quantity) {
    return { valid: false, reason: "range", quantity, scaled: null };
  }
  return { valid: true, reason: "", quantity, scaled };
}

export function assertSpecifications2Quantity(value, label = "Specifications 2.0 quantity") {
  const inspected = inspectSpecifications2Quantity(value);
  if (!inspected.valid) {
    throw new Error(`${label} must be exactly representable as NUMERIC(14,3) between 0 and ${SPECIFICATIONS2_QUANTITY_MAX}`);
  }
  return inspected.quantity;
}
