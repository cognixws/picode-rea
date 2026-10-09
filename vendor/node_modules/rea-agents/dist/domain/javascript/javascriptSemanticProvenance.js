import { compareCodePoints } from "../canonicalOrdering.js";
/** Construct exact local provenance without inventing module origins. */
export const semanticLocalProvenance = () => ({
    status: "local",
    origins: [],
    reason: null,
});
/** Construct an unresolved provenance outcome with an actionable reason. */
export const semanticUnresolvedProvenance = (status, reason) => ({ status, origins: [], reason });
/** Construct ambiguous provenance while retaining every origin. */
export const semanticAmbiguousProvenance = (origins, reason) => ({ status: "ambiguous", origins, reason });
/** Normalize exact module origins into one provenance classification. */
export const semanticOriginsProvenance = (origins) => {
    const unique = uniqueSemanticOrigins(origins);
    const origin = unique[0];
    return unique.length === 1 && origin !== undefined
        ? { status: "module", origins: [origin], reason: null }
        : semanticAmbiguousProvenance(unique, "Multiple module origins.");
};
/** Deduplicate and canonically order module origins. */
export const uniqueSemanticOrigins = (origins) => [
    ...new Map(origins.map((origin) => [semanticOriginKey(origin), origin])).values(),
].sort((left, right) => compareCodePoints(semanticOriginKey(left), semanticOriginKey(right)));
const semanticOriginKey = (origin) => `${origin.specifier}\0${origin.importedPath.join("\0")}`;
/** Canonically distinguish primitive values across type boundaries. */
export const semanticPrimitiveKey = (value) => `${value === null ? "null" : typeof value}:${JSON.stringify(value)}`;
/** Match namespace paths only after the caller has identified a Node built-in. */
export const semanticBuiltinNamespacePath = (importedPath) => importedPath.length === 0 ||
    (importedPath.length === 1 && importedPath[0] === "default");
