import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { err } from "../../domain/result.js";
import { ABORTED, waitForAbortable } from "./AbortablePromise.js";
const isAborted = (signal) => signal?.aborted === true;
/**
 * Preserve synchronous provider discovery while loading implementation modules
 * only when a target-bound client first executes.
 */
export class LazyAnalysisProvider {
    #providerIdentity;
    #capabilityDescriptors;
    #loadProvider;
    #provider;
    constructor(options) {
        this.#providerIdentity = options.identity;
        this.#capabilityDescriptors = options.capabilities;
        this.#loadProvider = options.load;
    }
    /** Return source-declared provider identity without loading its implementation. */
    identity() {
        return this.#providerIdentity;
    }
    /** Return source-declared capability metadata without loading its implementation. */
    capabilities() {
        return this.#capabilityDescriptors;
    }
    /** Create a client whose implementation is loaded on first execution. */
    createClient(target, profile, context) {
        return new LazyAnalysisClient(async () => {
            const provider = await this.#load();
            return provider.createClient(target, profile, context);
        }, this.#providerIdentity.id);
    }
    async #load() {
        this.#provider ??= this.#loadProvider().catch((cause) => {
            this.#provider = undefined;
            throw cause;
        });
        return this.#provider;
    }
}
class LazyAnalysisClient {
    #loadClient;
    #providerId;
    #client;
    #loading;
    #closed = false;
    constructor(loadClient, providerId) {
        this.#loadClient = loadClient;
        this.#providerId = providerId;
    }
    execute = async (operation, parameters, options) => {
        try {
            if (isAborted(options?.signal))
                return err(new AnalysisCancelledError(operation));
            const loaded = await waitForAbortable(this.#load(operation), options?.signal);
            if (loaded === ABORTED)
                return err(new AnalysisCancelledError(operation));
            return await loaded.execute(operation, parameters, options);
        }
        catch (cause) {
            if (cause instanceof AnalysisError)
                return err(cause);
            return err(new ProviderAdapterError(this.#providerId, operation, {
                cause,
            }));
        }
    };
    runtimeLineageSnapshots() {
        return this.#client?.runtimeLineageSnapshots?.() ?? [];
    }
    requestActivitySnapshots() {
        return this.#client?.requestActivitySnapshots?.() ?? [];
    }
    operationHealthSnapshot() {
        return this.#client?.operationHealthSnapshot?.();
    }
    async close() {
        this.#closed = true;
        if (this.#loading === undefined)
            return;
        const client = await this.#loading;
        await client.close();
    }
    async #load(operation) {
        if (this.#closed)
            throw new ProviderAdapterError(this.#providerId, operation, {
                diagnostics: { reason: "client_closed" },
            });
        this.#loading ??= this.#loadClient()
            .then((client) => {
            this.#client = client;
            return client;
        })
            .catch((cause) => {
            this.#loading = undefined;
            throw cause;
        });
        return this.#loading;
    }
}
