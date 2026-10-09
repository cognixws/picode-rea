import { CDP_BROWSER_PROVIDER_IDENTITY, PLAYWRIGHT_BROWSER_SCENARIO_PROVIDER_IDENTITY, CDP_ELECTRON_PROVIDER_IDENTITY, PLAYWRIGHT_ELECTRON_ACTIVE_PROVIDER_IDENTITY, } from "../browser/providerIdentities.js";
import { V8_INSPECTOR_PROVIDER_IDENTITY } from "../inspector/providerIdentity.js";
import { err, ok } from "../domain/result.js";
const productionFactories = {
    browserObservation: async () => (await import("./browserObservation.js")).createBrowserObservationProvider(),
    browserScenarioCapture: async () => (await import("./browserScenario.js")).createBrowserScenarioProvider(),
    electronObservation: async () => (await import("./electronObservation.js")).createElectronObservationProvider(),
    electronActiveObservation: async () => (await import("./electronScenario.js")).createElectronScenarioProvider(),
    javascriptRuntimeObservation: async () => (await import("./javascriptRuntimeObservation.js")).createJavaScriptRuntimeObservationProvider(),
};
const loadPort = async (factory, providerId) => {
    try {
        return ok(await factory());
    }
    catch (cause) {
        return err({
            providerId,
            reason: cause instanceof Error ? cause.message : String(cause),
        });
    }
};
/** Load each adapter independently, retaining healthy peers and exact failures. */
export const loadOptionalObservationProviders = async (factories = productionFactories) => {
    const [browser, scenario, electron, electronActive, runtime] = await Promise.all([
        loadPort(factories.browserObservation, CDP_BROWSER_PROVIDER_IDENTITY.id),
        loadPort(factories.browserScenarioCapture, PLAYWRIGHT_BROWSER_SCENARIO_PROVIDER_IDENTITY.id),
        loadPort(factories.electronObservation, CDP_ELECTRON_PROVIDER_IDENTITY.id),
        loadPort(factories.electronActiveObservation, PLAYWRIGHT_ELECTRON_ACTIVE_PROVIDER_IDENTITY.id),
        loadPort(factories.javascriptRuntimeObservation, V8_INSPECTOR_PROVIDER_IDENTITY.id),
    ]);
    return {
        ...(browser.ok ? { browserObservation: browser.value } : {}),
        ...(scenario.ok ? { browserScenarioCapture: scenario.value } : {}),
        ...(electron.ok ? { electronObservation: electron.value } : {}),
        ...(electronActive.ok
            ? { electronActiveObservation: electronActive.value }
            : {}),
        ...(runtime.ok ? { javascriptRuntimeObservation: runtime.value } : {}),
        optionalProviderLoadFailures: {
            ...(browser.ok ? {} : { browserObservation: browser.error }),
            ...(scenario.ok ? {} : { browserScenarioCapture: scenario.error }),
            ...(electron.ok ? {} : { electronObservation: electron.error }),
            ...(electronActive.ok
                ? {}
                : { electronActiveObservation: electronActive.error }),
            ...(runtime.ok ? {} : { javascriptRuntimeObservation: runtime.error }),
        },
    };
};
