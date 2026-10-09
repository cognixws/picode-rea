import { evidenceBundleForTarget } from "../../domain/evidenceBundle.js";
import { EvidenceIntegrityError, AnalysisSnapshotMismatchError, } from "../../domain/evidenceErrors.js";
import {} from "../../domain/analysisErrorBase.js";
import {} from "../../domain/unknownRegistryError.js";
import { err, ok } from "../../domain/result.js";
import { AnalysisSnapshotCache } from "./AnalysisSnapshotCache.js";
import { InvestigationRecords } from "../investigation/InvestigationRecords.js";
const SNAPSHOT_MUTATION_RECOVERY = "Export session observations through export_evidence_bundle if needed. Close the active target without saving a snapshot, then reopen it before importing or saving a snapshot.";
/** Binary snapshot owner and compatibility facade for composed investigation records. */
export class BinarySessionRecords {
    #records;
    #snapshot = new AnalysisSnapshotCache();
    #snapshotInvalidated = false;
    #snapshotListeners = new Set();
    constructor(records = new InvestigationRecords()) {
        this.#records = records;
    }
    /** Observe changes to the mutable current analysis snapshot resource. */
    onAnalysisSnapshotChanged(listener) {
        this.#snapshotListeners.add(listener);
        return () => this.#snapshotListeners.delete(listener);
    }
    recordEvidence(evidence) {
        const recorded = this.#records.recordEvidence(evidence);
        if (recorded.ok && recorded.value === "added")
            this.#emitSnapshotChanged();
        return recorded;
    }
    hasEvidence(evidenceId) {
        return this.#records.hasEvidence(evidenceId);
    }
    evidenceById(evidenceId) {
        return this.#records.evidenceById(evidenceId);
    }
    /** Borrow immutable investigation Evidence without copying a complete graph. */
    evidenceForAnalysis(evidenceId) {
        return this.#records.evidenceForAnalysis(evidenceId);
    }
    exportEvidenceBundle() {
        return this.#records.exportEvidenceBundle();
    }
    /** Borrow a sealed bundle for complete serialization without cloning retained graphs. */
    evidenceBundleForSerialization() {
        return this.#records.evidenceBundleForSerialization();
    }
    importEvidenceBundle(bundle) {
        const imported = this.#records.mergeEvidenceBundle(bundle);
        if (!imported.ok)
            return imported;
        if (imported.value.metadataChanged)
            this.invalidateSnapshot();
        else if (imported.value.changed)
            this.#emitSnapshotChanged();
        return ok(imported.value.recordsAdded);
    }
    exportAnalysisSnapshot() {
        const active = this.activeAnalysisBinding();
        if (this.#snapshotInvalidated)
            return err(new EvidenceIntegrityError("Analysis snapshots are unavailable after analysis metadata mutations", {
                userMessage: `Analysis snapshots are unavailable after analysis metadata mutations. ${SNAPSHOT_MUTATION_RECOVERY}`,
            }));
        const target = active?.target;
        const profile = active?.profile ?? undefined;
        if (target !== undefined && profile === undefined)
            return err(new EvidenceIntegrityError("Analysis snapshots require a concrete provider analysis profile"));
        return this.#snapshot.export(target, profile, target === undefined
            ? this.#records.exportEvidenceBundle()
            : evidenceBundleForTarget(this.#records.exportEvidenceBundle(), target.sha256));
    }
    importAnalysisSnapshot(snapshot) {
        const active = this.activeAnalysisBinding();
        if (active !== undefined && this.#snapshotInvalidated)
            return err(new EvidenceIntegrityError("Analysis snapshots cannot be imported after analysis metadata mutations", {
                userMessage: `Analysis snapshots cannot be imported after analysis metadata mutations. ${SNAPSHOT_MUTATION_RECOVERY}`,
            }));
        if (active?.profile === null)
            return err(new AnalysisSnapshotMismatchError("Analysis snapshot profile_mismatch: the active target has no concrete analysis profile"));
        const imported = this.#snapshot.import(snapshot, active === undefined
            ? undefined
            : { target: active.target, profile: active.profile }, (bundle) => {
            const imported = this.#records.mergeEvidenceBundle(bundle);
            return imported.ok ? ok(imported.value.recordsAdded) : imported;
        });
        if (imported.ok)
            this.#emitSnapshotChanged();
        return imported;
    }
    matchesSnapshot(target, profile) {
        return this.#snapshot.matches(target, profile ?? undefined);
    }
    selectSnapshot(target, profile) {
        this.#snapshot.select(target, profile);
        this.#emitSnapshotChanged();
    }
    lookupSnapshot(target, profile, operation, parameters) {
        if (this.#snapshotInvalidated)
            return undefined;
        return this.#snapshot.lookup(target, profile, operation, parameters);
    }
    recordSnapshot(input) {
        if (this.#snapshotInvalidated)
            return;
        this.#snapshot.record(input);
        this.#emitSnapshotChanged();
    }
    /** Retain one derived workflow result alongside its provider cache entries. */
    recordWorkflowSnapshot(input) {
        const active = this.activeAnalysisBinding();
        if (active === undefined || active.profile === null)
            return err(new EvidenceIntegrityError("Workflow snapshot entries require an active concrete provider profile"));
        if (this.#snapshotInvalidated)
            return ok(null);
        try {
            this.#snapshot.recordWorkflow({
                target: active.target,
                profile: active.profile,
                ...input,
            });
            this.#emitSnapshotChanged();
            return ok(null);
        }
        catch (cause) {
            return err(new EvidenceIntegrityError(cause instanceof Error
                ? cause.message
                : "Workflow snapshot entry validation failed", { cause }));
        }
    }
    invalidateSnapshot() {
        this.#snapshot.clear();
        this.#snapshotInvalidated = true;
        this.#emitSnapshotChanged();
    }
    resetSnapshotInvalidation() {
        if (!this.#snapshotInvalidated)
            return;
        this.#snapshot.clear();
        this.#snapshotInvalidated = false;
        this.#emitSnapshotChanged();
    }
    clearSnapshot() {
        this.#snapshot.clear();
        this.#emitSnapshotChanged();
    }
    clearSessionRecords() {
        this.#records.clear();
        this.#snapshot.clear();
        this.#snapshotInvalidated = false;
        this.#emitSnapshotChanged();
    }
    #emitSnapshotChanged() {
        for (const listener of this.#snapshotListeners) {
            try {
                const notification = listener();
                if (notification !== undefined)
                    void notification.catch((cause) => {
                        // best-effort cleanup: async observer notifications must not reject unhandled.
                        void cause;
                    });
            }
            catch (cause) {
                // External resource observers are best-effort; one callback must not
                // make a committed evidence mutation appear to fail.
                void cause;
            }
        }
    }
    recordUnknown(input) {
        const target = this.activeAnalysisBinding()?.target;
        const recorded = this.#records.recordUnknown(input, target);
        if (recorded.ok)
            this.#emitSnapshotChanged();
        return recorded;
    }
    recordEvidenceWithUnknown(evidence, input) {
        const recorded = this.#records.recordEvidenceWithUnknown(evidence, input);
        if (recorded.ok)
            this.#emitSnapshotChanged();
        return recorded;
    }
    updateUnknown(input) {
        const target = this.activeAnalysisBinding()?.target;
        const updated = this.#records.updateUnknown(input, target);
        if (updated.ok)
            this.#emitSnapshotChanged();
        return updated;
    }
    listUnknowns(filters = {}) {
        return this.#records.listUnknowns(filters);
    }
    verifyUnknownResolution(unknownId) {
        return this.#records.verifyUnknownResolution(unknownId);
    }
}
