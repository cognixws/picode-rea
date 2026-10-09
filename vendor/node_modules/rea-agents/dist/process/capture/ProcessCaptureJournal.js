import { normalizeProcessElapsedTime, normalizeProcessText, } from "./ProcessNormalization.js";
import { scheduleProcessDelay } from "./ProcessTimer.js";
/** Create one monotonic event journal for a process capture. */
export const createProcessCaptureJournal = () => {
    const entries = [];
    const recordEvent = (collection, index) => {
        entries.push({ capture_order: entries.length, collection, index });
    };
    return {
        entries,
        recordEvent,
    };
};
/** Schedule scenario interactions and record each observed dispatch atomically. */
export const scheduleScenarioInteractions = (options) => {
    const { scenario, getTerminal, timers, interactions, renderer, started } = options;
    for (const [eventIndex, event] of scenario.events.entries()) {
        const timer = scheduleProcessDelay(event.at_ms, () => {
            options.dispatchedEventIndexes.add(eventIndex);
            const terminal = getTerminal();
            const dispatchedAt = Math.max(0, Date.now() - started);
            let outcome = "dispatched";
            if (terminal === undefined)
                outcome = "target_exited";
            else {
                try {
                    if (event.type === "input")
                        terminal.write(event.data);
                    else if (event.type === "resize") {
                        terminal.resize(event.columns, event.rows);
                        renderer.resize(event.columns, event.rows, normalizeProcessElapsedTime(dispatchedAt, scenario.normalization.time_bucket_ms));
                    }
                    else
                        terminal.kill(event.signal);
                }
                catch (cause) {
                    // Terminal dispatch failures are recorded as failed outcomes.
                    void cause;
                    outcome = "failed";
                }
            }
            const sequence = interactions.length;
            interactions.push({
                sequence,
                scheduled_at_ms: event.at_ms,
                dispatched_at_ms: dispatchedAt,
                type: event.type,
                data: event.type === "input"
                    ? event.sensitive
                        ? `<redacted-input:${String(Buffer.byteLength(event.data))}-bytes>`
                        : normalizeProcessText(event.data, scenario, "<no-temporary-root>", -1)
                    : event.type === "resize"
                        ? `${String(event.columns)}x${String(event.rows)}`
                        : event.signal,
                outcome,
            });
            options.recordEvent("interaction_events", sequence);
        });
        timers.add(timer);
    }
};
