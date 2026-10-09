/**
 * Pure string predicates for artifact path syntax. The local artifact
 * resolver, the Electron native specifier check, and (by reference) the
 * live-DOM and source-map URL handling share these character-level rules.
 *
 * Policy divergence (deliberate, not yet unified):
 * - Local artifact paths resolve against an inventoried container root and
 *   report rejected | external | not-found. Confinement is lexical
 *   (posix.normalize must stay inside the root).
 * - Live DOM destinations resolve against the document base URL and report
 *   approved | outside_policy | unsupported against allowedOrigins
 *   (see CdpCaptureDocuments.domDestination).
 * - Source-map fetches require exact-origin http(s) without credentials
 *   (see WebSourceMapFetcher.approvedUrl).
 * Unifying those outcome vocabularies is a separate, observable change.
 */
/** Whether a reference carries a URI scheme (`https:`, `file:`, …). */
export const hasScheme = (value) => /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
/** Whether a reference is scheme-qualified or protocol-relative. */
export const looksExternal = (value) => hasScheme(value) || value.startsWith("//");
/** Drop any query string and fragment from a declared reference. */
export const stripQueryAndFragment = (value) => value.split("#", 1)[0]?.split("?", 1)[0] ?? "";
/** Path syntax admitted for a canonical artifact path. */
export const admitsCanonicalPathSyntax = (value) => !value.includes("\0") &&
    !value.includes("\\") &&
    !/%(?:2e|2f|5c)/iu.test(value);
