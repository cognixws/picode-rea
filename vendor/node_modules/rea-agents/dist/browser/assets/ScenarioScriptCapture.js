/** Join script response bytes only through explicit transaction and event identity. */
export const scenarioScripts = (capture) => {
    const index = indexResponses(capture.events.items);
    return capture.events.items.flatMap((request) => {
        if (request.kind !== "request" || request.resource_type !== "script")
            return [];
        return [projectRequest(request, index)];
    });
};
const indexResponses = (events) => {
    const index = {
        responses: new Map(),
        contents: new Map(),
        requests: new Map(),
    };
    for (const event of events) {
        if (event.kind === "request" && event.transaction_id !== undefined)
            index.requests.set(event.transaction_id, (index.requests.get(event.transaction_id) ?? 0) + 1);
        if (event.kind === "response" && event.transaction_id !== undefined)
            append(index.responses, event.transaction_id, event);
        if (event.kind === "network-content" && event.phase === "response")
            append(index.contents, event.source_event_sequence, event);
    }
    return index;
};
const projectRequest = (request, index) => {
    const id = request.transaction_id;
    const matches = id === undefined ? [] : (index.responses.get(id) ?? []);
    const response = matches.length === 1 ? matches[0] : undefined;
    const bodies = response === undefined ? [] : (index.contents.get(response.sequence) ?? []);
    const body = bodies.length === 1 ? bodies[0]?.body : undefined;
    const ambiguous = (id !== undefined && index.requests.get(id) !== 1) ||
        matches.length > 1 ||
        bodies.length > 1;
    return {
        source: {
            kind: "scenario-response",
            transaction_id: id ?? null,
            request_sequence: request.sequence,
            response_sequence: ambiguous ? null : (response?.sequence ?? null),
            status: ambiguous ? null : (response?.status ?? null),
        },
        url: request.url.url,
        content: projectBody(body, id, ambiguous),
    };
};
const unavailable = (reason, message) => ({ state: "unavailable", reason, message });
const projectBody = (body, transactionId, ambiguous) => {
    if (ambiguous)
        return unavailable("ambiguous-transaction", "The capture does not identify one request, response, and content record for this transaction.");
    if (body === undefined)
        return unavailable(transactionId === undefined
            ? "transaction-identity-unavailable"
            : "response-content-not-retained", "No selected, completed script response bytes were retained for this request.");
    if (body.state === "unavailable")
        return unavailable(body.reason, body.message);
    if (body.state !== "captured")
        return unavailable(body.state, "No selected, completed script response bytes were retained for this request.");
    if (body.representation !== "browser-decoded-response-bytes")
        return unavailable("unsupported-body-representation", `Captured representation ${body.representation} is not script response bytes.`);
    return {
        state: "captured",
        bytes: Buffer.from(body.content, "base64"),
        sha256: body.sha256,
        media_type: body.media_type,
        redacted: body.redacted,
        representation: body.representation,
    };
};
const append = (map, key, value) => {
    const existing = map.get(key);
    if (existing === undefined)
        map.set(key, [value]);
    else
        existing.push(value);
};
