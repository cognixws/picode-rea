import { AnalysisCapabilityUnavailableError } from "../../domain/analysisErrorCore.js";
import { NoBinaryOpenError } from "../../domain/configurationErrors.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import {} from "../../domain/analysisErrorBase.js";
import { err, ok } from "../../domain/result.js";
import { isSnapshotCacheable } from "./AnalysisSnapshotCache.js";
/** Resolve capability, profile, and snapshot state before invoking a provider. */
export const prepareSessionExecution = (input) => {
    const { active, operation, parameters, unboundOperationError, lookupSnapshot, } = input;
    if (active === undefined)
        return err(new NoBinaryOpenError());
    const capability = active.route.capabilities?.get(operation);
    if (active.route.capabilities !== undefined &&
        capability?.available !== true) {
        const selectionError = unboundOperationError(operation, active.route);
        if (selectionError !== undefined)
            return err(selectionError);
        return err(new AnalysisCapabilityUnavailableError(active.route.binding?.identity.id ?? active.route.identity.id, operation, capability?.reason ?? "operation is not declared by this provider"));
    }
    const profile = active.profile !== null &&
        (capability === undefined ||
            capability.provider.id === active.profile.provider.id)
        ? active.profile
        : undefined;
    const cacheable = profile !== undefined &&
        isSnapshotCacheable(operation, capability, parameters);
    const cached = cacheable
        ? lookupSnapshot(active.target, profile, operation, parameters)
        : undefined;
    return ok({ active, capability, profile, cacheable, cached });
};
/** Attach the selected profile only when the provider identity agrees. */
export const commitExecutionProfile = (operation, result, profile) => {
    if (!result.ok || profile === undefined)
        return result;
    const provider = result.value.provider;
    if (provider.id !== profile.provider.id ||
        provider.name !== profile.provider.name ||
        provider.version !== profile.provider.version)
        return err(new ProviderAdapterError(profile.provider.id, `${operation}:profile`));
    return ok({
        ...result.value,
        analysisProfile: structuredClone(profile),
    });
};
/** Bind an execution to the selected target, preserving valid artifact subjects. */
export const bindExecutionTarget = (result, operation, target) => {
    if (!result.ok)
        return result;
    const subject = {
        path: target.path,
        sha256: target.sha256,
        format: target.format === "analysis-database"
            ? "analysis-database"
            : target.format,
        ...(target.architecture === undefined
            ? {}
            : { architecture: target.architecture }),
    };
    if (result.value.subject !== null &&
        result.value.subject.sha256 !== target.sha256 &&
        !isArtifactBundleSubject(operation, result.value.subject, target))
        return err(new ProviderAdapterError(result.value.provider.id, `${operation}:subject`));
    return ok({ ...result.value, subject: result.value.subject ?? subject });
};
const isArtifactBundleSubject = (operation, subject, target) => (operation === "inventory_artifact" ||
    operation === "inspect_artifact" ||
    operation === "extract_artifact") &&
    subject.path === (target.sourcePath ?? target.path);
