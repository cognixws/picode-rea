import { compareCodePoints, uniqueSorted } from "../canonicalOrdering.js";
import { canonicalExportShapeValue, digestExportShapeValue, } from "./javascriptExportShapeComparisonIdentity.js";
import { javaScriptExportShapeComparisonResultSchema, } from "./javascriptExportShapeComparisonSchemas.js";
import { retainJavaScriptExportShapes, selectJavaScriptExport, } from "./javascriptExportShapeSelection.js";
import { buildJavaScriptExportShapeChanges, hasPartialJavaScriptExportPropertyCoverage, pairJavaScriptExportShapeVariants, } from "./javascriptExportShapeVariants.js";
/** Compare exact selected export return shapes without executing JavaScript. */
export const compareJavaScriptExportShapes = (input) => {
    const left = selectJavaScriptExport(input.left);
    const right = selectJavaScriptExport(input.right);
    const leftRetained = retainJavaScriptExportShapes(left);
    const rightRetained = retainJavaScriptExportShapes(right);
    const pairing = pairJavaScriptExportShapeVariants(leftRetained.shapes, rightRetained.shapes);
    const evidenceLinks = evidencePair(input.left.evidenceId, input.right.evidenceId);
    const allChanges = sortChanges(buildJavaScriptExportShapeChanges({
        leftSelection: left,
        rightSelection: right,
        pairing,
        leftShapes: leftRetained.shapes,
        rightShapes: rightRetained.shapes,
        evidenceLinks,
    }));
    const changes = allChanges;
    const omittedChanges = 0;
    const coverage = comparisonCoverage({
        input,
        left,
        right,
        leftRetained,
        rightRetained,
        pairing,
        allChanges,
        omittedChanges,
    });
    const limitations = comparisonLimitations(left, right, coverage.status);
    const semantic = {
        left: left.selection,
        right: right.selection,
        summary: summarize(allChanges),
        changes,
        coverage,
        evidence_links: evidenceLinks,
        limitations,
    };
    return javaScriptExportShapeComparisonResultSchema.parse({
        ...semantic,
        comparison_id: `jesc_${digestExportShapeValue(semantic)}`,
    });
};
const sortChanges = (changes) => changes
    .map((change, index) => ({
    change,
    index,
    sortKey: canonicalExportShapeValue({
        discriminant: change.discriminant,
        path: change.path,
        status: change.status,
        left_source_range: change.left_source_range,
        right_source_range: change.right_source_range,
        change_id: change.change_id,
    }),
}))
    .sort((left, right) => compareCodePoints(left.sortKey, right.sortKey) ||
    left.index - right.index)
    .map(({ change }) => change);
const comparisonCoverage = (context) => {
    const leftSource = context.left.projection?.return_shape_coverage;
    const rightSource = context.right.projection?.return_shape_coverage;
    const omittedCandidates = context.left.selection.omitted_candidates +
        context.right.selection.omitted_candidates;
    const truncated = comparisonTruncated(context, omittedCandidates);
    const partial = comparisonPartial(context);
    return {
        status: truncated
            ? "truncated"
            : partial
                ? "partial"
                : "complete-within-inputs",
        left_graph_status: context.input.left.graph.coverage.status,
        right_graph_status: context.input.right.graph.coverage.status,
        paired_variants: context.pairing.pairs.length,
        unpaired_left_variants: context.pairing.unpairedLeft.length,
        unpaired_right_variants: context.pairing.unpairedRight.length,
        omitted_left_variants: context.leftRetained.omitted,
        omitted_right_variants: context.rightRetained.omitted,
        left_source_omitted_variants: leftSource?.omitted_return_sites ?? null,
        right_source_omitted_variants: rightSource?.omitted_return_sites ?? null,
        left_omitted_fields: leftSource?.omitted_fields ?? 0,
        right_omitted_fields: rightSource?.omitted_fields ?? 0,
        left_omitted_property_coverage: leftSource?.omitted_property_coverage ?? 0,
        right_omitted_property_coverage: rightSource?.omitted_property_coverage ?? 0,
        omitted_candidates: omittedCandidates,
        omitted_changes: context.omittedChanges,
    };
};
const comparisonTruncated = (context, omittedCandidates) => context.leftRetained.omitted > 0 ||
    context.rightRetained.omitted > 0 ||
    omittedCandidates > 0 ||
    context.omittedChanges > 0 ||
    sourceProjectionTruncated(context.left) ||
    sourceProjectionTruncated(context.right);
const sourceProjectionTruncated = (selection) => {
    const coverage = selection.projection?.return_shape_coverage;
    if (coverage === undefined)
        return false;
    return (coverage.status === "truncated" ||
        coverage.omitted_fields > 0 ||
        coverage.omitted_property_coverage > 0 ||
        coverage.projection_complete === false);
};
const comparisonPartial = (context) => selectionPartial(context.left) ||
    selectionPartial(context.right) ||
    context.input.left.graph.coverage.status !== "complete" ||
    context.input.right.graph.coverage.status !== "complete" ||
    hasPartialJavaScriptExportPropertyCoverage(context.leftRetained.shapes) ||
    hasPartialJavaScriptExportPropertyCoverage(context.rightRetained.shapes) ||
    context.pairing.unpairedLeft.length > 0 ||
    context.pairing.unpairedRight.length > 0 ||
    context.allChanges.some(({ status }) => status === "unknown");
const selectionPartial = (selection) => {
    const coverage = selection.projection?.return_shape_coverage;
    return (selection.selection.status !== "selected" ||
        !selection.observationComplete ||
        coverage?.status !== "complete" ||
        coverage.projection_complete !== true);
};
const comparisonLimitations = (left, right, status) => uniqueSorted([
    "Return shapes are inferred from inert syntax and do not prove runtime behavior.",
    "Return variants are paired only by unique exact literal discriminants, never by source order.",
    "Dynamic values, incomplete object coverage, and ambiguous variants remain unknown.",
    "This static comparison cannot establish runtime semantics; run behavioral probes directly against the relevant application versions when that evidence is required.",
    ...left.limitations,
    ...right.limitations,
    ...(status === "truncated"
        ? [
            "Comparison output or source return-shape recovery reached an explicit limit.",
        ]
        : []),
    ...(status === "partial"
        ? [
            "At least one selector, graph, return shape, or property boundary is incomplete.",
        ]
        : []),
]);
const summarize = (changes) => ({
    added: countStatus(changes, "added"),
    removed: countStatus(changes, "removed"),
    changed: countStatus(changes, "changed"),
    unknown: countStatus(changes, "unknown"),
});
const countStatus = (changes, status) => changes.filter((change) => change.status === status).length;
const evidencePair = (left, right) => [
    left,
    right,
];
