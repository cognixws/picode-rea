import { uniqueSorted } from "../domain/canonicalOrdering.js";
import { manualRegistrationRemediation } from "./SupportedClients.js";
/** Normalize a caller-selected doctor readiness boundary. */
export const normalizeDoctorScope = (requested, target) => ({
    mode: requested === undefined ? "audit-wide" : "explicit",
    clients: uniqueSorted(requested?.clients ?? []),
    providers: uniqueSorted(requested?.providers ?? []),
    skill: requested?.skill === true,
    target: target ?? null,
});
/** Partition diagnostics into required and informational scope checks. */
export const scopeDoctorChecks = (input) => {
    const providerChecks = input.checks.filter((candidate) => isProviderCheck(candidate.name, input.providers.providerInspections));
    const coreChecks = input.checks.filter(({ name }) => name === "node" || (input.scope.target !== null && name === "target"));
    const clientChecks = input.scope.clients.map((client) => selectedRegistrationCheck(client, input.registrations.find((candidate) => candidate.client === client)));
    const skillChecks = input.scope.skill
        ? [selectedSkillCheck(input.skillState, input.checks)]
        : [];
    const selectedProviderChecks = input.scope.providers.flatMap((providerId) => selectedProviderChecksFor(providerId, providerChecks, input.providers));
    const hopperHostChecks = input.scope.providers.includes("hopper")
        ? input.checks.filter(({ name }) => name === "host")
        : [];
    const scopeChecks = [
        ...coreChecks,
        ...hopperHostChecks,
        ...selectedProviderChecks,
        ...clientChecks,
        ...skillChecks,
    ];
    const selectedNames = new Set(scopeChecks.map(({ name }) => name));
    return {
        healthy: coreChecks.every(({ ok }) => ok) &&
            hopperHostChecks.every(({ ok }) => ok) &&
            clientChecks.every(({ ok }) => ok) &&
            skillChecks.every(({ ok }) => ok) &&
            selectedProviderChecks.every(({ ok }) => ok),
        scopeChecks,
        informationalChecks: input.checks.filter(({ name }) => !selectedNames.has(name)),
    };
};
const isProviderCheck = (name, inspections) => name.startsWith("hopper") ||
    inspections?.some(({ id }) => doctorProviderCheckName(id, name)) === true;
const selectedProviderChecksFor = (providerId, checks, providers) => {
    const selected = checks.filter(({ name }) => providerId === "hopper"
        ? name.startsWith("hopper")
        : doctorProviderCheckName(providerId, name));
    const available = providerId === "hopper"
        ? providers.hopperAvailable
        : providers.providerInspections?.find(({ id }) => id === providerId)
            ?.available === true;
    if (available && selected.every(({ ok }) => ok))
        return selected;
    if (selected.some(({ ok }) => !ok))
        return selected;
    return [
        ...selected,
        {
            name: `provider:${providerId}`,
            ok: false,
            classification: "missing_analysis_engine",
            detail: `Requested provider ${providerId} is unavailable.`,
            remediation: `Configure the ${providerId} provider, then rerun rea doctor.`,
        },
    ];
};
const selectedRegistrationCheck = (client, status) => {
    const manual = manualRegistrationRemediation(client);
    if (status === undefined && manual !== undefined)
        return {
            name: `registration:${client}`,
            ok: false,
            classification: "config_drift",
            detail: `${client} is not registered through a local configuration file.`,
            remediation: manual,
        };
    return status === undefined
        ? {
            name: `registration:${client}`,
            ok: false,
            classification: "config_drift",
            detail: `Requested client ${client} was not detected.`,
            remediation: `Install or select ${client}, then run rea setup --client ${client}.`,
        }
        : status.state === "aligned"
            ? {
                name: `registration:${client}`,
                ok: true,
                classification: "healthy",
                detail: status.config_path,
            }
            : registrationCheck(status);
};
const registrationCheck = (status) => ({
    name: `registration:${status.client}`,
    ok: false,
    classification: "config_drift",
    detail: status.config_path,
    remediation: status.remediation,
});
const selectedSkillCheck = (state, checks) => checks.find(({ name }) => name === "skill:identity") ?? {
    name: "skill:identity",
    ok: state === "aligned",
    classification: state === "aligned" ? "healthy" : "config_drift",
    ...(state === "aligned"
        ? { detail: "Installed REA skill identity is aligned." }
        : { remediation: "Run rea setup to update the installed REA skill." }),
};
const doctorProviderCheckName = (providerId, name) => name === providerId || name.startsWith(`${providerId}-`);
