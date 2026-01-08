export const CERB_CURRENCY_TEXT = "CERB" as const;

/**
 * XRPL supports:
 * - 3-character standard currency codes (e.g. "USD")
 * - 160-bit (20-byte) hex currency codes for longer/nonstandard strings
 */
export function toXrplCurrencyCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error("Currency cannot be empty");

  // Standard 3-letter codes are allowed directly.
  if (trimmed.length === 3) return trimmed;

  // For nonstandard codes, encode as 20 bytes (40 hex chars).
  // Convention:
  // - Standard 3-letter codes map to bytes 12-14 (e.g. USD => ...5553440000...)
  // - For short text codes we place bytes starting at offset 12 and pad with trailing zeros.
  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length > 8) {
    throw new Error("Currency text too long; must be <= 8 bytes for this demo");
  }

  const buf = new Uint8Array(20);
  buf.set(bytes, 12);

  let hex = "";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

export function cerbCurrencyCode(): string {
  return toXrplCurrencyCode(CERB_CURRENCY_TEXT);
}
