import * as t from "@babel/types";
import { compareCodePoints } from "../canonicalOrdering.js";
import { semanticPrimitiveKey } from "./javascriptSemanticProvenance.js";
import { readExactJavaScriptLiteral } from "./javascriptAstValues.js";
import { SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT, exceedsSemanticPrimitiveStringByteBudget, semanticResourceLimitUnknown, } from "./javascriptSemanticResourceLimits.js";
/**
 * Keep eight independent binary choices exact, while bounding the next
 * exponential expansion before it allocates hundreds more alternatives.
 */
export const MAX_SEMANTIC_PRIMITIVE_CANDIDATES = SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT;
/** Normalize one bounded collection of possible primitive values. */
export const semanticPrimitiveSet = (values) => {
    const uniqueValues = new Set();
    for (const value of values) {
        if (typeof value === "number" && !Number.isFinite(value))
            return {
                status: "unknown",
                reason: "Nonfinite numbers are outside the JSON primitive lattice.",
            };
        uniqueValues.add(value);
        if (uniqueValues.size > MAX_SEMANTIC_PRIMITIVE_CANDIDATES)
            return semanticResourceLimitUnknown("primitive-candidates");
    }
    if (exceedsSemanticPrimitiveStringByteBudget([...uniqueValues].flatMap((value) => typeof value === "string" ? [value] : [])))
        return semanticResourceLimitUnknown("primitive-bytes");
    const unique = [...uniqueValues]
        .map((value) => ({ key: semanticPrimitiveKey(value), value }))
        .sort((left, right) => compareCodePoints(left.key, right.key))
        .map(({ value }) => value);
    const only = unique[0];
    return unique.length === 1 && only !== undefined
        ? { status: "literal", value: only }
        : { status: "union", values: unique };
};
/** Read the primitive candidates retained in one lattice value. */
export const semanticPrimitiveCandidates = (value) => value.status === "literal"
    ? [value.value]
    : value.status === "union"
        ? value.values
        : null;
/** Parse one Babel primitive literal without evaluating code. */
export const semanticPrimitiveValue = (node) => {
    return readExactJavaScriptLiteral(node);
};
