import { AnalysisCancelledError } from "../domain/analysisErrorCore.js";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { CdpConnection } from "./CdpConnection.js";
import { CdpCaptureCompleteness } from "./CdpCaptureCompleteness.js";
import { authorizedMainFrame } from "./CdpAuthorizedMainFrame.js";
import { allowedSanitizedUrl, isHttpUrl, numberValue, recordValue, cdpStringValue, } from "./CdpCaptureValues.js";
import { mainFrameUrl } from "./CdpCaptureDocuments.js";
import { isMainFrameNavigation } from "./CdpCaptureEventHelpers.js";
import { cdpTargetEventMatches } from "./CdpTargetEvents.js";
/** Observe external user actions without rejecting approved same-origin navigation. */
export const observeCdpSession = async (context) => {
    const allowedOrigins = new Set(context.input.allowed_origins);
    const initial = await authorizedMainFrame({
        connection: context.connection,
        sessionId: context.sessionId,
        signal: context.signal,
        allowedOrigins,
        operation: "observe_web_session",
    });
    const initialUrl = mainFrameUrl(initial) ?? "";
    const mainFrameId = frameId(initial);
    if (mainFrameId === undefined)
        throw new BrowserObservationError("inspect_web_page", "protocol_error");
    const capture = new TimelineCapture(allowedOrigins, mainFrameId, initialUrl);
    const removeListener = context.connection.onEvent((event) => {
        if (cdpTargetEventMatches(event, context.sessionId))
            capture.ingest(event);
    });
    const removeDisconnectListener = context.connection.onDisconnect(() => capture.targetTerminated());
    try {
        await context.connection.send("Page.enable", {}, context.sessionId, context.signal);
        await context.connection.send("Network.enable", {}, context.sessionId, context.signal);
        await context.connection.send("Page.setLifecycleEventsEnabled", { enabled: true }, context.sessionId, context.signal);
        const armedAt = new Date().toISOString();
        await context.progress?.report({
            phase: "browser_observation",
            completed: 1,
            total: 2,
            message: "Browser observation armed; perform the requested user action now",
        });
        let endReason = await waitForWindow(context.input.observation_ms, capture, context.signal);
        if (endReason === "window_elapsed")
            endReason = await captureFinalUrl(context, capture, allowedOrigins);
        await context.progress?.report({
            phase: "browser_observation",
            completed: 2,
            total: 2,
            message: "Browser observation window ended",
            terminal: true,
        });
        return {
            browser: context.discovery.version,
            target: {
                target_id: context.target.id,
                initial_url: allowedSanitizedUrl(initialUrl, allowedOrigins)?.url ?? "",
                final_url: capture.finalUrl,
            },
            window: {
                armed_at: armedAt,
                ended_at: new Date().toISOString(),
                requested_ms: context.input.observation_ms,
                end_reason: endReason,
            },
            timeline: capture.timeline,
            completeness: capture.completeness.snapshot(),
            limitations: [
                "The timeline begins after REA attaches; earlier navigation and network activity is unavailable.",
                "Only navigation metadata is retained; headers, bodies, cookies, console values, and payloads are not captured by this tool.",
                "An out-of-policy destination ends collection immediately and is recorded without its URL.",
            ],
        };
    }
    finally {
        removeListener();
        removeDisconnectListener();
    }
};
class TimelineCapture {
    allowedOrigins;
    mainFrameId;
    timeline = [];
    completeness = new CdpCaptureCompleteness(["timeline"]);
    finalUrl;
    #sequence = 0;
    #pendingReload = false;
    #endReason;
    #listeners = new Set();
    constructor(allowedOrigins, mainFrameId, initialUrl) {
        this.allowedOrigins = allowedOrigins;
        this.mainFrameId = mainFrameId;
        this.finalUrl =
            allowedSanitizedUrl(initialUrl, allowedOrigins)?.url ?? null;
    }
    ingest(event) {
        if (this.#endReason !== undefined)
            return;
        const params = recordValue(event.params);
        if (params === undefined)
            return;
        switch (event.method) {
            case "Page.frameRequestedNavigation":
                this.#navigationRequested(event, params);
                break;
            case "Page.frameNavigated":
                this.#navigationCommitted(event, params);
                break;
            case "Page.navigatedWithinDocument":
                this.#sameDocument(event, params);
                break;
            case "Network.requestWillBeSent":
                this.#redirect(params);
                break;
            case "Network.loadingFailed":
                this.#loadingFailed(params);
                break;
            case "Page.lifecycleEvent":
                this.#lifecycle(params);
                break;
            case "Inspector.targetCrashed":
            case "Target.detachedFromTarget":
                this.targetTerminated();
                break;
        }
    }
    onEnd(listener) {
        if (this.#endReason !== undefined)
            listener(this.#endReason);
        else
            this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    end(reason) {
        if (this.#endReason !== undefined)
            return;
        this.#endReason = reason;
        for (const listener of this.#listeners)
            listener(reason);
        this.#listeners.clear();
    }
    targetTerminated() {
        if (this.#endReason !== undefined)
            return;
        this.#add({
            type: "target_terminated",
            params: {},
            rawUrl: null,
            requestId: null,
            detail: "target_terminated",
        });
        this.end("target_terminated");
    }
    setFinalUrl(rawUrl) {
        const destination = scopedUrl(rawUrl, this.allowedOrigins);
        this.finalUrl = destination.scope === "approved" ? destination.url : null;
    }
    #navigationRequested(event, params) {
        if (!isMainFrameNavigation(event, this.mainFrameId))
            return;
        const reason = safeDetail(params.reason);
        this.#pendingReload = reason === "reload";
        this.#add({
            type: "navigation_requested",
            params,
            rawUrl: cdpStringValue(params.url) ?? null,
            requestId: null,
            detail: reason,
        });
    }
    #navigationCommitted(event, params) {
        const frame = recordValue(params.frame);
        if (!isMainFrameNavigation(event, this.mainFrameId))
            return;
        const rawUrl = cdpStringValue(frame?.url);
        const destination = scopedUrl(rawUrl, this.allowedOrigins);
        this.#add({
            type: this.#pendingReload ? "same_origin_reload" : "navigation_committed",
            params: { ...params, frameId: frame?.id, loaderId: frame?.loaderId },
            rawUrl: rawUrl ?? null,
            requestId: null,
            detail: safeDetail(frame?.transitionType),
        });
        this.#pendingReload = false;
        if (destination.scope === "approved")
            this.finalUrl = destination.url;
        else {
            this.finalUrl = null;
            this.completeness.exclude("timeline", "out_of_target_scope");
            this.end("target_left_scope");
        }
    }
    #sameDocument(event, params) {
        if (!isMainFrameNavigation(event, this.mainFrameId))
            return;
        const rawUrl = cdpStringValue(params.url);
        const destination = scopedUrl(rawUrl, this.allowedOrigins);
        this.#add({
            type: "same_document_navigation",
            params,
            rawUrl: rawUrl ?? null,
            requestId: null,
            detail: null,
        });
        if (destination.scope === "approved")
            this.finalUrl = destination.url;
        else {
            this.finalUrl = null;
            this.completeness.exclude("timeline", "out_of_target_scope");
            this.end("target_left_scope");
        }
    }
    #redirect(params) {
        const resourceType = cdpStringValue(params.type);
        if (resourceType !== undefined && resourceType !== "Document")
            return;
        if (cdpStringValue(params.frameId) !== this.mainFrameId ||
            recordValue(params.redirectResponse) === undefined)
            return;
        const request = recordValue(params.request);
        const rawUrl = cdpStringValue(request?.url);
        const destination = scopedUrl(rawUrl, this.allowedOrigins);
        this.#add({
            type: "redirect",
            params,
            rawUrl: rawUrl ?? null,
            requestId: cdpStringValue(params.requestId) ?? null,
            detail: null,
        });
        if (destination.scope !== "approved") {
            this.completeness.exclude("timeline", "out_of_target_scope");
            this.end("target_left_scope");
        }
    }
    #loadingFailed(params) {
        const frame = cdpStringValue(params.frameId);
        if (frame !== undefined && frame !== this.mainFrameId)
            return;
        this.#add({
            type: "load_failed",
            params,
            rawUrl: null,
            requestId: cdpStringValue(params.requestId) ?? null,
            detail: safeNetworkError(params.errorText),
        });
    }
    #lifecycle(params) {
        if (cdpStringValue(params.frameId) !== this.mainFrameId)
            return;
        this.#add({
            type: "lifecycle",
            params,
            rawUrl: null,
            requestId: null,
            detail: safeDetail(params.name),
        });
    }
    #add(options) {
        const { type, params, rawUrl = null, requestId = null, detail = null, } = options;
        const destination = rawUrl == null ? null : scopedUrl(rawUrl, this.allowedOrigins);
        this.#sequence += 1;
        this.timeline.push({
            sequence: this.#sequence,
            type,
            timestamp: Math.max(0, numberValue(params.timestamp) ?? 0),
            frame_id: boundedId(params.frameId),
            loader_id: boundedId(params.loaderId),
            request_id: requestId ?? null,
            url: destination?.scope === "approved" ? destination.url : null,
            destination_scope: destination?.scope ?? null,
            detail,
        });
    }
}
const waitForWindow = async (durationMs, capture, signal) => await new Promise((resolve, reject) => {
    let settled = false;
    let removeEnd = () => { };
    const finish = (reason) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        removeEnd();
        resolve(reason);
    };
    const onAbort = () => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timer);
        removeEnd();
        reject(new AnalysisCancelledError("observe_web_session"));
    };
    const timer = setTimeout(() => finish("window_elapsed"), durationMs);
    removeEnd = capture.onEnd(finish);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true)
        onAbort();
});
const captureFinalUrl = async (context, capture, allowedOrigins) => {
    const result = await context.connection.send("Page.getFrameTree", {}, context.sessionId, context.signal);
    const url = mainFrameUrl(result);
    if (url !== undefined &&
        allowedSanitizedUrl(url, allowedOrigins) !== undefined) {
        capture.setFinalUrl(url);
        return "window_elapsed";
    }
    capture.finalUrl = null;
    capture.completeness.exclude("timeline", url === undefined ? "invalid_protocol_value" : "out_of_target_scope");
    return "target_left_scope";
};
const frameId = (result) => cdpStringValue(recordValue(recordValue(recordValue(result)?.frameTree)?.frame)?.id);
const scopedUrl = (value, allowedOrigins) => {
    const allowed = allowedSanitizedUrl(value, allowedOrigins);
    if (allowed !== undefined)
        return { url: allowed.url, scope: "approved" };
    return isHttpUrl(value)
        ? { url: null, scope: "outside_policy" }
        : { url: null, scope: "unsupported" };
};
const boundedId = (value) => cdpStringValue(value) ?? null;
const safeDetail = (value) => {
    const detail = cdpStringValue(value)?.toLowerCase();
    return detail !== undefined && /^[a-z0-9_.:-]{1,100}$/u.test(detail)
        ? detail
        : null;
};
const safeNetworkError = (value) => {
    const error = cdpStringValue(value);
    return error !== undefined && /^net::ERR_[A-Z0-9_]{1,100}$/u.test(error)
        ? error
        : null;
};
