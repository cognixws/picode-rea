import { electronPageInspectionSchema, electronTargetListSchema, } from "../domain/javascript/electronObservation.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { BrowserObservationError } from "../domain/browserObservationError.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import {} from "../domain/browserObservationErrors.js";
import { err, ok } from "../domain/result.js";
import { discoverCdpEndpoint, hasCdpTargetWebSocket, } from "./CdpEndpoint.js";
import { closeCdpTargetSession, openCdpTargetSession, } from "./CdpTargetSession.js";
import { inspectCdpElectronPage } from "./CdpElectronInspection.js";
import { authorizedElectronFile } from "./ElectronFileScope.js";
/** Public identity committed by passive Electron observations. */
export { CDP_ELECTRON_PROVIDER_IDENTITY } from "./providerIdentities.js";
import { CDP_ELECTRON_PROVIDER_IDENTITY } from "./providerIdentities.js";
const IDENTITY = CDP_ELECTRON_PROVIDER_IDENTITY;
/** Passive Electron provider for local file pages exposed by loopback CDP. */
export class CdpElectronProvider {
    identity() {
        return IDENTITY;
    }
    async listTargets(input, options = {}) {
        try {
            const discovery = await discoverCdpEndpoint(input.cdp_endpoint, "list_electron_targets", options.signal);
            const allowed = [];
            let unsupportedUrl = 0;
            let nonPage = 0;
            let unconnectable = 0;
            for (const target of discovery.targets) {
                if (target.type !== "page") {
                    nonPage += 1;
                    continue;
                }
                const path = await authorizedElectronFile(target.url);
                if (path === undefined) {
                    unsupportedUrl += 1;
                    continue;
                }
                if (!hasCdpTargetWebSocket(discovery, target)) {
                    unconnectable += 1;
                    continue;
                }
                allowed.push({
                    target_id: target.id,
                    type: target.type,
                    title: target.title,
                    file_path: path,
                    attached: target.attached,
                });
            }
            allowed.sort((left, right) => left.target_id.localeCompare(right.target_id));
            return ok(electronTargetListSchema.parse({
                browser: discovery.version,
                targets: allowed,
                excluded: {
                    unsupported_url: unsupportedUrl,
                    non_page: nonPage,
                },
                limitations: [
                    "Every local file page exposed by the selected loopback CDP endpoint is eligible for listing.",
                    ...(unconnectable === 0
                        ? []
                        : [
                            `${String(unconnectable)} otherwise allowed page target(s) lacked a validated direct CDP WebSocket and were excluded.`,
                        ]),
                ],
            }));
        }
        catch (cause) {
            return err(providerError(cause, "list_electron_targets"));
        }
    }
    async inspectPage(input, options = {}) {
        let targetSession;
        try {
            const discovery = await discoverCdpEndpoint(input.cdp_endpoint, "inspect_electron_page", options.signal);
            const target = await authorizeTarget(discovery.targets, input.target_id);
            targetSession = await openCdpTargetSession(discovery, target, "inspect_electron_page", options.signal);
            return ok(electronPageInspectionSchema.parse(await inspectCdpElectronPage({
                connection: targetSession.connection,
                sessionId: targetSession.sessionId,
                discovery,
                target,
                input,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
                ...(options.progress === undefined
                    ? {}
                    : { progress: options.progress }),
            })));
        }
        catch (cause) {
            return err(providerError(cause, "inspect_electron_page"));
        }
        finally {
            if (targetSession !== undefined)
                await closeCdpTargetSession(targetSession, ["Debugger", "Runtime", "Page"], options.signal);
        }
    }
}
const authorizeTarget = async (targets, targetId) => {
    const target = targets.find(({ id }) => id === targetId);
    if (target === undefined)
        throw new BrowserObservationError("inspect_web_page", "target_not_found");
    if (target.type !== "page" ||
        (await authorizedElectronFile(target.url)) === undefined)
        throw new BrowserObservationError("inspect_web_page", "target_not_allowed");
    return target;
};
const providerError = (cause, operation) => cause instanceof BrowserObservationError && cause.operation !== operation
    ? new BrowserObservationError(operation, cause.reason, { cause })
    : cause instanceof AnalysisError
        ? cause
        : new ProviderAdapterError(IDENTITY.id, operation, { cause });
