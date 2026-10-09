import WebSocket, {} from "ws";
import { AnalysisCancelledError } from "../domain/analysisErrorCore.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { CdpCommandRejection } from "./CdpCommandRejection.js";
import {} from "../domain/browserObservationErrors.js";
import { safeParseJson } from "../domain/safeJson.js";
/** Correlated JSON-RPC transport for one CDP target operation. */
export class CdpConnection {
    socket;
    operation;
    maxPayloadBytes;
    #pending = new Map();
    #listeners = new Set();
    #disconnectListeners = new Set();
    #protocolFailureListeners = new Set();
    #nextId = 1;
    #closed = false;
    #protocolFailed = false;
    #transportFailure = "disconnected";
    constructor(socket, operation, maxPayloadBytes) {
        this.socket = socket;
        this.operation = operation;
        this.maxPayloadBytes = maxPayloadBytes;
        socket.on("message", (data) => this.#receive(data));
        socket.on("close", () => this.#disconnect());
        socket.on("error", (cause) => this.#disconnect(isRecord(cause) && cause.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            ? "payload_limit"
            : "disconnected"));
    }
    /** Connect to one already-validated loopback CDP WebSocket. */
    static async connect(url, operation, signal, limits) {
        if (signal?.aborted === true)
            throw new AnalysisCancelledError(operation);
        const socket = new WebSocket(url, {
            handshakeTimeout: 0,
            maxPayload: limits?.maxPayloadBytes ?? 0,
            perMessageDeflate: false,
        });
        await waitForOpen(socket, operation, signal);
        return new CdpConnection(socket, operation, limits?.maxPayloadBytes ?? 0);
    }
    /** Subscribe to validated CDP event envelopes. */
    onEvent(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    /** Subscribe to an unexpected transport loss while an operation is active. */
    onDisconnect(listener) {
        if (this.#closed) {
            listener(this.#transportError(this.#transportFailure));
            return () => undefined;
        }
        this.#disconnectListeners.add(listener);
        return () => this.#disconnectListeners.delete(listener);
    }
    /** Notify fatal wire parsing failure even when no command is outstanding. */
    onProtocolFailure(listener) {
        if (this.#protocolFailed) {
            listener(this.#transportError("protocol_error"));
            return () => undefined;
        }
        this.#protocolFailureListeners.add(listener);
        return () => this.#protocolFailureListeners.delete(listener);
    }
    /** Execute one command, optionally within a flat target session. */
    async send(method, params = {}, sessionId, signal) {
        if (this.#protocolFailed)
            throw new BrowserObservationError(this.operation, "protocol_error");
        if (this.#closed || this.socket.readyState !== WebSocket.OPEN)
            throw this.#transportError(this.#transportFailure);
        if (signal?.aborted === true)
            throw new AnalysisCancelledError(this.operation);
        const id = this.#nextId;
        this.#nextId += 1;
        return await new Promise((resolve, reject) => {
            const onAbort = () => {
                const pending = this.#pending.get(id);
                if (pending === undefined)
                    return;
                pending.removeAbort();
                this.#pending.delete(id);
                reject(new AnalysisCancelledError(this.operation));
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            this.#pending.set(id, {
                method,
                ...(sessionId === undefined ? {} : { sessionId }),
                resolve,
                reject,
                removeAbort: () => signal?.removeEventListener("abort", onAbort),
            });
            this.socket.send(JSON.stringify({
                id,
                method,
                params,
                ...(sessionId === undefined ? {} : { sessionId }),
            }), (error) => {
                if (error === undefined || error === null)
                    return;
                const pending = this.#pending.get(id);
                if (pending === undefined)
                    return;
                this.#complete(id, pending);
                reject(new BrowserObservationError(this.operation, "disconnected", {
                    cause: error,
                }));
            });
        });
    }
    /** Close only REA's socket; never close the browser or selected page. */
    async close() {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#failPending("disconnected");
        if (this.socket.readyState === WebSocket.CLOSED)
            return;
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.socket.terminate();
                resolve();
            }, 1_000);
            this.socket.once("close", () => {
                clearTimeout(timer);
                resolve();
            });
            this.socket.close();
        });
    }
    #receive(data) {
        if (this.#closed || this.#protocolFailed)
            return;
        const parsed = safeParseJson(rawText(data));
        if (!parsed.ok) {
            this.#failPending("protocol_error");
            return;
        }
        const message = parsed.value;
        if (!isRecord(message)) {
            this.#failPending("protocol_error");
            return;
        }
        if ("id" in message) {
            if (typeof message.id !== "number" ||
                !Number.isSafeInteger(message.id) ||
                message.id < 1) {
                this.#failPending("protocol_error");
                return;
            }
            this.#receiveResponse(message, message.id);
            return;
        }
        if (typeof message.method !== "string" ||
            message.method.length === 0 ||
            ("params" in message && !isRecord(message.params)) ||
            ("sessionId" in message && typeof message.sessionId !== "string")) {
            this.#failPending("protocol_error");
            return;
        }
        const event = {
            method: message.method,
            params: "params" in message ? message.params : {},
            ...(typeof message.sessionId === "string"
                ? { sessionId: message.sessionId }
                : {}),
        };
        for (const listener of this.#listeners)
            listener(event);
    }
    #receiveResponse(message, id) {
        const pending = this.#pending.get(id);
        if (pending === undefined)
            return;
        const hasResult = "result" in message;
        const hasError = "error" in message;
        if (("sessionId" in message &&
            (typeof message.sessionId !== "string" ||
                message.sessionId !== pending.sessionId)) ||
            hasResult === hasError) {
            this.#failPending("protocol_error");
            return;
        }
        if (hasResult) {
            if (!isRecord(message.result)) {
                this.#failPending("protocol_error");
                return;
            }
            this.#complete(id, pending);
            pending.resolve(message.result);
            return;
        }
        const reported = message.error;
        if (!isRecord(reported) ||
            typeof reported.code !== "number" ||
            !Number.isSafeInteger(reported.code) ||
            typeof reported.message !== "string") {
            this.#failPending("protocol_error");
            return;
        }
        this.#complete(id, pending);
        pending.reject(new CdpCommandRejection(this.operation, pending.method, reported.code, reported.message));
    }
    #complete(id, pending) {
        pending.removeAbort();
        this.#pending.delete(id);
    }
    #failPending(reason) {
        const wasProtocolFailed = this.#protocolFailed;
        if (reason !== "protocol_error")
            this.#closed = true;
        else
            this.#protocolFailed = true;
        for (const [id, pending] of this.#pending) {
            this.#complete(id, pending);
            pending.reject(this.#transportError(reason));
        }
        if (reason === "protocol_error" && !wasProtocolFailed) {
            const error = this.#transportError(reason);
            for (const listener of this.#protocolFailureListeners)
                listener(error);
            this.#protocolFailureListeners.clear();
        }
    }
    #disconnect(reason = "disconnected") {
        const wasClosed = this.#closed;
        if (!wasClosed)
            this.#transportFailure = reason;
        this.#failPending(reason);
        if (wasClosed)
            return;
        const error = this.#transportError(reason);
        for (const listener of this.#disconnectListeners)
            listener(error);
        this.#disconnectListeners.clear();
    }
    #transportError(reason) {
        return new BrowserObservationError(this.operation, reason, reason === "payload_limit"
            ? {
                detail: `CDP message exceeded the selected ${String(this.maxPayloadBytes)} byte protocol budget.`,
            }
            : undefined);
    }
}
const rawText = (data) => Array.isArray(data)
    ? Buffer.concat(data).toString("utf8")
    : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : Buffer.from(data).toString("utf8");
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const waitForOpen = async (socket, operation, signal) => await new Promise((resolve, reject) => {
    const onOpen = () => {
        cleanup();
        resolve();
    };
    const onFailure = (cause) => {
        cleanup();
        reject(signal?.aborted === true
            ? new AnalysisCancelledError(operation)
            : new BrowserObservationError(operation, "endpoint_unreachable", {
                cause,
            }));
    };
    const onClose = (code, reason) => {
        onFailure(new Error(`CDP WebSocket closed before opening (${code}: ${reason.toString("utf8")})`));
    };
    const onAbort = () => {
        terminateSocket(socket);
        onFailure(new AnalysisCancelledError(operation));
    };
    const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onFailure);
        socket.off("close", onClose);
        signal?.removeEventListener("abort", onAbort);
    };
    socket.once("open", onOpen);
    socket.once("error", onFailure);
    socket.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true)
        onAbort();
});
const terminateSocket = (socket) => {
    socket.once("error", () => undefined);
    socket.terminate();
};
