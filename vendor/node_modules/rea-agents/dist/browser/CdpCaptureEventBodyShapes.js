import { inferJsonShape } from "../domain/jsonShape.js";
import { recordValue, cdpStringValue, } from "./CdpCaptureValues.js";
import { decodeBase64, isJsonContentType } from "./CdpCaptureEventHelpers.js";
export const ingestResponseBodyShape = (state, requestId, value) => {
    const result = recordValue(value);
    const body = cdpStringValue(result?.body);
    if (body === undefined) {
        invalidResponseBodyShape(state, requestId);
        return;
    }
    const decoded = result?.base64Encoded === true
        ? decodeBase64(body)?.toString("utf8")
        : body;
    if (decoded === undefined) {
        invalidResponseBodyShape(state, requestId);
        return;
    }
    const inferred = inferBodyShape(decoded);
    updateResponseBodyShape(state, requestId, inferred.shape);
};
export const requestBodyShape = (state, request) => {
    if (!state.input.include_json_body_shapes)
        return { status: "not_approved", request: null, response: null };
    const body = cdpStringValue(request.postData);
    if (!isJsonContentType(recordValue(request.headers)) || body === undefined)
        return { status: "unavailable", request: null, response: null };
    const inferred = inferBodyShape(body);
    return {
        status: inferred.shape === null ? "unavailable" : "included",
        request: inferred.shape,
        response: null,
    };
};
export const updateResponseBodyShape = (state, requestId, response) => {
    const current = state.network.get(requestId);
    if (current === undefined)
        return;
    const request = current.body_shapes.request;
    const status = response !== null
        ? "included"
        : request !== null
            ? "partial"
            : "unavailable";
    state.network.set(requestId, {
        ...current,
        body_shapes: { status, request, response },
    });
};
const inferBodyShape = (text) => {
    return { shape: inferJsonShape(text) };
};
const invalidResponseBodyShape = (state, requestId) => {
    updateResponseBodyShape(state, requestId, null);
    state.completeness.exclude("json_body_shapes", "invalid_protocol_value");
};
