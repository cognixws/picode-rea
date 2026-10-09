import { createHash } from "node:crypto";
import { z } from "zod";
import { browserStepArtifactsSchema, } from "../domain/browserScenarioCapture.js";
const historyValueSchema = z.strictObject({
    length: z.number().int().min(0),
    navigation_entries: z.array(z.strictObject({
        type: z.string(),
        name: z.string(),
    })),
});
const storageValueSchema = z.strictObject({
    local_storage: z.array(z.tuple([z.string(), z.string()])),
    session_storage: z.array(z.tuple([z.string(), z.string()])),
});
const notRequested = () => ({ state: "not_requested" });
const missing = (reason) => ({ state: "missing", reason });
const textArtifact = (text) => {
    const bytes = Buffer.from(text);
    return {
        state: "captured",
        value: {
            sha256: createHash("sha256").update(bytes).digest("hex"),
            bytes: bytes.byteLength,
            text,
        },
    };
};
const captureScreenshot = async (page) => {
    try {
        const bytes = await page.screenshot({
            type: "png",
            fullPage: false,
            animations: "disabled",
            caret: "hide",
        });
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        return {
            state: "captured",
            value: {
                sha256,
                bytes: bytes.byteLength,
                media_type: "image/png",
                data_base64: bytes.toString("base64"),
            },
        };
    }
    catch (cause) {
        void cause;
        return missing("screenshot capture failed");
    }
};
const captureDom = async (input) => {
    const { page, secrets } = input;
    try {
        return textArtifact(secrets.redact(await page.content()));
    }
    catch (cause) {
        void cause;
        return missing("DOM capture failed");
    }
};
const captureAccessibility = async (input) => {
    const { page, secrets } = input;
    try {
        const text = await page.locator("html").ariaSnapshot();
        return textArtifact(secrets.redact(text));
    }
    catch (cause) {
        void cause;
        return missing("accessibility capture failed");
    }
};
const navigationType = (value) => {
    switch (value) {
        case "navigate":
        case "reload":
        case "back_forward":
        case "prerender":
            return value;
        default:
            return "unknown";
    }
};
const captureHistory = async (page, secrets) => {
    try {
        const raw = historyValueSchema.parse(await page.evaluate(`(() => ({
        length: window.history.length,
        navigation_entries: performance.getEntriesByType("navigation").map(
          entry => ({
            type: typeof entry.type === "string" ? entry.type : "unknown",
            name: entry.name
          })
        )
      }))()`));
        const value = {
            length: raw.length,
            current_url: secrets.sanitizeUrl(page.url()),
            navigation_entries: raw.navigation_entries.map(({ type, name }) => ({
                type: navigationType(type),
                name: secrets.sanitizeUrl(name),
            })),
        };
        return { state: "captured", value };
    }
    catch (cause) {
        void cause;
        return missing("history capture failed");
    }
};
const captureStorage = async (input) => {
    const { context, page, secrets } = input;
    try {
        const pageUrl = new URL(page.url());
        const cookies = pageUrl.protocol === "http:" || pageUrl.protocol === "https:"
            ? await context.cookies(pageUrl.href)
            : [];
        const pageStorage = storageValueSchema.parse(await page.evaluate(`(() => ({
        local_storage: Object.entries(window.localStorage),
        session_storage: Object.entries(window.sessionStorage)
      }))()`));
        const value = {
            cookies: cookies.map((cookie) => ({
                name: cookie.name,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                http_only: cookie.httpOnly,
                same_site: cookie.sameSite,
                ...secrets.fingerprint(cookie.value),
            })),
            local_storage: pageStorage.local_storage.map(([name, value]) => ({
                name,
                ...secrets.fingerprint(value),
            })),
            session_storage: pageStorage.session_storage.map(([name, value]) => ({
                name,
                ...secrets.fingerprint(value),
            })),
        };
        return { state: "captured", value };
    }
    catch (cause) {
        void cause;
        return missing("storage capture failed");
    }
};
/** Capture selected step artifacts without retaining data after scope loss. */
export const capturePlaywrightStepArtifacts = async (input) => {
    const { context, page, secrets, requested } = input;
    const state = (kind, capture) => (!requested.has(kind) ? Promise.resolve(notRequested()) : capture());
    return browserStepArtifactsSchema.parse({
        screenshot: await state("screenshot", () => captureScreenshot(page)),
        dom: await state("dom", () => captureDom({ page, secrets })),
        accessibility: await state("accessibility", () => captureAccessibility({ page, secrets })),
        url: await state("url", async () => ({
            state: "captured",
            value: secrets.sanitizeUrl(page.url()),
        })),
        history: await state("history", () => captureHistory(page, secrets)),
        storage: await state("storage", () => captureStorage({ context, page, secrets })),
    });
};
