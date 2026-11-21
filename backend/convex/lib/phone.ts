// Plain functions, no Convex imports, so tests can import them directly.

// Turns what a person types into an E.164 number Retell can dial, or null if
// it isn't one. A US number without a country code gets +1.
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  // Only digits and the usual separators are allowed.
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    // E.164 allows up to 15 digits after the +.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
