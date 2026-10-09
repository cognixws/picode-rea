import {} from "playwright-core";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { BrowserScenarioSecrets } from "./BrowserScenarioSecrets.js";
import { closePlaywrightScenarioBrowser, openPlaywrightScenarioBrowser, } from "./PlaywrightScenarioBrowser.js";
import { performPlaywrightScenarioAction } from "./PlaywrightScenarioActions.js";
import { capturePlaywrightStepArtifacts } from "./PlaywrightScenarioArtifacts.js";
import { PlaywrightScenarioEvents } from "./PlaywrightScenarioEvents.js";
import { withPlaywrightExecutionBoundary } from "./PlaywrightExecutionBoundary.js";
const OPERATION = "capture_browser_scenario";
const storageSeeds = (blocks, secrets) => {
    const seeds = {};
    for (const { origin, entries } of blocks)
        (seeds[origin] ??= []).push(...entries.map(({ name, value }) => [name, secrets.value(value)]));
    return seeds;
};
const installStorageSeeds = async (context, page, scenario, secrets) => {
    await context.addCookies(scenario.storage.cookies.map((cookie) => ({
        name: cookie.name,
        value: secrets.value(cookie.value),
        url: secrets.url(cookie.destination),
        httpOnly: cookie.http_only,
        secure: cookie.secure,
        sameSite: cookie.same_site,
    })));
    const storage = {
        local: storageSeeds(scenario.storage.local_storage, secrets),
        session: storageSeeds(scenario.storage.session_storage, secrets),
    };
    const payload = JSON.stringify(storage).replaceAll("<", "\\u003c");
    await page.addInitScript(`(() => {
    const seeds = ${payload};
    const local = seeds.local[window.location.origin] ?? [];
    const session = seeds.session[window.location.origin] ?? [];
    for (const [name, value] of local) window.localStorage.setItem(name, value);
    for (const [name, value] of session)
      window.sessionStorage.setItem(name, value);
  })()`);
};
const blockAttachedServiceWorkers = async (page) => {
    const controller = await page.evaluate("Boolean(navigator.serviceWorker?.controller)");
    if (controller)
        throw new BrowserObservationError(OPERATION, "target_not_allowed");
    const blockRegistration = `(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((item) => item.unregister())));
    Object.defineProperty(ServiceWorkerContainer.prototype, "register", {
      configurable: false,
      value: () => Promise.reject(new Error("service workers are blocked by scenario policy"))
    });
  })()`;
    await page.addInitScript(blockRegistration);
    await page.evaluate(blockRegistration);
};
const initializePage = async (context, page, scenario, secrets) => {
    context.setDefaultTimeout(0);
    context.setDefaultNavigationTimeout(0);
    if (scenario.browser.mode === "connect")
        await blockAttachedServiceWorkers(page);
    await installStorageSeeds(context, page, scenario, secrets);
};
export class PlaywrightScenarioSession {
    opened;
    mode;
    processOwnership;
    product = "Chromium";
    version;
    initialUrl;
    closed = false;
    secrets;
    eventCapture;
    signal;
    constructor(opened, options) {
        this.opened = opened;
        this.mode = options.mode;
        this.processOwnership =
            options.mode === "launch" ? "provider-owned" : "external";
        this.secrets = options.secrets;
        this.eventCapture = options.eventCapture;
        this.signal = options.signal;
        this.version = opened.browser.version();
        this.initialUrl = opened.page.url();
    }
    static async open(scenario, environment, options) {
        if (options.signal?.aborted === true)
            throw new BrowserObservationError(OPERATION, "cancelled");
        const secrets = BrowserScenarioSecrets.resolve(scenario, environment);
        if (secrets === undefined)
            throw new BrowserObservationError(OPERATION, "secret_unavailable");
        const opening = openPlaywrightScenarioBrowser(scenario, environment);
        let opened;
        try {
            opened = await withPlaywrightExecutionBoundary(() => opening, undefined, options.signal);
        }
        catch (cause) {
            void opening
                .then((lateOpened) => closePlaywrightScenarioBrowser(lateOpened, options.signal))
                .catch((cause) => {
                // best-effort cleanup: late-open cleanup must not mask the boundary failure.
                void cause;
            });
            throw cause;
        }
        try {
            await withPlaywrightExecutionBoundary(() => initializePage(opened.context, opened.page, scenario, secrets), undefined, options.signal);
            const events = new PlaywrightScenarioEvents({
                page: opened.page,
                context: opened.context,
                ownsContext: scenario.browser.mode === "launch",
                enabled: new Set(scenario.capture.events),
                secrets,
                network: scenario.capture.network,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            const session = new PlaywrightScenarioSession(opened, {
                mode: scenario.browser.mode,
                secrets,
                eventCapture: events,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            await withPlaywrightExecutionBoundary(() => opened.page.goto(secrets.url(scenario.start_url), {
                waitUntil: "load",
                timeout: 0,
            }), undefined, options.signal);
            return session;
        }
        catch (cause) {
            await closePlaywrightScenarioBrowser(opened, options.signal);
            throw cause;
        }
    }
    currentUrl() {
        return this.opened.page.url();
    }
    sanitizeUrl(value) {
        return this.secrets.sanitizeUrl(value);
    }
    setStep(index) {
        this.eventCapture.setStep(index);
    }
    nextEventSequence() {
        return this.eventCapture.nextSequence();
    }
    lastEventSequence() {
        return this.eventCapture.lastSequence();
    }
    events() {
        return this.eventCapture.result();
    }
    /** Preserve event coverage gaps for the aggregate capture's completeness. */
    eventLimitations() {
        return this.eventCapture.limitations();
    }
    async perform(action, signal) {
        await withPlaywrightExecutionBoundary(() => performPlaywrightScenarioAction({
            page: this.opened.page,
            action,
            secrets: this.secrets,
        }), "timeout_ms" in action ? action.timeout_ms : undefined, signal);
    }
    async capture(requested, signal) {
        return withPlaywrightExecutionBoundary(() => capturePlaywrightStepArtifacts({
            context: this.opened.context,
            page: this.opened.page,
            secrets: this.secrets,
            requested,
        }), undefined, signal);
    }
    async close() {
        if (this.closed)
            return this.mode === "launch"
                ? "terminated-owned-process"
                : "disconnected-external";
        this.closed = true;
        try {
            await this.eventCapture.finish();
        }
        finally {
            await closePlaywrightScenarioBrowser(this.opened, this.signal);
        }
        return this.mode === "launch"
            ? "terminated-owned-process"
            : "disconnected-external";
    }
    redactError(error) {
        return this.secrets.redact(error instanceof Error ? error.message : "browser action failed");
    }
}
/** Production Playwright/CDP session factory. */
export class PlaywrightScenarioSessionFactory {
    environment;
    constructor(environment = process.env) {
        this.environment = environment;
    }
    open(scenario, options = {}) {
        return PlaywrightScenarioSession.open(scenario, this.environment, options);
    }
}
