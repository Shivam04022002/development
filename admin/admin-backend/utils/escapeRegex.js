// utils/escapeRegex.js
//
// Escape a user-supplied string so it can be safely embedded in a RegExp as a
// literal. Prevents regex-injection and ReDoS via search/branch query params.
export function escapeRegex(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default escapeRegex;
