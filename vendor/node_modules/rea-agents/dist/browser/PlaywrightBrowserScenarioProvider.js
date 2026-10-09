import { browserScenarioCaptureSchema, classifyBrowserScenarioCompleteness, browserScenarioStepSchema, browserStepArtifactsSchema, } from "../domain/browserScenarioCapture.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import { err, ok } from "../domain/result.js";
const OPERATION = "capture_browser_scenario";
let defaultFactory;
const lazyPlaywrightFactory = {
    async open(scenario, options) {
        defaultFactory ??= import("./PlaywrightScenarioSession.js").then(({ PlaywrightScenarioSessionFactory }) => new PlaywrightScenarioSessionFactory());
        return (await defaultFactory).open(scenario, options);
    },
};
export { PLAYWRIGHT_BROWSER_SCENARIO_PROVIDER_IDENTITY } from "./providerIdentities.js";
import { PLAYWRIGHT_BROWSER_SCENARIO_PROVIDER_IDENTITY } from "./providerIdentities.js";
const SNAPSHOT_KINDS = [
    "screenshot",
    "dom",
    "accessibility",
    "url",
    "history",
    "storage",
];
const requestedForStep = (scenario, stepIndex) => new Set([
    ...scenario.capture.after_each_step,
    ...(stepIndex === scenario.actions.length ? scenario.capture.at_end : []),
]);
const unavailableArtifacts = (requested, reason) => {
    const state = (kind) => requested.has(kind)
        ? { state: "missing", reason }
        : { state: "not_requested" };
    return browserStepArtifactsSchema.parse({
        screenshot: state("screenshot"),
        dom: state("dom"),
        accessibility: state("accessibility"),
        url: state("url"),
        history: state("history"),
        storage: state("storage"),
    });
};
const stepCompleteness = (artifacts, status) => {
    const missing = SNAPSHOT_KINDS.filter((section) => artifacts[section].state === "missing");
    const truncated = SNAPSHOT_KINDS.filter((section) => artifacts[section].state === "truncated");
    if (status !== "completed")
        missing.push("action");
    return classifyBrowserScenarioCompleteness(missing, truncated);
};
const createStep = (input) => browserScenarioStepSchema.parse({
    step_index: input.stepIndex,
    step_id: input.stepId,
    action: input.action,
    status: input.status,
    elapsed_ms: input.elapsedMs,
    before_url: input.beforeUrl,
    after_url: input.afterUrl,
    error: input.error,
    event_sequence_start: input.eventStart,
    event_sequence_end: input.eventEnd,
    artifacts: input.artifacts,
    completeness: stepCompleteness(input.artifacts, input.status),
});
const initialStep = async (input) => {
    const { session, scenario, elapsedMs, signal } = input;
    const artifacts = await session.capture(requestedForStep(scenario, 0), signal);
    return createStep({
        stepIndex: 0,
        stepId: "scenario_start",
        action: "goto_start",
        status: "completed",
        elapsedMs,
        beforeUrl: session.sanitizeUrl(session.initialUrl),
        afterUrl: session.sanitizeUrl(session.currentUrl()),
        error: null,
        eventStart: 1,
        eventEnd: session.lastEventSequence(),
        artifacts,
    });
};
const executeStep = async (input) => {
    const { session, scenario, action, stepIndex, priorFailure, signal } = input;
    const beforeUrl = session.sanitizeUrl(session.currentUrl());
    const eventStart = session.nextEventSequence();
    const requested = requestedForStep(scenario, stepIndex);
    if (priorFailure)
        return createStep({
            stepIndex,
            stepId: action.step_id,
            action: action.action,
            status: "cancelled",
            elapsedMs: 0,
            beforeUrl,
            afterUrl: beforeUrl,
            error: "not executed after an earlier action failure",
            eventStart,
            eventEnd: session.lastEventSequence(),
            artifacts: unavailableArtifacts(requested, "action was not executed after an earlier failure"),
        });
    const actionStartedAt = Date.now();
    session.setStep(stepIndex);
    const requestCancelled = () => signal?.aborted === true;
    let outcome = {
        status: "completed",
        error: null,
    };
    if (requestCancelled()) {
        outcome = { status: "cancelled", error: "scenario request cancelled" };
    }
    else {
        try {
            await session.perform(action, signal);
        }
        catch (cause) {
            outcome = {
                status: requestCancelled() ? "cancelled" : "failed",
                error: session.redactError(cause),
            };
        }
    }
    const artifacts = outcome.status === "cancelled"
        ? unavailableArtifacts(requested, "scenario request cancelled")
        : await session.capture(requested, signal);
    return createStep({
        stepIndex,
        stepId: action.step_id,
        action: action.action,
        ...outcome,
        elapsedMs: Date.now() - actionStartedAt,
        beforeUrl,
        afterUrl: session.sanitizeUrl(session.currentUrl()),
        eventStart,
        eventEnd: session.lastEventSequence(),
        artifacts,
    });
};
const globalCompleteness = (scenario, session, steps) => {
    const missing = steps.flatMap(({ completeness }) => completeness.missing_sections);
    const truncated = steps.flatMap(({ completeness }) => completeness.truncated_sections);
    if (session.mode === "connect")
        missing.push("events");
    if ((session.eventLimitations?.().length ?? 0) > 0)
        missing.push("events");
    return classifyBrowserScenarioCompleteness(missing, truncated);
};
const runScenario = async (factory, scenario, options) => {
    if (options.signal?.aborted === true)
        throw new BrowserObservationError(OPERATION, "cancelled");
    const startedAt = Date.now();
    const session = await factory.open(scenario, options.signal === undefined ? {} : { signal: options.signal });
    const steps = [];
    let cleanup;
    try {
        steps.push(await initialStep({
            session,
            scenario,
            elapsedMs: Date.now() - startedAt,
            signal: options.signal,
        }));
        let failed = false;
        for (const [offset, action] of scenario.actions.entries()) {
            const step = await executeStep({
                session,
                scenario,
                action,
                stepIndex: offset + 1,
                priorFailure: failed,
                signal: options.signal,
            });
            steps.push(step);
            failed ||= step.status !== "completed";
        }
    }
    finally {
        cleanup = await session.close();
    }
    const events = session.events();
    const completeness = globalCompleteness(scenario, session, steps);
    return browserScenarioCaptureSchema.parse({
        browser: {
            mode: session.mode,
            process_ownership: session.processOwnership,
            cleanup,
            product: session.product,
            version: session.version,
        },
        scenario: {
            start_origin: new URL(scenario.start_url.url).origin,
            action_count: scenario.actions.length,
            secret_references: scenario.secrets.map(({ secret_id: id }) => id).sort(),
            network_content: scenario.capture.network,
        },
        duration_ms: Date.now() - startedAt,
        steps,
        events,
        completeness,
        limitations: [
            "Event sequence records provider receipt order; simultaneous browser causality is not inferred.",
            "Network content is retained only when selected; response bytes are browser-decoded, not compressed wire bytes.",
            "Request bytes are limited to what Playwright exposes; not_exposed does not establish body absence or multipart file coverage.",
            "Network content reads settle within 5 seconds each and never wait for unfinished responses or refetch them.",
            "Playwright scenario events do not expose request initiator stacks; receipt order does not prove causality.",
            "Storage values are hashed only after declared-secret redaction.",
            ...(session.eventLimitations?.() ?? []),
            ...(session.mode === "connect"
                ? [
                    "CDP attachment cannot recover pre-attach events or guarantee launch-time context options.",
                ]
                : []),
        ],
    });
};
/** Controlled Playwright/CDP scenario driver with exact process ownership. */
export class PlaywrightBrowserScenarioProvider {
    factory;
    constructor(factory = lazyPlaywrightFactory) {
        this.factory = factory;
    }
    identity() {
        return PLAYWRIGHT_BROWSER_SCENARIO_PROVIDER_IDENTITY;
    }
    async captureScenario(scenario, options = {}) {
        try {
            return ok(await runScenario(this.factory, scenario, options));
        }
        catch (cause) {
            if (cause instanceof AnalysisError)
                return err(cause);
            return err(new ProviderAdapterError(PLAYWRIGHT_BROWSER_SCENARIO_PROVIDER_IDENTITY.id, OPERATION, { cause }));
        }
    }
}
