import { z } from "zod";
/** Result of comparing a single dimension. */
export const dimensionResultSchema = z.strictObject({
    name: z.string().min(1),
    status: z.enum(["match", "mismatch", "unknown", "truncated"]),
    message: z.string().default(""),
    evidence_ids: z.array(z.string()).default([]),
});
const trustGateResultShape = {
    scenario_id: z.string().min(1),
    dimension_results: z.array(dimensionResultSchema),
};
const divergenceSchema = z.strictObject({
    dimension: z.string().min(1),
    evidence_id: z.string().min(1),
    message: z.string(),
});
/** Result of evaluating a trust gate for one scenario. */
export const trustGateResultSchema = z.union([
    z.strictObject({
        ...trustGateResultShape,
        verdict: z.enum(["pass", "unknown"]),
        first_divergence: z.null(),
    }),
    z.strictObject({
        ...trustGateResultShape,
        verdict: z.literal("fail"),
        first_divergence: divergenceSchema.nullable(),
    }),
]);
/** Dimension that is volatile due to timing or normalization. */
const VOLATILE_DIMENSIONS = new Set([
    "timing",
    "timestamp",
    "pid",
    "ppid",
    "duration_ms",
    "created_at",
    "updated_at",
]);
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const uniqueStrings = (values) => [
    ...new Set(values.filter((value) => value.length > 0)),
];
const stringValues = (value) => {
    if (typeof value === "string")
        return value.length > 0 ? [value] : [];
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === "string" && item.length > 0);
};
const evidenceIds = (record) => uniqueStrings([
    ...stringValues(record["evidence_id"]),
    ...stringValues(record["evidence_ids"]),
    ...stringValues(record["evidence_links"]),
]);
const incompleteStatus = (value) => {
    if (!isRecord(value))
        return null;
    const record = value;
    if (record["truncated"] === true)
        return "truncated";
    const status = record["status"];
    if (status === "truncated")
        return "truncated";
    if (status === "unknown" ||
        status === "unavailable" ||
        status === "partial" ||
        status === "incomplete" ||
        status === "unverifiable" ||
        status === "failed" ||
        status === "not_approved")
        return "unknown";
    for (const key of ["coverage", "completeness"]) {
        const nested = record[key];
        if (!isRecord(nested))
            continue;
        const nestedStatus = incompleteStatus(nested);
        if (nestedStatus !== null)
            return nestedStatus;
    }
    return null;
};
const hasResidualUnknowns = (value) => isRecord(value) &&
    Array.isArray(value["residual_unknowns"]) &&
    value["residual_unknowns"].length > 0;
const unknownScopes = (record) => {
    const residualUnknowns = record["residual_unknowns"];
    if (!Array.isArray(residualUnknowns))
        return [];
    return residualUnknowns.flatMap((item) => {
        if (!isRecord(item) || typeof item["scope"] !== "string")
            return [];
        return [item["scope"]];
    });
};
const evidenceView = (input) => {
    if (!isRecord(input))
        return {
            values: {},
            evidence_ids: [],
            status: null,
            unknown_scopes: [],
        };
    const normalized = input["normalized_result"];
    const values = isRecord(normalized) ? normalized : input;
    const normalizedStatus = isRecord(normalized)
        ? incompleteStatus(normalized)
        : null;
    return {
        values,
        evidence_ids: evidenceIds(input),
        status: incompleteStatus(input) ?? normalizedStatus,
        unknown_scopes: uniqueStrings([
            ...unknownScopes(input),
            ...(isRecord(normalized) ? unknownScopes(normalized) : []),
        ]),
    };
};
const dimensionScope = (dimensionName) => {
    if (dimensionName === "exit_code" || dimensionName === "exit")
        return "exit";
    if (dimensionName === "process" ||
        dimensionName === "process_tree" ||
        dimensionName === "event_journal")
        return "process";
    if (dimensionName === "stdout" || dimensionName === "stderr")
        return "terminal";
    if (dimensionName === "filesystem")
        return "filesystem";
    if (dimensionName === "shim_events")
        return "shim";
    if (dimensionName === "protocol_events")
        return "protocol";
    return null;
};
const statusForDimension = (view, dimensionName) => {
    const valueStatus = incompleteStatus(view.values[dimensionName]);
    if (valueStatus !== null)
        return valueStatus;
    if (hasResidualUnknowns(view.values[dimensionName]))
        return "unknown";
    const scope = dimensionScope(dimensionName);
    return scope !== null && view.unknown_scopes.includes(scope)
        ? "unknown"
        : view.status;
};
const comparisonIncompleteStatus = (expected, actual, options) => {
    const expectedStatus = options.expected_status ?? incompleteStatus(expected);
    const actualStatus = options.actual_status ?? incompleteStatus(actual);
    if (options.truncated)
        return "truncated";
    if (expectedStatus === "truncated" || actualStatus === "truncated")
        return "truncated";
    if (expectedStatus === "unknown" || actualStatus === "unknown")
        return "unknown";
    return null;
};
/** Check if a dimension name is volatile (timing/normalization noise). */
export function isVolatileDimension(name) {
    return VOLATILE_DIMENSIONS.has(name);
}
/**
 * Compare two values for a dimension, classifying semantic diffs
 * from timing/normalization noise.
 *
 * Volatile dimensions (timing, timestamps, PIDs) are always treated
 * as matches because their values are expected to differ across
 * runs and do not carry semantic meaning.
 */
export function compareDimension(dimensionName, expected, actual, options = {}) {
    // Volatile dimensions: always match regardless of values
    if (isVolatileDimension(dimensionName)) {
        return {
            name: dimensionName,
            status: "match",
            message: "volatile dimension ignored",
            evidence_ids: uniqueStrings(options.evidence_ids ?? []),
        };
    }
    const status = comparisonIncompleteStatus(expected, actual, options);
    const resultEvidenceIds = uniqueStrings(options.evidence_ids ?? []);
    if (status !== null) {
        return {
            name: dimensionName,
            status,
            message: status === "truncated"
                ? "evidence was truncated"
                : "evidence completeness is unknown",
            evidence_ids: resultEvidenceIds,
        };
    }
    if (expected === undefined && actual === undefined) {
        return {
            name: dimensionName,
            status: "unknown",
            message: "both expected and actual are undefined",
            evidence_ids: resultEvidenceIds,
        };
    }
    if (expected === undefined || actual === undefined) {
        return {
            name: dimensionName,
            status: "unknown",
            message: "one side has no observed value",
            evidence_ids: resultEvidenceIds,
        };
    }
    // Semantic comparison for structured objects
    if (typeof expected === "object" && typeof actual === "object") {
        const expectedJson = JSON.stringify(sortKeys(expected));
        const actualJson = JSON.stringify(sortKeys(actual));
        if (expectedJson === actualJson) {
            return {
                name: dimensionName,
                status: "match",
                message: "",
                evidence_ids: resultEvidenceIds,
            };
        }
        return {
            name: dimensionName,
            status: "mismatch",
            message: "semantic content differs",
            evidence_ids: resultEvidenceIds,
        };
    }
    // Primitive comparison
    if (expected === actual) {
        return {
            name: dimensionName,
            status: "match",
            message: "",
            evidence_ids: resultEvidenceIds,
        };
    }
    return {
        name: dimensionName,
        status: "mismatch",
        message: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        evidence_ids: resultEvidenceIds,
    };
}
/** Recursively sort object keys for deterministic comparison. */
function sortKeys(value) {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map(sortKeys);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]));
}
/**
 * Evaluate a trust gate for one scenario by comparing expected
 * evidence against the actual captured run.
 */
export function evaluateTrustGate(contract, expectedEvidence, actualEvidence, options = {}) {
    const dimensionResults = [];
    let firstDivergence = null;
    const expectedView = evidenceView(expectedEvidence);
    const actualView = evidenceView(actualEvidence);
    for (const dim of contract.dimensions) {
        if (!dim.required)
            continue;
        const expectedValue = expectedView.values[dim.name];
        const actualValue = actualView.values[dim.name];
        const result = compareDimension(dim.name, expectedValue, actualValue, {
            ...options,
            expected_status: statusForDimension(expectedView, dim.name),
            actual_status: statusForDimension(actualView, dim.name),
            evidence_ids: uniqueStrings([
                ...actualView.evidence_ids,
                ...expectedView.evidence_ids,
            ]),
        });
        dimensionResults.push(result);
        if (result.status === "mismatch" && firstDivergence === null) {
            firstDivergence = {
                dimension: dim.name,
                evidence_id: result.evidence_ids[0] ?? "unknown",
                message: result.message,
            };
        }
    }
    const hasFail = dimensionResults.some((r) => r.status === "mismatch" || r.status === "truncated");
    const hasUnknown = dimensionResults.some((r) => r.status === "unknown");
    const verdict = hasFail
        ? "fail"
        : hasUnknown
            ? "unknown"
            : "pass";
    return trustGateResultSchema.parse({
        scenario_id: contract.scenario_id,
        verdict,
        dimension_results: dimensionResults,
        first_divergence: firstDivergence,
    });
}
/**
 * Evaluate trust gates for all scenarios in a conformance package.
 * Rejects runs that differ in required dimensions. Unknown/truncated
 * evidence is never treated as equivalence.
 */
export function evaluatePackageTrustGates(pkg, actualEvidence, options = {}) {
    const results = [];
    for (const contract of pkg.verifier_contracts) {
        const expected = pkg.expected_evidence.find((e) => e.scenario_id === contract.scenario_id);
        if (expected === undefined)
            throw new TypeError(`Parsed conformance package is missing expected evidence for ${contract.scenario_id}`);
        const expectedEvidence = expected.envelopes[0] ?? {};
        const actual = actualEvidence[contract.scenario_id] ?? {};
        const result = evaluateTrustGate(contract, expectedEvidence, actual, options);
        results.push(result);
    }
    return results;
}
