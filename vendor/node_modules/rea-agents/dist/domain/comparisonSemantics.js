import canonicalize from "canonicalize";
import { digestCanonicalValue } from "./canonicalDigest.js";
/** Whether an inventory can support a claim that an item is absent. */
export const absenceClaimable = (coverage) => coverage.status === "complete" &&
    coverage.truncated !== true &&
    (coverage.omitted_count === undefined || coverage.omitted_count === 0);
/** SHA-256 of canonical JSON for stable, provider-neutral comparison IDs. */
export const canonicalDigest = (value, context = "Comparison") => {
    return digestCanonicalValue(value, context);
};
/** Canonical JSON used for deterministic tie breaking and stable digests. */
export const canonicalJson = (value, context = "Comparison") => {
    const encoded = canonicalize(value);
    if (encoded === undefined)
        throw new TypeError(`${context} could not canonicalize data`);
    return encoded;
};
