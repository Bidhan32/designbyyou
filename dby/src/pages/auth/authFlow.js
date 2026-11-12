export const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
export function passwordError(value) {
  if (value.length < 8) return "Use at least 8 characters for your password.";
  if (new TextEncoder().encode(value).length > 72) return "This password is too long. Use a shorter password (up to 72 bytes; some characters use more than one).";
  return "";
}
export function readSession(key) { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } }
export function saveSession(key, value) {
  try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* Router state still supports the flow. */ }
}
