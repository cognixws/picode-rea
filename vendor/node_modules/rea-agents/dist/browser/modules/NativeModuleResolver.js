import { isAbsolute } from "node:path";
import { z } from "zod";
import { AnalysisCancelledError, AnalysisCapabilityUnavailableError, AnalysisOutputError, AnalysisTimeoutError, } from "../../domain/analysisErrorCore.js";
import { BrowserObservationError } from "../../domain/browserObservationError.js";
import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { err, ok } from "../../domain/result.js";
import { webModuleResolutionSchema } from "../../domain/webModuleTrace.js";
import { ProviderStartupDeadline } from "../../process/ProviderDeadline.js";
const OPERATION = "trace_web_module_imports";
const TIMEOUT_MS = 20000;
const reportSchema = z.strictObject({
    importer_url: z.string(),
    entries: z.array(z.strictObject({
        specifier: z.string(),
        resolution: webModuleResolutionSchema,
    })),
});
const launch = async (options) => (await import("playwright-core")).chromium.launch(options);
/** Use native import.meta.resolve in an owned context with locally fulfilled requests. */
export class NativeModuleResolver {
    environment;
    launcher;
    constructor(environment, launcher = launch) {
        this.environment = environment;
        this.launcher = launcher;
    }
    async resolve(input, options) {
        if (options?.signal?.aborted === true)
            return err(new AnalysisCancelledError(OPERATION));
        const executable = this.environment.REA_BROWSER_EXECUTABLE;
        if (executable === undefined || !isAbsolute(executable))
            return err(new AnalysisCapabilityUnavailableError("native-module-resolver", OPERATION, "missing_browser_executable", {
                userMessage: "Provide an absolute REA_BROWSER_EXECUTABLE for a caller-supplied Chromium browser supporting import.meta.resolve. REA installs no browser.",
            }));
        const deadline = new ProviderStartupDeadline(TIMEOUT_MS, options?.signal);
        let browser;
        let cleanup;
        const close = () => {
            if (cleanup === undefined && browser !== undefined)
                cleanup = browser.close();
            return cleanup ?? Promise.resolve();
        };
        const onAbort = () => {
            if (browser !== undefined) {
                const pending = close();
                void pending.catch(() => undefined);
            }
        };
        deadline.signal.addEventListener("abort", onAbort, { once: true });
        let result;
        try {
            browser = await this.launcher({
                executablePath: executable,
                headless: true,
                timeout: Math.max(1, deadline.remainingMs()),
                handleSIGINT: false,
                handleSIGTERM: false,
                handleSIGHUP: false,
                args: [
                    "--disable-dev-shm-usage",
                    "--disable-background-networking",
                    "--renderer-process-limit=1",
                    "--js-flags=--max-old-space-size=128",
                    ...(this.environment.REA_BROWSER_NO_SANDBOX === "true"
                        ? ["--no-sandbox"]
                        : []),
                ],
            });
            deadline.signal.throwIfAborted();
            const context = await browser.newContext({
                serviceWorkers: "block",
                acceptDownloads: false,
            });
            const page = await context.newPage();
            const diagnostics = [];
            let diagnosticBytes = 0;
            page.on("console", (message) => {
                const text = message.text();
                diagnosticBytes += Buffer.byteLength(text);
                if (diagnosticBytes <= 1024 * 1024)
                    diagnostics.push(`${message.type()}: ${text}`);
            });
            const requests = [];
            const importerUrl = new URL(input.importerUrl).href;
            const documentUrl = new URL("/.rea-module-resolver/document", importerUrl)
                .href;
            const transportUrl = new URL(importerUrl);
            transportUrl.hash = "";
            let stubSent = false;
            await context.route("**/*", async (route) => {
                const request = route.request();
                if (request.resourceType() === "document" &&
                    request.url() === documentUrl.split("#")[0]) {
                    requests.push({
                        url: request.url(),
                        resource_type: "document",
                        effect: "fulfilled",
                    });
                    await route.fulfill({
                        status: 200,
                        contentType: "text/html",
                        body: `<!doctype html>${input.importMap === null ? "" : `<base href="${htmlAttribute(new URL(input.importMap.baseUrl).href)}"><script type="importmap">${scriptJson(input.importMap.value)}</script>`}`,
                    });
                }
                else if (!stubSent &&
                    request.resourceType() === "script" &&
                    request.url() === transportUrl.href) {
                    stubSent = true;
                    requests.push({
                        url: request.url(),
                        resource_type: "script",
                        effect: "fulfilled",
                    });
                    await route.fulfill({
                        status: 200,
                        contentType: "text/javascript",
                        headers: { "Access-Control-Allow-Origin": "*" },
                        body: `if (typeof import.meta.resolve !== "function") {globalThis.__reaModuleUnsupported = true;} else {globalThis.__reaModuleResult = {importer_url: import.meta.url, entries: ${scriptJson(input.specifiers)}.map(specifier => {try {return {specifier, resolution: {state: "resolved", url: import.meta.resolve(specifier)}}} catch (error) {return {specifier, resolution: {state: "rejected", message: String(error)}}}})};}`,
                    });
                }
                else {
                    requests.push({
                        url: request.url(),
                        resource_type: request.resourceType(),
                        effect: "blocked",
                    });
                    await route.abort();
                }
            });
            await page.goto(documentUrl, {
                timeout: Math.max(1, deadline.remainingMs()),
            });
            await page.evaluate(`{const script = document.createElement("script"); script.type = "module"; script.src = ${scriptJson(importerUrl)}; script.onerror = () => {globalThis.__reaModuleFailure = "Trusted resolver stub could not be loaded in the selected context.";}; document.head.append(script);}`);
            await page.waitForFunction(() => Reflect.has(globalThis, "__reaModuleResult") ||
                Reflect.has(globalThis, "__reaModuleUnsupported") ||
                Reflect.has(globalThis, "__reaModuleFailure"), undefined, { timeout: Math.max(1, deadline.remainingMs()) });
            const unsupported = await page.evaluate(() => Reflect.get(globalThis, "__reaModuleUnsupported"));
            if (unsupported === true)
                throw new AnalysisCapabilityUnavailableError("native-module-resolver", OPERATION, "native_resolution_unsupported", {
                    userMessage: `Configured Chromium ${browser.version()} does not supply import.meta.resolve; use a browser supporting native module resolution.`,
                });
            const raw = await page.evaluate(() => Reflect.get(globalThis, "__reaModuleResult"));
            const failure = await page.evaluate(() => Reflect.get(globalThis, "__reaModuleFailure"));
            if (typeof failure === "string")
                throw new AnalysisOutputError(OPERATION, `${failure} Native diagnostics: ${diagnostics.join("\n")}`);
            const parsed = reportSchema.safeParse(raw);
            if (!parsed.success ||
                parsed.data.importer_url !== importerUrl ||
                parsed.data.entries.length !== input.specifiers.length ||
                parsed.data.entries.some((entry, index) => entry.specifier !== input.specifiers[index]))
                throw new AnalysisOutputError(OPERATION, "Native resolver report has invalid shape or does not match the selected importer/specifiers.");
            if (diagnosticBytes > 1024 * 1024)
                throw new BrowserObservationError(OPERATION, "payload_limit");
            deadline.signal.throwIfAborted();
            const engine = {
                id: "chromium-native-module-resolver",
                version: browser.version(),
            };
            result = ok({
                engine,
                resolutions: parsed.data.entries.map((entry) => entry.resolution),
                diagnostics,
                rawResult: jsonObjectSchema.parse({
                    native_report: parsed.data,
                    requests,
                    diagnostics,
                    engine,
                    executable_path: executable,
                }),
            });
        }
        catch (cause) {
            result = err(deadline.interruption === "cancelled"
                ? new AnalysisCancelledError(OPERATION)
                : deadline.interruption === "timeout"
                    ? new AnalysisTimeoutError(OPERATION, TIMEOUT_MS)
                    : cause instanceof AnalysisOutputError ||
                        cause instanceof AnalysisCapabilityUnavailableError ||
                        cause instanceof BrowserObservationError
                        ? cause
                        : new ProviderAdapterError("native-module-resolver", OPERATION, {
                            cause,
                            diagnostics: {
                                executable,
                                error_message: cause instanceof Error ? cause.message : String(cause),
                            },
                        }));
        }
        finally {
            deadline.signal.removeEventListener("abort", onAbort);
            deadline.dispose();
            try {
                await close();
            }
            catch (cause) {
                result = err(new BrowserObservationError(OPERATION, "cleanup_failed", { cause }));
            }
        }
        if (result.ok && options?.signal?.aborted)
            return err(new AnalysisCancelledError(OPERATION));
        return result;
    }
}
const scriptJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const htmlAttribute = (value) => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
