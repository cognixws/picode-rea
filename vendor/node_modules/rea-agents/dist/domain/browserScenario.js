import { z } from "zod";
import { browserScenarioActionSchema, browserScenarioBrowserSchema, browserScenarioCaptureSchema, browserScenarioEnvironmentSchema, browserScenarioSecretSchema, browserScenarioStorageSchema, browserScenarioUrlSchema, } from "./browserScenarioValues.js";
export {} from "./browserScenarioValues.js";
export const browserScenarioInputSchema = z.strictObject({
    browser: browserScenarioBrowserSchema.describe("Required launch/connect selection. Launch uses the selected executable and an owned temporary profile; connect uses one loopback CDP endpoint and target."),
    start_url: browserScenarioUrlSchema.describe("Required initial HTTP(S) URL. Query values must be declared separately as public literals or secret references."),
    environment: browserScenarioEnvironmentSchema,
    actions: z
        .array(browserScenarioActionSchema)
        .min(1)
        .describe("Required sequence of explicit browser actions."),
    storage: browserScenarioStorageSchema,
    secrets: z
        .array(browserScenarioSecretSchema)
        .default([])
        .describe("Optional environment-variable references for values used in actions, URLs, storage, or replay, and for redacting matching observed text. Secret values are never supplied inline."),
    capture: browserScenarioCaptureSchema,
});
const addIssue = (context, path, message) => context.addIssue({ code: "custom", path, message });
const assertUnique = (values, path, label, context) => {
    if (new Set(values).size !== values.length)
        addIssue(context, path, `${label} must be unique`);
};
const secretReferencesInValue = (value) => (value?.source === "secret" ? [value.secret_id] : []);
const destinationSecretReferences = (destination) => destination.query.flatMap(({ value }) => secretReferencesInValue(value));
const actionSecretReferences = (action) => {
    if (action.action === "fill" || action.action === "select_option")
        return secretReferencesInValue(action.value);
    if (action.action === "goto")
        return destinationSecretReferences(action.destination);
    return [];
};
const validateStorage = (scenario) => {
    const references = [];
    scenario.storage.cookies.forEach((cookie) => {
        references.push(...secretReferencesInValue(cookie.value));
        references.push(...destinationSecretReferences(cookie.destination));
    });
    for (const collection of ["local_storage", "session_storage"])
        scenario.storage[collection].forEach((storage) => {
            for (const entry of storage.entries)
                references.push(...secretReferencesInValue(entry.value));
        });
    return references;
};
const validateSecretReferences = (scenario, references, context) => {
    const declared = new Set(scenario.secrets.map(({ secret_id: id }) => id));
    for (const reference of references)
        if (!declared.has(reference))
            addIssue(context, ["secrets"], `Secret reference ${reference} is not declared`);
};
const validateBrowserScenario = (scenario, context) => {
    assertUnique(scenario.actions.map(({ step_id: id }) => id), ["actions"], "Action step IDs", context);
    assertUnique(scenario.secrets.map(({ secret_id: id }) => id), ["secrets"], "Secret IDs", context);
    assertUnique(scenario.secrets.map(({ environment_variable: name }) => name), ["secrets"], "Secret environment variables", context);
    const references = scenario.actions.flatMap(actionSecretReferences);
    references.push(...destinationSecretReferences(scenario.start_url));
    references.push(...validateStorage(scenario));
    validateSecretReferences(scenario, references, context);
};
/** Strict provider-neutral contract for one controlled browser scenario. */
export const browserScenarioSchema = browserScenarioInputSchema.superRefine(validateBrowserScenario);
