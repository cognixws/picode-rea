const includesCompletenessSection = (completeness, collection, section) => {
    const sections = completeness[collection];
    return sections.includes(section);
};
/** Project one captured artifact through its step-level completeness ledger. */
export const artifactEvidenceState = (artifact, state, step) => {
    if (state.state !== "captured")
        return state.state;
    const section = artifact === "action_state" ? "action" : artifact;
    if (includesCompletenessSection(step.completeness, "truncated_sections", section))
        return "truncated";
    return includesCompletenessSection(step.completeness, "missing_sections", section)
        ? "missing"
        : "captured";
};
const EVENT_SECTIONS = [
    "events",
    "frames",
    "workers",
    "popups",
    "websockets",
];
/** Project event evidence through capture- and step-level completeness. */
export const eventEvidenceState = (capture, step) => {
    const listed = (collection) => EVENT_SECTIONS.some((section) => includesCompletenessSection(capture.completeness, collection, section) ||
        includesCompletenessSection(step.completeness, collection, section));
    if (capture.events.dropped > 0 || listed("truncated_sections"))
        return "truncated";
    return listed("missing_sections") ? "missing" : "captured";
};
/** Select stable action fields for normalized comparison. */
export const actionState = (step) => ({
    action: step.action,
    status: step.status,
    before_url: step.before_url,
    after_url: step.after_url,
    error: step.error,
});
/** Select events attributed to one scenario step without sequence metadata. */
export const eventsFor = (capture, stepIndex) => {
    const sourceSteps = new Map(capture.events.items.map(({ sequence, step_index }) => [
        sequence,
        step_index,
    ]));
    return capture.events.items.flatMap(({ sequence: _sequence, step_index: eventStepIndex, ...event }) => {
        if (event.kind === "network-content") {
            const { source_event_sequence: sourceSequence, ...content } = event;
            return sourceSteps.get(sourceSequence) === stepIndex ? [content] : [];
        }
        return eventStepIndex === stepIndex ? [event] : [];
    });
};
/** Different content selection is missing comparability, not an observed website change. */
export const networkContentCoverageReason = (before, after) => {
    const left = before.scenario.network_content;
    const right = after.scenario.network_content;
    if (left === undefined || right === undefined) {
        const events = [...before.events.items, ...after.events.items];
        if (events.some((event) => event.kind === "network-content") ||
            ((left === undefined) !== (right === undefined) &&
                events.some((event) => event.kind === "request" ||
                    event.kind === "response" ||
                    event.kind === "request-failed" ||
                    event.kind === "request-finished" ||
                    event.kind === "request-unfinished")))
            return "Network content selection is unknown in a legacy capture; capture both sides with matching content selection.";
        return undefined;
    }
    return left.request_body !== right.request_body ||
        left.response_body !== right.response_body ||
        left.header_values !== right.header_values
        ? "Network content selections differ; capture both sides with matching content selection before comparing network evidence."
        : undefined;
};
/** Wrap one value as captured comparison evidence. */
export const captured = (value) => ({
    state: "captured",
    value,
});
/** Retain stable screenshot identity without embedding image bytes. */
export const screenshotProjection = (screenshot) => ({
    sha256: screenshot.sha256,
    bytes: screenshot.bytes,
    media_type: screenshot.media_type,
});
