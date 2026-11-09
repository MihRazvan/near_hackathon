import { createHash, randomBytes } from "node:crypto";

export class AppError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const fail = (code, message, status) => {
  throw new AppError(code, message, status);
};
export function assert(condition, code, message, status) {
  if (!condition) fail(code, message, status);
}
export function uint(value, name = "amount") {
  assert(
    typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value),
    "INVALID_INTEGER",
    `${name} must be an integer string`,
    400,
  );
  const number = BigInt(value);
  assert(
    number < 2n ** 128n,
    "INVALID_INTEGER",
    `${name} exceeds supported range`,
    400,
  );
  return number;
}
export function units(value, decimals) {
  assert(
    typeof value === "string" && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value),
    "INVALID_DECIMAL",
    "Use a decimal string",
    400,
  );
  const [whole, fraction = ""] = value.split(".");
  assert(
    fraction.length <= decimals,
    "INVALID_DECIMAL",
    "Too many decimal places",
    400,
  );
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  ).toString();
}
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    assert(
      Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null,
      "INVALID_JSON",
      "Plain JSON objects required",
      400,
    );
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  }
  assert(
    value === null ||
      ["string", "boolean"].includes(typeof value) ||
      (typeof value === "number" && Number.isFinite(value)),
    "INVALID_JSON",
    "JSON value required",
    400,
  );
  return JSON.stringify(value);
}
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const hashObject = (value) => sha256(canonical(value));
export const randomToken = () => randomBytes(32).toString("base64url");
export function walletId(value) {
  assert(
    typeof value === "string",
    "INVALID_WALLET",
    "Wallet address required",
    400,
  );
  if (/^0x[0-9a-f]{40}$/i.test(value)) return value.toLowerCase();
  assert(
    value.length >= 2 &&
      value.length <= 64 &&
      /^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/.test(value),
    "INVALID_WALLET",
    "Invalid NEAR account or EVM address",
    400,
  );
  return value;
}
export const nowIso = () => new Date().toISOString();
export function text(value, name, max = 2000) {
  assert(
    typeof value === "string" && value.trim().length > 0 && value.length <= max,
    "INVALID_TEXT",
    `${name} is required and must be at most ${max} characters`,
    400,
  );
  return value.trim();
}
