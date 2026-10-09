import { BrowserObservationError } from "../domain/browserObservationError.js";
import {} from "../domain/browserObservationErrors.js";
import { CdpConnection } from "./CdpConnection.js";
import { cdpTargetWebSocket, } from "./CdpEndpoint.js";
/** Open one authorized target through its supported browser or page transport. */
export const openCdpTargetSession = async (discovery, target, operation, signal, limits) => {
    const webSocket = cdpTargetWebSocket(discovery, target, operation);
    const connection = await CdpConnection.connect(webSocket.url, operation, signal, limits);
    if (webSocket.scope === "page")
        return { connection, sessionId: undefined };
    try {
        const attached = await connection.send("Target.attachToTarget", { targetId: target.id, flatten: true }, undefined, signal);
        return { connection, sessionId: attachedSessionId(attached, operation) };
    }
    catch (cause) {
        await connection.close();
        throw cause;
    }
};
/** Disable enabled domains, detach browser sessions, and close REA's socket. */
export const closeCdpTargetSession = async (targetSession, enabledDomains, signal) => {
    const { connection, sessionId } = targetSession;
    for (const [index, domain] of enabledDomains.entries()) {
        if (signal?.aborted === true) {
            await closeCancelledTargetSession(targetSession, enabledDomains.slice(index));
            return;
        }
        try {
            await connection.send(`${domain}.disable`, {}, sessionId, signal);
        }
        catch (cause) {
            // best-effort cleanup: domain disable continues to detach/close boundary.
            void cause;
        }
    }
    if (signal?.aborted === true) {
        await closeCancelledTargetSession(targetSession, []);
        return;
    }
    if (sessionId !== undefined)
        try {
            await connection.send("Target.detachFromTarget", { sessionId }, undefined, signal);
        }
        catch (cause) {
            // best-effort cleanup: closing REA's socket is the final cleanup boundary.
            void cause;
        }
    await connection.close();
};
const closeCancelledTargetSession = async ({ connection, sessionId }, enabledDomains) => {
    const commands = enabledDomains.map((domain) => connection.send(`${domain}.disable`, {}, sessionId));
    if (sessionId !== undefined)
        commands.push(connection.send("Target.detachFromTarget", { sessionId }));
    const settled = Promise.allSettled(commands);
    try {
        await connection.close();
    }
    finally {
        await settled;
    }
};
const attachedSessionId = (value, operation) => {
    if (typeof value !== "object" ||
        value === null ||
        !("sessionId" in value) ||
        typeof value.sessionId !== "string" ||
        value.sessionId.length === 0)
        throw new BrowserObservationError(operation, "protocol_error");
    return value.sessionId;
};
