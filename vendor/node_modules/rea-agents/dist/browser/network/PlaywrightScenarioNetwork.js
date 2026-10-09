import { captureNetworkBody, captureNetworkHeaders, } from "./PlaywrightNetworkContent.js";
/** Captures correlated network phases and drains selected content before browser cleanup. */
export class PlaywrightScenarioNetwork {
    options;
    transactions = new Map();
    pending = [];
    gaps = new Set();
    accepting = true;
    readOptions;
    constructor(options) {
        this.options = options;
        this.readOptions = {
            timeoutMs: options.readTimeoutMs ?? 5_000,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        };
    }
    /** Observe a request start, retaining the producer's redirect relationship when known. */
    request(request) {
        if (!this.accepting)
            return;
        const transaction = this.transaction(request);
        const sequence = this.options.emit({
            ...this.metadata(request, transaction),
            kind: "request",
            status: null,
            failure: null,
        });
        if (this.options.selection.request_body ||
            this.options.selection.header_values)
            this.collect(transaction, sequence, "request", request, this.options.selection.request_body
                ? captureNetworkBody(async () => request.postDataBuffer(), "request", request, this.options.secrets, this.readOptions)
                : Promise.resolve({ state: "not_requested" }));
    }
    /** Observe response metadata without starting a potentially unfinished body read. */
    response(response) {
        if (!this.accepting)
            return;
        const request = response.request();
        const transaction = this.transaction(request);
        const sequence = this.options.emit({
            ...this.metadata(request, transaction),
            kind: "response",
            url: this.options.secrets.sanitizeUrl(response.url()),
            status: response.status(),
            header_names: this.headerNames(response),
            failure: null,
        });
        transaction.response = { source: response, sequence };
    }
    /** Record completion and read the original completed response, never a later refetch. */
    finished(request) {
        if (!this.accepting)
            return;
        const transaction = this.transaction(request);
        transaction.terminal = "finished";
        this.options.emit({
            ...this.metadata(request, transaction),
            kind: "request-finished",
            status: null,
            failure: null,
        });
        this.responseContent(transaction);
    }
    /** Preserve request failure separately from missing or unreadable response content. */
    failed(request) {
        if (!this.accepting)
            return;
        const transaction = this.transaction(request);
        transaction.terminal = "failed";
        const message = this.options.secrets.redact(request.failure()?.errorText || "Unknown request failure");
        this.options.emit({
            ...this.metadata(request, transaction),
            kind: "request-failed",
            status: null,
            failure: message,
        });
        this.responseContent(transaction, {
            state: "unavailable",
            reason: "request-failed",
            message,
        });
    }
    /** Stop observing, mark unfinished transactions, and settle bounded content reads. */
    async finish() {
        if (!this.accepting) {
            await Promise.all(this.pending);
            return;
        }
        this.accepting = false;
        for (const [request, transaction] of this.transactions) {
            if (transaction.terminal === undefined) {
                this.gaps.add("Some network requests had not completed when capture ended; later activity is unknown.");
                this.options.emit({
                    ...this.metadata(request, transaction),
                    kind: "request-unfinished",
                    status: null,
                    failure: null,
                    reason: this.options.signal?.aborted === true
                        ? "cancelled"
                        : "capture-ended",
                });
                this.responseContent(transaction, {
                    state: "unavailable",
                    reason: this.options.signal?.aborted === true
                        ? "cancelled"
                        : "response-unfinished",
                    message: "The response had not finished at the capture cutoff; no body read or refetch was attempted.",
                });
            }
        }
        await Promise.all(this.pending);
    }
    /** Missing selected content contributes to aggregate completeness. */
    limitations() {
        return [...this.gaps];
    }
    transaction(request) {
        const known = this.transactions.get(request);
        if (known !== undefined)
            return known;
        const predecessor = request.redirectedFrom();
        const transaction = {
            id: `request-${this.transactions.size + 1}`,
            redirectedFrom: predecessor === null
                ? null
                : (this.transactions.get(predecessor)?.id ?? null),
            responseScheduled: false,
        };
        this.transactions.set(request, transaction);
        return transaction;
    }
    headerNames(source) {
        return Object.keys(source.headers())
            .map((name) => this.options.secrets.redact(name))
            .sort();
    }
    metadata(request, transaction) {
        return {
            transaction_id: transaction.id,
            redirected_from_transaction_id: transaction.redirectedFrom,
            method: this.options.secrets.redact(request.method()),
            url: this.options.secrets.sanitizeUrl(request.url()),
            resource_type: this.options.secrets.redact(request.resourceType()),
            header_names: this.headerNames(request),
        };
    }
    responseContent(transaction, unavailable) {
        const response = transaction.response;
        if (response === undefined ||
            transaction.responseScheduled ||
            (!this.options.selection.response_body &&
                !this.options.selection.header_values))
            return;
        transaction.responseScheduled = true;
        this.collect(transaction, response.sequence, "response", response.source, this.options.selection.response_body
            ? unavailable === undefined
                ? captureNetworkBody(() => response.source.body(), "response", response.source, this.options.secrets, this.readOptions)
                : Promise.resolve(unavailable)
            : Promise.resolve({ state: "not_requested" }));
    }
    collect(transaction, sequence, phase, source, body) {
        const headers = this.options.selection.header_values
            ? captureNetworkHeaders(source, this.options.secrets, this.readOptions)
            : Promise.resolve({ state: "not_requested" });
        this.pending.push(Promise.all([headers, body]).then(([retainedHeaders, retainedBody]) => {
            if (retainedHeaders.state === "unavailable" ||
                retainedBody.state === "unavailable" ||
                retainedBody.state === "not_exposed")
                this.gaps.add("Some selected network content was unavailable; per-transaction content states retain the reason.");
            this.options.emit({
                kind: "network-content",
                transaction_id: transaction.id,
                source_event_sequence: sequence,
                phase,
                headers: retainedHeaders,
                body: retainedBody,
            });
        }));
    }
}
