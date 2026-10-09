import { observeOwnedProcessLineage } from "./ProcessOwnershipObservation.js";
/** Retain the latest truthful process-lineage observation for one client. */
export class ProviderRunLineage {
    #observation = null;
    /** Clear stale lineage before a new launch attempt. */
    reset() {
        this.#observation = null;
    }
    /** Observe a token-owned launcher without signaling it. */
    async observe(launch) {
        if (launch?.ownership === undefined)
            return;
        this.#observation = await observeOwnedProcessLineage(launch.ownership);
    }
    /** Return a detached copy suitable for caller-visible status. */
    snapshot() {
        return this.#observation === null
            ? null
            : structuredClone(this.#observation);
    }
}
