import canonicalize from "canonicalize";
import { createEvidenceBundle, createImmutableEvidenceBundle, describeEvidenceBundleFailure, parseEvidenceBundle, validateResidualUnknownAddition, } from "../../domain/evidenceBundle.js";
import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import { UnknownRegistryError } from "../../domain/unknownRegistryError.js";
import { immutableEvidence, parseEvidence, } from "../../domain/evidence.js";
import { createResidualUnknown, updateResidualUnknown, } from "../../domain/residualUnknown.js";
import { err, ok } from "../../domain/result.js";
/** Session-owned set of immutable evidence records. */
export class EvidenceLedger {
    #records = new Map();
    #unknownRevisions = new Map();
    #unknownHeads = new Map();
    /** Record evidence idempotently; conflicting content is rejected. */
    record(input) {
        let evidence;
        try {
            evidence = immutableEvidence(input);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError("Evidence record validation failed", {
                cause,
            }));
        }
        const existing = this.#records.get(evidence.evidence_id);
        if (existing !== undefined) {
            // A borrowed record is already authenticated and deeply immutable. Its
            // identity cannot change between reads, so comparing document-sized
            // canonical strings again would add no integrity check.
            if (existing === evidence)
                return ok("duplicate");
            return recordsAgree(existing, evidence)
                ? ok("duplicate")
                : err(new EvidenceIntegrityError("Conflicting evidence record"));
        }
        this.#records.set(evidence.evidence_id, evidence);
        return ok("added");
    }
    /** Validate an entire bundle before atomically merging its records. */
    import(input) {
        let bundle;
        try {
            bundle = parseEvidenceBundle(input);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError("Evidence bundle validation failed", {
                cause,
                userMessage: describeEvidenceBundleFailure(input, cause),
            }));
        }
        // A record-only bundle cannot change the already-valid unknown graph. The
        // bundle parser has validated every incoming record and its manifests, so
        // checking ID conflicts and committing only the additions preserves the
        // atomic merge without rebuilding and reparsing the entire ledger.
        if (bundle.unknowns.length === 0) {
            const additions = new Map();
            const replacements = new Map();
            let metadataChanged = false;
            for (const evidence of bundle.records) {
                const existing = this.#records.get(evidence.evidence_id);
                if (existing !== undefined) {
                    if (!recordsAgree(existing, evidence))
                        return err(new EvidenceIntegrityError("Conflicting evidence record"));
                    if (canonicalize(existing) !== canonicalize(evidence)) {
                        replacements.set(evidence.evidence_id, evidence);
                        metadataChanged = true;
                    }
                    continue;
                }
                additions.set(evidence.evidence_id, evidence);
            }
            for (const [id, evidence] of replacements)
                this.#records.set(id, immutableEvidence(evidence));
            for (const [id, evidence] of additions)
                this.#records.set(id, immutableEvidence(evidence));
            return ok({
                recordsAdded: additions.size,
                unknownsAdded: 0,
                changed: additions.size > 0 || metadataChanged,
                metadataChanged,
            });
        }
        const pending = new Map(this.#records);
        let metadataChanged = false;
        for (const evidence of bundle.records) {
            const existing = pending.get(evidence.evidence_id);
            if (existing !== undefined && !recordsAgree(existing, evidence))
                return err(new EvidenceIntegrityError("Conflicting evidence record"));
            if (existing !== undefined &&
                canonicalize(existing) !== canonicalize(evidence))
                metadataChanged = true;
            pending.set(evidence.evidence_id, evidence);
        }
        const pendingUnknowns = new Map(this.#unknownRevisions);
        let unknownsAdded = 0;
        for (const unknown of bundle.unknowns) {
            const key = unknownRevisionKey(unknown);
            const existing = pendingUnknowns.get(key);
            if (existing !== undefined &&
                existing.revision_digest !== unknown.revision_digest)
                return err(new EvidenceIntegrityError("Conflicting unknown revision"));
            pendingUnknowns.set(key, unknown);
            if (existing === undefined)
                unknownsAdded += 1;
        }
        const checked = this.#validateCandidate(pending, pendingUnknowns);
        if (!checked.ok) {
            if (checked.error instanceof UnknownRegistryError)
                return err(new EvidenceIntegrityError("Evidence bundle unknown registry failed", {
                    cause: checked.error,
                }));
            return err(checked.error);
        }
        const added = pending.size - this.#records.size;
        this.#commit(pending, pendingUnknowns);
        return ok({
            recordsAdded: added,
            unknownsAdded,
            changed: added > 0 || unknownsAdded > 0 || metadataChanged,
            metadataChanged,
        });
    }
    /** Export records in deterministic, semantically irrelevant ID order. */
    export() {
        return structuredClone(createEvidenceBundle([...this.#records.values()], [...this.#unknownRevisions.values()]));
    }
    /** Borrow a sealed canonical bundle for serialization without copying its records. */
    forSerialization() {
        return createImmutableEvidenceBundle([...this.#records.values()], [...this.#unknownRevisions.values()]);
    }
    /** Check whether one immutable Evidence ID is present in this ledger. */
    has(evidenceId) {
        return this.#records.has(evidenceId);
    }
    /** Return a detached immutable Evidence value by semantic ID. */
    get(evidenceId) {
        const evidence = this.#records.get(evidenceId);
        return evidence === undefined ? undefined : structuredClone(evidence);
    }
    /** Borrow authenticated immutable Evidence for read-only analysis without a full clone. */
    forAnalysis(evidenceId) {
        return this.#records.get(evidenceId);
    }
    /** Create one approved unknown and atomically append its mutation evidence. */
    recordUnknown(input, mutationEvidence) {
        let parsedMutation;
        try {
            parsedMutation = parseEvidence(mutationEvidence);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError("Unknown mutation evidence is invalid", {
                cause,
            }));
        }
        let unknown;
        try {
            unknown = createResidualUnknown(input, parsedMutation.evidence_id, parsedMutation.subject?.digest.sha256 ?? null);
        }
        catch (cause) {
            return err(new UnknownRegistryError("invalid-transition", { cause }));
        }
        if (this.#unknownHeads.has(unknown.unknown_id))
            return err(new UnknownRegistryError("already-exists"));
        return this.#appendUnknown(unknown, parsedMutation);
    }
    /** Atomically record derived Evidence and a linked residual unknown. */
    recordWithUnknown(evidenceInput, input, mutationInput) {
        let evidence;
        let mutation;
        try {
            evidence = parseEvidence(evidenceInput);
            mutation = parseEvidence(mutationInput);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError("Atomic Evidence validation failed", {
                cause,
            }));
        }
        const existingEvidence = this.#records.get(evidence.evidence_id);
        if (existingEvidence !== undefined &&
            !recordsAgree(existingEvidence, evidence))
            return err(new EvidenceIntegrityError("Conflicting evidence record"));
        let unknown;
        try {
            unknown = createResidualUnknown(input, mutation.evidence_id, mutation.subject?.digest.sha256 ?? null);
        }
        catch (cause) {
            return err(new UnknownRegistryError("invalid-transition", { cause }));
        }
        const existingUnknown = this.#unknownHeads.get(unknown.unknown_id);
        if (existingUnknown !== undefined) {
            if (existingUnknown.revision !== 1 ||
                existingUnknown.revision_digest !== unknown.revision_digest)
                return err(new UnknownRegistryError("already-exists"));
            const checked = this.#appendIncremental([evidence]);
            if (!checked.ok)
                return checked;
            return ok(null);
        }
        const checked = this.#appendIncremental([evidence, mutation], unknown);
        if (!checked.ok)
            return checked;
        return ok(structuredClone(unknown));
    }
    /** Apply one approved full-state update using optimistic revision matching. */
    updateUnknown(input, mutationEvidence) {
        const current = this.#unknownHeads.get(input.unknown_id);
        if (current === undefined)
            return err(new UnknownRegistryError("not-found"));
        if (current.revision !== input.expected_revision)
            return err(new UnknownRegistryError("revision-conflict"));
        let unknown;
        try {
            unknown = updateResidualUnknown(current, input, mutationEvidence.evidence_id);
        }
        catch (cause) {
            return err(new UnknownRegistryError("invalid-transition", { cause }));
        }
        return this.#appendUnknown(unknown, mutationEvidence);
    }
    /** Query current heads in stable ID order. */
    listUnknowns(filters = {}) {
        return [...this.#unknownHeads.values()]
            .filter((unknown) => (filters.status === undefined || unknown.status === filters.status) &&
            (filters.severity === undefined ||
                unknown.severity === filters.severity) &&
            (filters.domain === undefined || unknown.domain === filters.domain))
            .sort((left, right) => left.unknown_id.localeCompare(right.unknown_id))
            .map((unknown) => structuredClone(unknown));
    }
    /** Return current resolution validity; imported invalid states are rejected. */
    verifyUnknownResolution(unknownId) {
        const unknown = this.#unknownHeads.get(unknownId);
        if (unknown === undefined)
            return err(new UnknownRegistryError("not-found"));
        return ok({
            valid: unknown.status === "resolved",
            truthVerified: unknown.resolution?.disposition === "verified",
            unknown: structuredClone(unknown),
        });
    }
    /** Clear records when the owning session closes. */
    clear() {
        this.#records.clear();
        this.#unknownRevisions.clear();
        this.#unknownHeads.clear();
    }
    #appendUnknown(unknown, mutationEvidenceInput) {
        let mutationEvidence;
        try {
            mutationEvidence = parseEvidence(mutationEvidenceInput);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError("Unknown mutation evidence is invalid", {
                cause,
            }));
        }
        const checked = this.#appendIncremental([mutationEvidence], unknown);
        if (!checked.ok)
            return checked;
        return ok(structuredClone(unknown));
    }
    #appendIncremental(records, unknown) {
        const additions = new Map();
        for (const evidence of records) {
            const existing = additions.get(evidence.evidence_id) ??
                this.#records.get(evidence.evidence_id);
            if (existing !== undefined) {
                if (!recordsAgree(existing, evidence))
                    return err(new EvidenceIntegrityError("Conflicting evidence record"));
                continue;
            }
            additions.set(evidence.evidence_id, evidence);
        }
        const unknownKey = unknown === undefined ? undefined : unknownRevisionKey(unknown);
        if (unknownKey !== undefined && this.#unknownRevisions.has(unknownKey))
            return err(new UnknownRegistryError("integrity"));
        if (unknown !== undefined)
            try {
                validateResidualUnknownAddition(unknown, {
                    get: (id) => additions.get(id) ?? this.#records.get(id),
                    has: (id) => additions.has(id) || this.#records.has(id),
                }, this.#unknownHeads);
            }
            catch (cause) {
                return err(new UnknownRegistryError("integrity", { cause }));
            }
        for (const [id, evidence] of additions)
            this.#records.set(id, immutableEvidence(evidence));
        if (unknown !== undefined && unknownKey !== undefined) {
            this.#unknownRevisions.set(unknownKey, unknown);
            this.#unknownHeads.set(unknown.unknown_id, unknown);
        }
        return ok(undefined);
    }
    #validateCandidate(records, unknowns) {
        try {
            parseEvidenceBundle(createEvidenceBundle([...records.values()], [...unknowns.values()]));
        }
        catch (cause) {
            return err(new UnknownRegistryError("integrity", { cause }));
        }
        return ok(undefined);
    }
    #commit(records, unknowns) {
        this.#records.clear();
        for (const [id, evidence] of records)
            this.#records.set(id, immutableEvidence(evidence));
        this.#unknownRevisions.clear();
        this.#unknownHeads.clear();
        for (const [key, unknown] of unknowns) {
            this.#unknownRevisions.set(key, unknown);
            const head = this.#unknownHeads.get(unknown.unknown_id);
            if (head === undefined || head.revision < unknown.revision)
                this.#unknownHeads.set(unknown.unknown_id, unknown);
        }
    }
}
const unknownRevisionKey = (unknown) => `${unknown.unknown_id}:${String(unknown.revision)}`;
const recordsAgree = (left, right) => canonicalize(withoutLocalPath(left)) ===
    canonicalize(withoutLocalPath(right));
const withoutLocalPath = (evidence) => ({
    ...evidence,
    subject: evidence.subject === null
        ? null
        : {
            ...evidence.subject,
            name: "<non-identity-name>",
            local_path: "<non-identity-local-path>",
        },
});
