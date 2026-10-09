import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, } from "playwright-core";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { withPlaywrightExecutionBoundary } from "./PlaywrightExecutionBoundary.js";
const OPERATION = "capture_browser_scenario";
const allowedBrowserEnvironment = (environment) => {
    const allowed = [
        "DBUS_SESSION_BUS_ADDRESS",
        "DISPLAY",
        "HOME",
        "LANG",
        "LD_LIBRARY_PATH",
        "PATH",
        "SystemRoot",
        "TEMP",
        "TMP",
        "TMPDIR",
        "WAYLAND_DISPLAY",
        "XAUTHORITY",
        "XDG_RUNTIME_DIR",
    ];
    return Object.fromEntries(allowed
        .map((name) => [name, environment[name]])
        .filter((entry) => entry[1] !== undefined));
};
const findConnectedPage = async (browser, targetId) => {
    for (const context of browser.contexts())
        for (const page of context.pages()) {
            const session = await context.newCDPSession(page);
            try {
                const { targetInfo } = await session.send("Target.getTargetInfo");
                if (targetInfo.targetId !== targetId)
                    continue;
                return { context, page };
            }
            finally {
                await session.detach();
            }
        }
    throw new BrowserObservationError(OPERATION, "target_not_found");
};
const configureAttachedEnvironment = async (context, page, scenario) => {
    await page.setViewportSize({
        width: scenario.environment.viewport.width,
        height: scenario.environment.viewport.height,
    });
    await page.emulateMedia({
        colorScheme: scenario.environment.color_scheme,
        reducedMotion: scenario.environment.reduced_motion,
    });
    const session = await context.newCDPSession(page);
    try {
        await session.send("Emulation.setDeviceMetricsOverride", {
            width: scenario.environment.viewport.width,
            height: scenario.environment.viewport.height,
            deviceScaleFactor: scenario.environment.viewport.device_scale_factor,
            mobile: false,
        });
        await session.send("Emulation.setLocaleOverride", {
            locale: scenario.environment.locale,
        });
        await session.send("Emulation.setTimezoneOverride", {
            timezoneId: scenario.environment.timezone,
        });
    }
    finally {
        await session.detach();
    }
};
export const openPlaywrightScenarioBrowser = async (scenario, environment) => {
    if (scenario.browser.mode === "connect") {
        const browser = await chromium.connectOverCDP(scenario.browser.cdp_endpoint, { timeout: 0 });
        try {
            const target = await findConnectedPage(browser, scenario.browser.target_id);
            await configureAttachedEnvironment(target.context, target.page, scenario);
            return { ...target, browser, profilePath: undefined };
        }
        catch (cause) {
            await browser.close();
            throw cause;
        }
    }
    const profilePath = await mkdtemp(join(tmpdir(), "rea-browser-scenario-"));
    await chmod(profilePath, 0o700);
    try {
        const context = await chromium.launchPersistentContext(profilePath, {
            executablePath: resolve(scenario.browser.executable_path),
            headless: scenario.browser.headless,
            acceptDownloads: false,
            viewport: {
                width: scenario.environment.viewport.width,
                height: scenario.environment.viewport.height,
            },
            deviceScaleFactor: scenario.environment.viewport.device_scale_factor,
            locale: scenario.environment.locale,
            timezoneId: scenario.environment.timezone,
            colorScheme: scenario.environment.color_scheme,
            reducedMotion: scenario.environment.reduced_motion,
            serviceWorkers: scenario.environment.service_workers,
            env: allowedBrowserEnvironment(environment),
            handleSIGHUP: false,
            handleSIGINT: false,
            handleSIGTERM: false,
            timeout: 0,
        });
        const browser = context.browser();
        if (browser === null) {
            await context.close();
            throw new BrowserObservationError(OPERATION, "protocol_error");
        }
        const page = context.pages()[0] ?? (await context.newPage());
        return { context, page, browser, profilePath };
    }
    catch (cause) {
        await rm(profilePath, { recursive: true, force: true, maxRetries: 3 });
        throw cause;
    }
};
export const closePlaywrightScenarioBrowser = async ({ context, browser, profilePath }, signal) => {
    const cleanup = (async () => {
        try {
            // In connect mode Playwright's Browser.close disconnects its CDP client;
            // it does not close the externally owned browser process.
            if (profilePath === undefined)
                await browser.close();
            else
                await context.close();
        }
        finally {
            if (profilePath !== undefined)
                await rm(profilePath, { recursive: true, force: true, maxRetries: 3 });
        }
    })();
    // best-effort cleanup: the bounded execution boundary below observes the
    // same cleanup promise; this early attachment only prevents unhandled rejection.
    void cleanup.catch(() => undefined);
    // The shared execution boundary rejects cancellation/timeouts instead of
    // returning a successful capture whose browser or profile may still exist.
    try {
        await withPlaywrightExecutionBoundary(() => cleanup, 1_000, signal);
    }
    catch (cause) {
        throw new BrowserObservationError(OPERATION, "cleanup_failed", { cause });
    }
};
