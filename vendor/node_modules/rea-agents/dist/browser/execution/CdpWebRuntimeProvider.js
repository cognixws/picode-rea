import { z } from "zod";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisOutputError } from "../../domain/analysisErrorCore.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { err, ok } from "../../domain/result.js";
import { webExecutionSchema, } from "../../domain/webExecution.js";
import { webEventListenersSchema, } from "../../domain/webEventListeners.js";
import { CDP_BROWSER_PROVIDER_IDENTITY } from "../providerIdentities.js";
import { CdpRuntimeSession } from "./CdpRuntimeSession.js";
import { CdpRuntimeSources } from "./CdpRuntimeSources.js";
import { captureWebExecution } from "./CdpExecutionCapture.js";
import { captureWebEventListeners, eventListenerObjectGroup, } from "./CdpEventListeners.js";
/** Native CDP integration with distinct inspection/instrumentation authority and confirmed cleanup. */
export class CdpWebRuntimeProvider {
    /** Identify this adapter independently of the captured browser version. */
    identity() {
        return CDP_BROWSER_PROVIDER_IDENTITY;
    }
    /** Observe one instrumented window while preserving the externally owned page. */
    observeExecution(input, options = {}) {
        return this.run(input, "observe_web_execution", options, webExecutionSchema, (sources) => captureWebExecution(input, sources));
    }
    /** Inspect one selected node's registered callback locations. */
    inspectEventListeners(input, options = {}) {
        const group = eventListenerObjectGroup();
        return this.run(input, "inspect_web_event_listeners", options, webEventListenersSchema, (sources) => captureWebEventListeners(input, sources, group), group);
    }
    async run(input, operation, options, schema, capture, group) {
        let session;
        let result;
        try {
            session = await CdpRuntimeSession.open(input, operation, options);
            result = ok(schema.parse(await capture(new CdpRuntimeSources(session))));
        }
        catch (cause) {
            result = err(cause instanceof AnalysisError
                ? cause
                : cause instanceof z.ZodError
                    ? new AnalysisOutputError(operation, cause.message)
                    : new ProviderAdapterError(this.identity().id, operation, {
                        cause,
                    }));
        }
        if (session !== undefined) {
            const failure = await session.close(result.ok ? undefined : result.error, group);
            if (failure !== undefined)
                return err(failure);
        }
        return result;
    }
}
