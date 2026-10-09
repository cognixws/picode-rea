import { classifyBrowserCompleteness, } from "../domain/browserCompleteness.js";
const EVENT_SECTIONS = {
    scripts: "scripts",
    network_requests: "network_requests",
    console_events: "console_events",
    websocket_connections: "websocket_connections",
    websocket_frames: "websocket_frames",
    webmcp_tools: "webmcp_tools",
    timeline_events: "timeline",
};
const POLICY_REASONS = new Set([
    "disallowed_origin",
    "unsupported_url",
    "unattributed_origin",
    "not_approved",
    "out_of_target_scope",
]);
/** Mutable adapter ledger projected into immutable, canonical completeness v2. */
export class CdpCaptureCompleteness {
    #initialAttachLimited;
    #policyFiltered = new Set();
    #attachLimited = new Set();
    #truncated = new Set();
    #unavailable = new Set();
    #excluded = new Map();
    #dropped = emptyDropped();
    constructor(initialAttachLimited = []) {
        this.#initialAttachLimited = [...initialAttachLimited];
        this.reset();
    }
    reset() {
        this.#policyFiltered.clear();
        this.#attachLimited.clear();
        this.#truncated.clear();
        this.#unavailable.clear();
        this.#excluded.clear();
        Object.assign(this.#dropped, emptyDropped());
        for (const section of this.#initialAttachLimited)
            this.#attachLimited.add(section);
    }
    exclude(section, reason, count = 1) {
        if (POLICY_REASONS.has(reason))
            this.#policyFiltered.add(section);
        if (reason === "provider_unavailable" ||
            reason === "invalid_protocol_value")
            this.#unavailable.add(section);
        if (reason === "resource_budget_exhausted")
            this.#truncated.add(section);
        const key = `${section}\0${reason}`;
        const existing = this.#excluded.get(key);
        const combined = count === null || existing?.count === null
            ? null
            : (existing?.count ?? 0) + count;
        this.#excluded.set(key, { section, reason, count: combined });
    }
    attachLimited(section) {
        this.#attachLimited.add(section);
    }
    unavailable(section) {
        this.#unavailable.add(section);
        this.exclude(section, "provider_unavailable", null);
    }
    truncate(section) {
        this.#truncated.add(section);
    }
    drop(kind, count = 1) {
        this.#dropped[kind] += count;
        this.#truncated.add(EVENT_SECTIONS[kind]);
    }
    get droppedTotal() {
        return Object.values(this.#dropped).reduce((sum, count) => sum + count, 0);
    }
    snapshot() {
        return classifyBrowserCompleteness({
            policyFilteredSections: this.#policyFiltered,
            attachLimitedSections: this.#attachLimited,
            truncatedSections: this.#truncated,
            unavailableSections: this.#unavailable,
            excluded: [...this.#excluded.values()],
            droppedEvents: this.#dropped,
        });
    }
}
const emptyDropped = () => ({
    scripts: 0,
    network_requests: 0,
    console_events: 0,
    websocket_connections: 0,
    websocket_frames: 0,
    webmcp_tools: 0,
    timeline_events: 0,
});
