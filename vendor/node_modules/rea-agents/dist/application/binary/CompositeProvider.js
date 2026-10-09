import { AnalysisCapabilityUnavailableError } from "../../domain/analysisErrorCore.js";
import { err, ok } from "../../domain/result.js";
import { closeAnalysisClient } from "./AnalysisClientCleanup.js";
/** Synthetic compatibility identity for a deterministic provider set. */
export const compositeProviderIdentity = (identities) => ({
    id: `composite:${identities
        .map(({ id }) => id)
        .sort()
        .join("+")}`,
    name: "REA composite analysis provider",
    version: null,
});
/** Deterministically route disjoint operations without eagerly starting children. */
export class CompositeProvider {
    providers;
    #identity;
    #capabilities;
    #providerByOperation;
    #profileProvider;
    constructor(providers) {
        this.providers = providers;
        if (providers.length === 0)
            throw new RangeError("CompositeProvider requires at least one provider");
        const profileProviders = providers.filter(({ resolveAnalysisProfile }) => resolveAnalysisProfile !== undefined);
        if (profileProviders.length > 1)
            throw new TypeError("CompositeProvider supports at most one target-bound analysis profile");
        this.#profileProvider = profileProviders[0];
        this.#identity = Object.freeze(compositeProviderIdentity(providers.map((provider) => provider.identity())));
        const routes = new Map();
        const capabilities = [];
        for (const provider of providers) {
            for (const descriptor of provider.capabilities()) {
                if (routes.has(descriptor.operation))
                    throw new TypeError(`Multiple providers declare operation ${descriptor.operation}`);
                routes.set(descriptor.operation, provider);
                capabilities.push(descriptor);
            }
        }
        this.#providerByOperation = routes;
        this.#capabilities = Object.freeze(capabilities.sort((left, right) => left.operation.localeCompare(right.operation) ||
            left.provider.id.localeCompare(right.provider.id)));
    }
    identity() {
        return this.#identity;
    }
    capabilities() {
        return this.#capabilities;
    }
    resolveAnalysisProfile(target, options) {
        const resolve = this.#profileProvider?.resolveAnalysisProfile;
        return resolve === undefined
            ? Promise.resolve(ok({ profile: null, compatibility: {} }))
            : resolve.call(this.#profileProvider, target, options);
    }
    createClient(target, profile, context) {
        const clients = new Map();
        const clientFor = (provider) => {
            const existing = clients.get(provider);
            if (existing !== undefined)
                return existing;
            const created = provider.createClient(target, profile?.provider.id === provider.identity().id ? profile : undefined, context);
            clients.set(provider, created);
            return created;
        };
        const closeWithOutcome = async (options) => {
            const outcomes = await Promise.all([...clients.entries()].map(([provider, client]) => closeAnalysisClient(client, provider.identity().id, options)));
            return outcomes.find((outcome) => !outcome.ok) ?? ok(null);
        };
        return {
            execute: (operation, parameters, options) => {
                if (operation === "health")
                    return Promise.resolve(ok({
                        result: null,
                        rawResult: null,
                        provider: this.#identity,
                        limitations: [],
                        locations: [],
                        subject: null,
                    }));
                const provider = this.#providerByOperation.get(operation);
                return provider === undefined
                    ? Promise.resolve(err(new AnalysisCapabilityUnavailableError(this.#identity.id, operation, "operation is not declared by this provider set")))
                    : clientFor(provider).execute(operation, parameters, options);
            },
            runtimeLineageSnapshots: () => [...clients.values()]
                .flatMap((client) => client.runtimeLineageSnapshots?.() ?? [])
                .sort((left, right) => left.provider.id.localeCompare(right.provider.id)),
            requestActivitySnapshots: () => [...clients.values()]
                .flatMap((client) => client.requestActivitySnapshots?.() ?? [])
                .sort((left, right) => left.provider.id.localeCompare(right.provider.id)),
            operationHealthSnapshot: () => {
                for (const client of clients.values()) {
                    const snapshot = client.operationHealthSnapshot?.();
                    if (snapshot !== undefined && snapshot.state !== "idle")
                        return snapshot;
                }
                for (const client of clients.values()) {
                    const snapshot = client.operationHealthSnapshot?.();
                    if (snapshot !== undefined)
                        return snapshot;
                }
                return undefined;
            },
            closeWithOutcome,
            close: async () => {
                await closeWithOutcome();
            },
        };
    }
}
