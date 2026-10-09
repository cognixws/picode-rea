import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { parseEvidenceBundle, } from "../domain/evidenceBundle.js";
import { parseProcessCapture } from "../domain/process/processCapture.js";
import { parseApplicationGraphEvidence } from "./javascript/JavaScriptApplicationEvidenceGraph.js";
import { applicationObligationPolicy, semanticObligationPolicy, } from "./ReconstructionObligationPolicies.js";
/** Derive conservative candidates from graph, process, and reviewed inputs. */
export const deriveReconstructionObligationCandidates = (bundleInput, reviewed) => {
    const bundle = parseEvidenceBundle(bundleInput);
    const records = new Map(bundle.records.map((record) => [record.evidence_id, record]));
    const candidates = new Map();
    const limitations = new Set();
    for (const evidence of bundle.records) {
        deriveApplicationCandidates(evidence, records, candidates, limitations);
        deriveProcessCandidate(evidence, candidates, limitations);
    }
    for (const obligation of reviewed)
        addCandidate(candidates, reviewedCandidate(obligation, records));
    return {
        candidates: [...candidates.values()].sort((left, right) => left.obligation_id.localeCompare(right.obligation_id)),
        limitations: [...limitations].sort(),
    };
};
const deriveApplicationCandidates = (evidence, records, candidates, limitations) => {
    if (![
        "analyze_javascript_application",
        "reconcile_javascript_runtime",
        "project_managed_application_graph",
    ].includes(evidence.operation))
        return;
    try {
        const source = parseApplicationGraphEvidence(evidence);
        for (const node of source.graph.nodes) {
            const candidatePolicy = applicationObligationPolicy(node.kind);
            if (candidatePolicy === undefined) {
                if (node.kind === "unknown")
                    limitations.add(`Application graph ${source.graph.graph_id} contains unresolved node ${node.node_id}; reconstruction obligations remain unknown.`);
                continue;
            }
            const reference = node.observations.map((observation) => graphReference(evidence, records, observation.evidence, `${source.graph.graph_id}/node/${node.node_id}/observation/${observation.observation_id}`));
            addCandidate(candidates, generatedCandidate({
                key: `application:${node.node_id}:${candidatePolicy.family}`,
                title: node.observations[0]?.label ?? `${node.kind} boundary`,
                policy: candidatePolicy,
                artifactSha256: source.rootArtifactSha256,
                applicationNodeId: node.node_id,
                semanticNodeId: null,
                location: `application-graph:${source.graph.graph_id}/nodes/${node.node_id}`,
                authorityReferences: reference,
            }));
        }
        if (source.semanticGraph !== null)
            for (const node of source.semanticGraph.nodes) {
                const candidatePolicy = semanticObligationPolicy(node.kind);
                if (candidatePolicy === undefined)
                    continue;
                addCandidate(candidates, generatedCandidate({
                    key: `semantic:${node.node_id}:${candidatePolicy.family}`,
                    title: node.label ?? `${node.kind} semantic boundary`,
                    policy: candidatePolicy,
                    artifactSha256: node.identity.artifact_sha256,
                    applicationNodeId: node.application_node_ids[0] ?? null,
                    semanticNodeId: node.node_id,
                    location: `semantic-graph:${source.semanticGraph.graph_id}/nodes/${node.node_id}`,
                    authorityReferences: [
                        graphReference(evidence, records, node.evidence, `${source.semanticGraph.graph_id}/node/${node.node_id}`),
                    ],
                }));
            }
        if (source.graph.coverage.status !== "complete")
            limitations.add(`Application graph ${source.graph.graph_id} coverage is ${source.graph.coverage.status}; omitted candidates remain unknown.`);
    }
    catch (cause) {
        limitations.add(`Application Evidence ${evidence.evidence_id} could not generate candidates: ${errorMessage(cause)}`);
    }
};
const deriveProcessCandidate = (evidence, candidates, limitations) => {
    if (evidence.operation !== "capture_process_scenario" ||
        evidence.predicate_type !== "rea.process-capture")
        return;
    try {
        const capture = parseProcessCapture(evidence.normalized_result);
        const observedCases = [
            {
                kind: capture.exit.code === 0 ? "positive" : "negative",
                evidence_id: evidence.evidence_id,
                location: "/normalized_result/exit",
            },
            {
                kind: "teardown",
                evidence_id: evidence.evidence_id,
                location: "/normalized_result/settlement",
            },
            ...(capture.exit.signal !== null || capture.exit.reason !== "exited"
                ? [
                    {
                        kind: "cancellation",
                        evidence_id: evidence.evidence_id,
                        location: "/normalized_result/exit",
                    },
                ]
                : []),
        ];
        if (capture.manifest.executable_sha256 === null) {
            limitations.add(`Process capture ${evidence.evidence_id} has no validated executable artifact identity; packaged-process lifecycle obligation was not bound to an artifact.`);
            return;
        }
        addCandidate(candidates, {
            obligation_id: obligationId(`process:${capture.manifest.executable_sha256}:${capture.manifest.full_scenario_sha256}`),
            obligation_version: 1,
            title: "Captured packaged-process lifecycle",
            origin: "generated",
            application_layer: "process",
            family: "packaged-process-lifecycle",
            target: {
                artifact_sha256: capture.manifest.executable_sha256,
                application_node_id: null,
                semantic_node_id: null,
                location: `/evidence/${evidence.evidence_id}/normalized_result`,
            },
            authority_references: [
                {
                    evidence_id: evidence.evidence_id,
                    authority: evidence.authority,
                    state: "observed",
                    location: "/normalized_result",
                },
            ],
            source_state: "observed",
            observed_cases: observedCases,
            required: true,
            required_case_kinds: ["positive", "negative", "cancellation", "teardown"],
            required_original_authority: "process",
            required_fixture_authority: "packaged-process",
            required_verifier_authority: "packaged-process",
            requires_parser_type: false,
            dependency_obligation_ids: [],
            residual_unknown_ids: [],
            unavailable_authority: capture.residual_unknowns.map(({ scope, reason }) => `${scope}: ${reason}`),
            required_next_evidence: capture.truncated
                ? ["Repeat the packaged-process capture without truncation."]
                : [],
            definitionCount: 1,
            disposition: "active",
        });
        if (capture.truncated)
            limitations.add(`Process Evidence ${evidence.evidence_id} is truncated; absence and upper bounds remain unknown.`);
    }
    catch (cause) {
        limitations.add(`Process Evidence ${evidence.evidence_id} could not generate candidates: ${errorMessage(cause)}`);
    }
};
const generatedCandidate = ({ key, title, policy: candidatePolicy, artifactSha256, applicationNodeId, semanticNodeId, location, authorityReferences, }) => ({
    obligation_id: obligationId(key),
    obligation_version: 1,
    title,
    origin: "generated",
    application_layer: candidatePolicy.applicationLayer,
    family: candidatePolicy.family,
    target: {
        artifact_sha256: artifactSha256,
        application_node_id: applicationNodeId,
        semantic_node_id: semanticNodeId,
        location,
    },
    authority_references: authorityReferences,
    source_state: sourceState(authorityReferences),
    observed_cases: [],
    required: true,
    required_case_kinds: candidatePolicy.cases,
    required_original_authority: candidatePolicy.originalAuthority,
    required_fixture_authority: candidatePolicy.fixtureAuthority,
    required_verifier_authority: candidatePolicy.verifierAuthority,
    requires_parser_type: candidatePolicy.requiresParserType,
    dependency_obligation_ids: [],
    residual_unknown_ids: [],
    unavailable_authority: [],
    required_next_evidence: [
        `Obtain ${candidatePolicy.originalAuthority} authority for this finite ${candidatePolicy.family} claim.`,
    ],
    definitionCount: 1,
    disposition: "active",
});
const reviewedCandidate = (obligation, records) => {
    const { review_evidence_ids: reviewEvidenceIds, disposition, ...definition } = obligation;
    return {
        ...definition,
        origin: "reviewed",
        authority_references: reviewEvidenceIds.map((evidenceId) => {
            const evidence = records.get(evidenceId);
            if (evidence === undefined)
                throw new TypeError(`Reviewed obligation Evidence is missing: ${evidenceId}`);
            return {
                evidence_id: evidenceId,
                authority: evidence.authority,
                state: reviewedEvidenceState(evidence),
                location: `/evidence/${evidenceId}`,
            };
        }),
        source_state: "reviewed",
        observed_cases: [],
        definitionCount: 1,
        disposition,
    };
};
const graphReference = (envelope, records, graphEvidence, location) => {
    const linkedId = graphEvidence.evidence_ids.find((evidenceId) => records.has(evidenceId)) ??
        envelope.evidence_id;
    const linked = records.get(linkedId) ?? envelope;
    const runtimeAuthority = [
        "passive-cdp-runtime",
        "controlled-replay",
    ].includes(graphEvidence.authority);
    return {
        evidence_id: linked.evidence_id,
        authority: linked.authority,
        state: runtimeAuthority && graphEvidence.state === "observed"
            ? "observed"
            : graphEvidence.state === "unknown" ||
                graphEvidence.state === "unavailable"
                ? "unknown"
                : "candidate",
        location,
    };
};
const reviewedEvidenceState = (evidence) => {
    if (evidence.operation === "capture_process_scenario" &&
        evidence.predicate_type === "rea.process-capture" &&
        evidence.confidence === "observed")
        return "observed";
    if (evidence.authority === "external-service" &&
        evidence.confidence === "observed")
        return "observed";
    if (evidence.authority === "shipped-artifact")
        return "candidate";
    return "reviewed";
};
const addCandidate = (candidates, candidate) => {
    const current = candidates.get(candidate.obligation_id);
    if (current === undefined) {
        candidates.set(candidate.obligation_id, candidate);
        return;
    }
    candidates.set(candidate.obligation_id, {
        ...current,
        authority_references: uniqueBy([...current.authority_references, ...candidate.authority_references], (reference) => `${reference.evidence_id}:${reference.state}:${reference.location}`),
        observed_cases: uniqueBy([...current.observed_cases, ...candidate.observed_cases], (item) => `${item.kind}:${item.evidence_id}:${item.location}`),
        source_state: sourceState([
            ...current.authority_references,
            ...candidate.authority_references,
        ]),
        definitionCount: current.definitionCount + candidate.definitionCount,
    });
};
const sourceState = (references) => {
    if (references.some(({ state }) => state === "observed"))
        return "observed";
    if (references.some(({ state }) => state === "candidate"))
        return "candidate";
    if (references.some(({ state }) => state === "reviewed"))
        return "reviewed";
    return "unknown";
};
const uniqueBy = (values, key) => [...new Map(values.map((value) => [key(value), value])).values()].sort((left, right) => key(left).localeCompare(key(right)));
const obligationId = (key) => `obl_${digest({ schema: "ReconstructionObligation", key })}`;
const digest = (value) => {
    const encoded = canonicalize(value);
    if (encoded === undefined)
        throw new TypeError("Reconstruction obligation key is not canonical JSON");
    return createHash("sha256").update(encoded).digest("hex");
};
const errorMessage = (cause) => cause instanceof Error ? cause.message : "unknown validation failure";
