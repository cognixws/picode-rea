import { completeApplicationCoverage, partialApplicationCoverage, } from "../../domain/javascript/javascriptApplicationEvidenceSchemas.js";
import { JavaScriptArtifactGraphAccumulator } from "./JavaScriptArtifactGraphAccumulator.js";
import { artifactObservationEvidence, astObservationEvidence, staticInferenceEvidence, unavailableAstEvidence, } from "./JavaScriptArtifactGraphEvidence.js";
import { resolveArtifactPathByContext, } from "./JavaScriptArtifactPathResolution.js";
/** Add a direct artifact-containment edge. */
export const addArtifactContainsEdge = (context, input) => {
    context.accumulator.addEdge({
        source_node_id: input.source.node_id,
        target_node_id: input.target.node_id,
        relation: "contains",
        properties: { path: input.file.path },
        evidence: artifactObservationEvidence({
            sha256: input.operation === "inventory-entry"
                ? input.file.container_sha256
                : input.file.sha256,
            path: input.file.path,
            operation: input.operation,
            coverage: completeApplicationCoverage(),
        }),
    });
};
/** Add an exact AST containment edge. */
export const addAstContainsEdge = (context, input) => {
    context.accumulator.addEdge({
        source_node_id: input.source.node_id,
        target_node_id: input.target.node_id,
        relation: "contains",
        properties: input.properties,
        evidence: astObservationEvidence({
            sha256: input.file.sha256,
            path: input.file.path,
            range: input.range,
            operation: "map-bundler-structure",
            coverage: input.coverage,
        }),
    });
};
/** Add an explicitly inferred static relationship edge. */
export const addStaticInferenceEdge = (context, input) => {
    context.accumulator.addEdge({
        source_node_id: input.source.node_id,
        target_node_id: input.target.node_id,
        relation: input.relation,
        properties: input.properties,
        evidence: staticInferenceEvidence({
            sha256: input.file.sha256,
            path: input.file.path,
            range: input.range,
            operation: "map-static-relationship",
            coverage: input.coverage,
        }),
    });
};
/** Preserve a static parse or approval gap as an explicit unknown scope. */
export const addUnavailableStaticParseScope = (context, input) => {
    const node = context.accumulator.addNode({
        kind: "unknown",
        identity: artifactLocalIdentity(input.file.sha256, "static-parse-scope", `${input.operation}:${input.file.path}`),
        observations: [
            {
                label: `${input.file.path} parse scope`,
                properties: {
                    path: input.file.path,
                    operation: input.operation,
                    limitation: input.limitation,
                },
                evidence: unavailableAstEvidence({
                    sha256: input.file.sha256,
                    path: input.file.path,
                    operation: input.operation,
                    coverage: partialApplicationCoverage([], null),
                    limitation: input.limitation,
                }),
            },
        ],
    });
    context.accumulator.addEdge({
        source_node_id: input.asset.node_id,
        target_node_id: node.node_id,
        relation: "contains",
        properties: { scope: "unavailable-static-analysis" },
        evidence: artifactObservationEvidence({
            sha256: input.file.sha256,
            path: input.file.path,
            operation: "associate-unavailable-parse-scope",
            coverage: completeApplicationCoverage(),
        }),
    });
};
/** Coverage for one bounded JavaScript AST analysis. */
export const javascriptAnalysisCoverage = (analysis) => analysis.parse_status === "complete"
    ? completeApplicationCoverage()
    : partialApplicationCoverage([], null);
/** Stable identity for a fact scoped to one exact artifact. */
export const artifactLocalIdentity = (sha256, namespace, key) => ({
    strategy: "artifact-local-key",
    stability: "artifact-version",
    artifact_sha256: sha256,
    namespace,
    key,
});
/** Select the graph node kind for one inventoried relevant file. */
export const artifactFileNodeKind = (kind) => kind === "javascript"
    ? "javascript-asset"
    : kind === "source-map"
        ? "source-map"
        : kind === "native-addon"
            ? "native-addon"
            : "artifact";
/** Create or merge an Electron role inferred from static syntax or metadata. */
export const createElectronRoleNode = (context, input) => context.accumulator.addNode({
    kind: input.kind,
    identity: artifactLocalIdentity(input.anchor.sha256, "electron-role", `${input.kind}:${input.resolution.resolution_context}:${input.resolution.resolved_path ?? input.resolution.declared_path}`),
    observations: [
        {
            label: input.resolution.resolved_path ?? input.resolution.declared_path,
            properties: {
                declared_path: input.resolution.declared_path,
                resolution_context: input.resolution.resolution_context,
                resolved_path: input.resolution.resolved_path,
                resolution_status: input.resolution.resolution_status,
                limitations: input.resolution.limitations,
                mechanism: input.mechanism,
            },
            evidence: staticInferenceEvidence({
                sha256: input.anchor.sha256,
                path: input.anchor.path,
                operation: "discover-electron-entrypoint",
                coverage: input.coverage ?? completeApplicationCoverage(),
                limitations: input.resolution.limitations,
                ...(input.range === undefined ? {} : { range: input.range }),
            }),
        },
    ],
});
/** Resolve an Electron role to an inventoried asset when available. */
export const linkElectronRoleToAsset = (context, input) => {
    const path = input.resolution.resolved_path;
    if (path === null)
        return;
    const asset = context.assetNodes.get(path) ?? context.fileNodes.get(path);
    if (asset === undefined)
        return;
    context.accumulator.addEdge({
        source_node_id: input.role.node_id,
        target_node_id: asset.node_id,
        relation: "maps_to",
        properties: {
            declared_path: input.resolution.declared_path,
            resolution_context: input.resolution.resolution_context,
            resolved_path: path,
            resolution_status: input.resolution.resolution_status,
        },
        evidence: staticInferenceEvidence({
            sha256: input.anchor.sha256,
            path: input.anchor.path,
            operation: "resolve-electron-entrypoint",
            coverage: input.coverage ?? completeApplicationCoverage(),
            limitations: input.resolution.limitations,
            ...(input.range === undefined ? {} : { range: input.range }),
        }),
    });
};
/** Deterministic key for one recovered module inside a bundle asset. */
export const moduleLookupKey = (path, moduleKey) => `${path}\0${moduleKey}`;
/** Deterministic key for one recovered bundler chunk inside a bundle asset. */
export const chunkLookupKey = (path, runtime, chunkKey) => `${path}\0${runtime}\0${chunkKey}`;
/** Resolve a relative static specifier without escaping the artifact root. */
export const resolveArtifactPath = (specifier, sourcePath, files, moduleKind) => resolveArtifactPathByContext({
    declaredPath: specifier,
    sourcePath,
    context: "module-specifier",
    files,
    ...(moduleKind === undefined ? {} : { moduleKind }),
}).resolved_path;
/** Locate the recovered module that owns a static finding. */
export const sourceNodeFor = (context, path, moduleKey) => moduleKey === null
    ? context.sourceModuleNodes.get(path)
    : context.moduleNodes.get(moduleLookupKey(path, moduleKey));
