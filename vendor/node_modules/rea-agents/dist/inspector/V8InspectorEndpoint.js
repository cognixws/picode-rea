import { z } from "zod";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import {} from "../domain/browserObservationErrors.js";
import { parseCdpEndpointValue, readCdpJson } from "../browser/CdpEndpoint.js";
const versionSchema = z
    .object({
    Browser: z.string().min(1),
    "Protocol-Version": z.string().min(1),
    "V8-Version": z.string().optional(),
})
    .passthrough();
const targetSchema = z
    .object({
    id: z.string().min(1),
    type: z.string().min(1),
    url: z.string(),
    attached: z.boolean().default(false),
    webSocketDebuggerUrl: z.string().min(1),
})
    .passthrough();
const targetsSchema = z.array(targetSchema);
/** Discover Node/Electron Inspector targets from one loopback endpoint. */
export const discoverV8Inspector = async (endpoint, operation, signal) => {
    const [versionInput, targetsInput] = await Promise.all([
        readCdpJson(new URL("/json/version", endpoint), operation, signal),
        readCdpJson(new URL("/json/list", endpoint), operation, signal),
    ]);
    const version = parseCdpEndpointValue(versionSchema, versionInput, operation);
    const targets = parseCdpEndpointValue(targetsSchema, targetsInput, operation);
    return {
        runtime: {
            product: version.Browser,
            protocol_version: version["Protocol-Version"],
            v8_version: version["V8-Version"] ?? null,
        },
        targets: targets.map((target) => ({
            id: target.id,
            type: target.type,
            url: target.url,
            attached: target.attached,
            webSocketUrl: validatedInspectorWebSocket(endpoint, target.id, target.webSocketDebuggerUrl, operation),
        })),
    };
};
const validatedInspectorWebSocket = (endpoint, targetId, reported, operation) => {
    let socket;
    try {
        socket = new URL(reported);
    }
    catch (cause) {
        throw new BrowserObservationError(operation, "invalid_endpoint_response", {
            cause,
        });
    }
    const trusted = new URL(endpoint);
    const allowedPaths = new Set([
        `/${targetId}`,
        `/devtools/node/${targetId}`,
        `/devtools/page/${targetId}`,
    ]);
    if (socket.protocol !== "ws:" ||
        socket.port !== trusted.port ||
        socket.username !== "" ||
        socket.password !== "" ||
        socket.search !== "" ||
        socket.hash !== "" ||
        !allowedPaths.has(socket.pathname))
        throw new BrowserObservationError(operation, "invalid_endpoint_response");
    socket.hostname = trusted.hostname;
    return socket.href;
};
