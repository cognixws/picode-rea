import { analysisProfileSchema, } from "../../domain/analysisProfile.js";
import { AnalysisCancelledError, AnalysisCapabilityUnavailableError, } from "../../domain/analysisErrorCore.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { ProviderSelectionError } from "../../domain/providerSelectionError.js";
import {} from "../../domain/analysisErrorBase.js";
import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { err, ok } from "../../domain/result.js";
import { AnalysisProviderRegistry, } from "./AnalysisProviderRegistry.js";
import { ABORTED, waitForAbortable } from "./AbortablePromise.js";
import { CompositeProvider, compositeProviderIdentity, } from "./CompositeProvider.js";
/** Resolve either the compatibility single-provider seam or a selectable set. */
export class SessionProviderRouter {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    /** Create routing for an embedding backed by one fixed provider or factory. */
    static single(provider, options = {}) {
        const identity = typeof provider === "function"
            ? { id: "unidentified", name: "Unidentified provider", version: null }
            : provider.identity();
        const capabilities = typeof provider === "function"
            ? undefined
            : capabilityMap(provider.capabilities());
        const resolveProfile = options.resolveAnalysisProfile ??
            (typeof provider === "function" ||
                provider.resolveAnalysisProfile === undefined
                ? () => Promise.resolve(ok({ profile: null, compatibility: {} }))
                : (target, resolutionOptions) => provider.resolveAnalysisProfile?.(target, resolutionOptions) ??
                    Promise.resolve(ok({ profile: null, compatibility: {} })));
        return new SessionProviderRouter({
            kind: "single",
            provider,
            identity,
            capabilities,
            resolveProfile,
        });
    }
    /** Create selection-aware routing while keeping auxiliary families disjoint. */
    static selectable(registry, auxiliaryProviders) {
        const identities = [
            ...registry.identities(),
            ...auxiliaryProviders.map((provider) => provider.identity()),
        ];
        assertUniqueProviderIds(identities);
        const auxiliaryOperations = assertDisjoint(auxiliaryProviders);
        for (const operation of registry.declaredOperations())
            if (auxiliaryOperations.has(operation))
                throw new TypeError(`Deep and auxiliary providers both declare operation ${operation}`);
        const initialRoute = selectableRoute(auxiliaryProviders, undefined);
        return new SessionProviderRouter({
            kind: "selectable",
            registry,
            auxiliaryProviders: [...auxiliaryProviders],
            identity: identities.length === 0
                ? emptyProviderIdentity()
                : compositeProviderIdentity(identities),
            initialRoute,
        });
    }
    /** Compatibility identity covering every configured provider. */
    configuredIdentity() {
        return structuredClone(this.runtime.identity);
    }
    /** Provider identities exposed through the flat 1.x compatibility field. */
    providerIdentities(route) {
        if (this.runtime.kind === "single") {
            if (route.capabilities === undefined)
                return [route.identity];
            return uniqueProviderIdentities([...route.capabilities.values()].map(({ provider }) => provider));
        }
        const selected = route.binding?.identity;
        return uniqueProviderIdentities([
            ...this.runtime.auxiliaryProviders.map((provider) => provider.identity()),
            ...this.runtime.registry
                .identities()
                .map((identity) => identity.id === selected?.id ? selected : identity),
        ]);
    }
    /** Target-free routes and discovery metadata. */
    initialRoute() {
        if (this.runtime.kind === "selectable")
            return this.runtime.initialRoute;
        const runtime = this.runtime;
        return {
            identity: structuredClone(runtime.identity),
            capabilities: runtime.capabilities,
            profile: null,
            compatibility: {},
            binding: null,
            selection: undefined,
            createClient: (target, context) => createSingleProviderClient(runtime, target, undefined, context),
        };
    }
    /** Resolve target routes before any provider client is created. */
    async resolve(target, providerId, signal) {
        const resolutionOptions = signal === undefined ? undefined : { signal };
        if (this.runtime.kind === "selectable") {
            const selected = await this.runtime.registry.select(target, providerId, resolutionOptions);
            return selected.ok
                ? ok(selectableRoute(this.runtime.auxiliaryProviders, selected.value))
                : selected;
        }
        const runtime = this.runtime;
        if (providerId !== undefined &&
            providerId !== "auto" &&
            providerId !== runtime.identity.id)
            return err(new ProviderSelectionError({
                reason: "unknown_provider",
                requestedProviderId: providerId,
                candidateIds: [runtime.identity.id],
            }));
        const resolved = await waitForAbortable(runtime.resolveProfile(target, resolutionOptions), signal);
        if (resolved === ABORTED)
            return err(new AnalysisCancelledError("open_binary"));
        if (!resolved.ok)
            return resolved;
        const normalized = normalizeProfileResolution(resolved.value, runtime.identity.id);
        if (!normalized.ok)
            return normalized;
        return ok({
            identity: structuredClone(runtime.identity),
            capabilities: runtime.capabilities,
            profile: normalized.value.profile,
            compatibility: normalized.value.compatibility,
            binding: null,
            selection: undefined,
            createClient: (openedTarget, context) => createSingleProviderClient(runtime, openedTarget, normalized.value.profile ?? undefined, context),
        });
    }
    /** Candidate status authoritative for the active or target-free route. */
    candidateStatuses(route) {
        if (this.runtime.kind === "single")
            return [];
        return route.selection?.candidates ?? this.runtime.registry.candidates();
    }
    /** Produce exact candidate rejections for an intentionally unbound route. */
    unboundOperationError(operation, route) {
        if (this.runtime.kind !== "selectable" ||
            route.binding !== null ||
            route.selection === undefined)
            return undefined;
        return this.runtime.registry.unboundOperationError(operation, route.selection);
    }
}
const selectableRoute = (auxiliaryProviders, selection) => {
    const binding = selection?.binding ?? null;
    const providers = [
        ...auxiliaryProviders,
        ...(binding === null ? [] : [binding.provider]),
    ];
    const provider = providers.length === 0 ? undefined : new CompositeProvider(providers);
    const identity = provider?.identity() ?? emptyProviderIdentity();
    const capabilities = capabilityMap(provider?.capabilities() ?? []);
    return {
        identity,
        capabilities,
        profile: binding?.profile ?? null,
        compatibility: structuredClone(binding?.compatibility ?? {}),
        binding,
        selection,
        createClient: (target, context) => provider?.createClient(target, binding?.profile, context) ??
            emptyClient(identity),
    };
};
const createSingleProviderClient = (runtime, target, profile, context) => typeof runtime.provider === "function"
    ? runtime.provider(target, profile, context)
    : runtime.provider.createClient(target, profile, context);
const emptyClient = (identity) => ({
    execute: (operation) => operation === "health"
        ? Promise.resolve(ok({
            result: null,
            rawResult: null,
            provider: identity,
            limitations: [],
            locations: [],
            subject: null,
        }))
        : Promise.resolve(err(new AnalysisCapabilityUnavailableError(identity.id, operation, "operation is not declared by this provider set"))),
    close: () => Promise.resolve(),
});
const emptyProviderIdentity = () => ({
    id: "composite:none",
    name: "REA composite analysis provider",
    version: null,
});
const capabilityMap = (capabilities) => new Map(capabilities.map((descriptor) => [descriptor.operation, descriptor]));
const uniqueProviderIdentities = (identities) => [...new Map(identities.map((identity) => [identity.id, identity])).values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((identity) => structuredClone(identity));
const assertDisjoint = (providers) => {
    const routes = new Set();
    for (const provider of providers)
        for (const { operation } of provider.capabilities()) {
            if (routes.has(operation))
                throw new TypeError(`Multiple auxiliary providers declare operation ${operation}`);
            routes.add(operation);
        }
    return routes;
};
const assertUniqueProviderIds = (identities) => {
    const ids = new Set();
    for (const identity of identities) {
        if (ids.has(identity.id))
            throw new TypeError(`Duplicate configured provider ID: ${identity.id}`);
        ids.add(identity.id);
    }
};
const normalizeProfileResolution = (resolution, providerId) => {
    try {
        return ok({
            profile: resolution.profile === null
                ? null
                : analysisProfileSchema.parse(resolution.profile),
            compatibility: jsonObjectSchema.parse(resolution.compatibility),
        });
    }
    catch (cause) {
        return err(new ProviderAdapterError(providerId, "resolve_analysis_profile", {
            cause,
        }));
    }
};
