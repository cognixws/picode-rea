import { projectedExportReturnShapesSchema, } from "./javascriptExportShapeComparisonSchemas.js";
import { compareCodePoints } from "../canonicalOrdering.js";
/** Select one exact trusted export and its exact static return-shape observation. */
export const selectJavaScriptExport = (side) => {
    const candidates = exportCandidates(side.graph);
    const exact = candidates.filter(({ modulePath, exportName }) => modulePath === side.modulePath && exportName === side.exportName);
    const matchingOneSelector = candidates.filter(({ modulePath, exportName }) => modulePath === side.modulePath || exportName === side.exportName);
    const diagnosticPool = exact.length > 0
        ? exact
        : matchingOneSelector.length > 0
            ? matchingOneSelector
            : candidates;
    const base = selectorBase(side, diagnosticPool);
    if (exact.length === 0)
        return unresolvedSelection(base, { status: "missing", selected_node_id: null }, [
            `No exact export binding matched ${side.modulePath}:${side.exportName}.`,
        ]);
    if (exact.length > 1)
        return unresolvedSelection(base, { status: "ambiguous", selected_node_id: null }, [
            `Multiple exact export bindings matched ${side.modulePath}:${side.exportName}; none was selected.`,
        ]);
    const selected = exact[0];
    if (selected === undefined || !selected.trusted)
        return unresolvedSelection(base, {
            status: "unavailable",
            selected_node_id: selected?.node.node_id ?? null,
        }, [
            "The exact export binding lacks the expected static-analysis authority.",
        ]);
    const returnShape = returnShapeFor(selected.node, side);
    if (returnShape.projection === null)
        return unresolvedSelection(base, { status: "unavailable", selected_node_id: selected.node.node_id }, [returnShape.reason]);
    return {
        selection: {
            ...base,
            status: "selected",
            selected_node_id: selected.node.node_id,
        },
        projection: returnShape.projection,
        observationComplete: returnShape.observationComplete,
        limitations: [],
    };
};
/** Retain every projected return variant. */
export const retainJavaScriptExportShapes = (selection) => {
    const shapes = selection.projection?.static_return_shapes ?? [];
    return { shapes, omitted: 0 };
};
const selectorBase = (side, candidates) => ({
    evidence_id: side.evidenceId,
    graph_id: side.graph.graph_id,
    requested_module_path: side.modulePath,
    requested_export_name: side.exportName,
    candidates: candidates.map((candidate) => ({
        node_id: candidate.node.node_id,
        module_path: candidate.modulePath,
        export_name: candidate.exportName,
        matches_requested_module: candidate.modulePath === side.modulePath,
        matches_requested_export: candidate.exportName === side.exportName,
    })),
    omitted_candidates: 0,
});
const unresolvedSelection = (base, resolution, limitations) => ({
    selection: { ...base, ...resolution },
    projection: null,
    observationComplete: false,
    limitations,
});
const exportCandidates = (graph) => {
    const candidates = new Map();
    for (const node of graph.nodes) {
        for (const observation of node.observations) {
            const properties = observation.properties;
            if (properties.semantic_role !== "export-binding")
                continue;
            const modulePath = properties.module_path;
            const exportName = properties.exported_name;
            if (typeof modulePath !== "string" || typeof exportName !== "string")
                continue;
            const key = `${node.node_id}\0${modulePath}\0${exportName}`;
            const trusted = observation.evidence.authority === "ast-static-analysis" &&
                observation.evidence.state === "observed" &&
                observation.evidence.extractor.operation === "recover-module-export";
            const existing = candidates.get(key);
            candidates.set(key, {
                node,
                modulePath,
                exportName,
                trusted: trusted || existing?.trusted === true,
            });
        }
    }
    return [...candidates.values()].sort((left, right) => compareCodePoints(candidateKey(left), candidateKey(right)));
};
const candidateKey = (candidate) => `${candidate.modulePath}\0${candidate.exportName}\0${candidate.node.node_id}`;
const returnShapeFor = (node, side) => {
    const roleObservations = node.observations.filter(({ properties }) => properties.semantic_role === "export-return-shapes");
    const parsed = roleObservations.map((observation) => ({
        observation,
        result: projectedExportReturnShapesSchema.safeParse(observation.properties),
    }));
    if (parsed.some(({ result }) => !result.success))
        return unavailableReturnShape("The export return-shape observation is malformed.");
    const matching = parsed.filter(({ result }) => result.success &&
        result.data.module_path === side.modulePath &&
        result.data.exported_name === side.exportName);
    if (matching.length !== 1)
        return unavailableReturnShape(matching.length === 0
            ? "No exact static return-shape observation is available for the selected export."
            : "Multiple static return-shape observations matched the selected export.");
    const selected = matching[0];
    if (selected === undefined || !selected.result.success)
        return unavailableReturnShape("The selected return-shape observation could not be parsed.");
    const { observation } = selected;
    const trusted = observation.evidence.authority === "static-relationship-inference" &&
        observation.evidence.state === "inferred" &&
        observation.evidence.extractor.operation === "recover-export-return-shapes";
    if (!trusted)
        return unavailableReturnShape("The return-shape observation lacks the expected static-inference authority.");
    return {
        projection: selected.result.data,
        observationComplete: observation.evidence.coverage.status === "complete" &&
            !observation.evidence.coverage.truncated,
    };
};
const unavailableReturnShape = (reason) => ({
    projection: null,
    observationComplete: false,
    reason,
});
