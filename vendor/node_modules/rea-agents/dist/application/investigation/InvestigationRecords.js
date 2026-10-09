import { createEvidence } from "../../domain/evidence.js";
import { EvidenceLedger } from "./EvidenceLedger.js";
import { UNKNOWN_REGISTRY_PROVIDER, unknownEvidenceLinks, unknownMutationEvidence, } from "./UnknownEvidence.js";
/** One investigation's validated record owner, independent of binary execution. */
export class InvestigationRecords {
    #evidence = new EvidenceLedger();
    /** Record immutable Evidence idempotently; reject conflicting content. */
    recordEvidence(evidence) {
        return this.#evidence.record(evidence);
    }
    /** Check one semantic Evidence ID without exposing stored values. */
    hasEvidence(evidenceId) {
        return this.#evidence.has(evidenceId);
    }
    /** Return a detached Evidence value for one semantic ID. */
    evidenceById(evidenceId) {
        return this.#evidence.get(evidenceId);
    }
    /** Borrow an immutable authenticated record for a read-only application workflow. */
    evidenceForAnalysis(evidenceId) {
        return this.#evidence.forAnalysis(evidenceId);
    }
    /** Export a detached deterministic bundle of Evidence and Unknown revisions. */
    exportEvidenceBundle() {
        return this.#evidence.export();
    }
    /** Borrow a sealed bundle snapshot for complete JSON serialization. */
    evidenceBundleForSerialization() {
        return this.#evidence.forSerialization();
    }
    /** Atomically merge a bundle and report changes for the owner's post-commit observers. */
    mergeEvidenceBundle(bundle) {
        return this.#evidence.import(bundle);
    }
    /** Clear records when the owning runtime applies its existing lifecycle policy. */
    clear() {
        this.#evidence.clear();
    }
    /** Record an Unknown with an explicitly supplied Evidence subject, if any. */
    recordUnknown(input, target) {
        const recorded = this.#evidence.recordUnknown(input, unknownMutationEvidence(target, input));
        return recorded;
    }
    /** Commit derived Evidence and its Unknown atomically without an implicit subject. */
    recordEvidenceWithUnknown(evidence, input) {
        const recorded = this.#evidence.recordWithUnknown(evidence, input, unknownMutationEvidence(undefined, input));
        return recorded;
    }
    /** Update an optimistic revision with an explicitly supplied Evidence subject. */
    updateUnknown(input, target) {
        const evidence = createEvidence(target, UNKNOWN_REGISTRY_PROVIDER, {
            predicateType: "rea.residual-unknown-mutation",
            operation: "update_unknown",
            parameters: {
                unknown_id: input.unknown_id,
                expected_revision: input.expected_revision,
            },
            result: { action: "update", status: input.status },
            confidence: "derived",
            authority: "analyst-inference",
            evidenceLinks: unknownEvidenceLinks(input),
            limitations: [
                "Registry mutation evidence records analyst intent, not proof of the answer.",
            ],
        });
        const updated = this.#evidence.updateUnknown(input, evidence);
        return updated;
    }
    /** Return detached current Unknown revisions matching the selected filters. */
    listUnknowns(filters = {}) {
        return this.#evidence.listUnknowns(filters);
    }
    /** Verify registry consistency without asserting the answer is true. */
    verifyUnknownResolution(unknownId) {
        return this.#evidence.verifyUnknownResolution(unknownId);
    }
}
