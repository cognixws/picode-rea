import { analysisProfileSchema, } from "../../domain/analysisProfile.js";
import { AnalysisCancelledError, AnalysisUnsupportedTargetError, } from "../../domain/analysisErrorCore.js";
import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { err, ok } from "../../domain/result.js";
import { ABORTED, waitForAbortable } from "./AbortablePromise.js";
/** Resolve and validate one provider profile without starting its client. */
export const evaluateAnalysisProviderCandidate = async (candidate, status, target, signal) => {
    if (signalIsAborted(signal))
        return err(new AnalysisCancelledError("open_binary"));
    let resolved;
    try {
        const resolution = await waitForAbortable(candidate.resolveAnalysisProfile(target, signal === undefined ? undefined : { signal }), signal);
        if (resolution === ABORTED)
            return err(new AnalysisCancelledError("open_binary"));
        resolved = resolution;
    }
    catch (cause) {
        void cause;
        return ok(rejectedProfile(candidate, status, "Provider profile resolution threw"));
    }
    if (signalIsAborted(signal))
        return err(new AnalysisCancelledError("open_binary"));
    if (!resolved.ok && resolved.error instanceof AnalysisCancelledError)
        return err(resolved.error);
    if (!resolved.ok) {
        const error = resolved.error;
        const rejection = error instanceof AnalysisUnsupportedTargetError
            ? {
                candidate,
                status: {
                    ...status,
                    targetSupport: {
                        status: "unsupported",
                        code: "target_format_unsupported",
                        reason: error.reason,
                        diagnostics: { path: error.path, error_tag: error._tag },
                    },
                },
            }
            : rejectedProfile(candidate, status, error.message, {
                error_tag: error._tag,
            });
        return ok({ ...rejection, profileError: error });
    }
    try {
        if (resolved.value.profile === null)
            return ok(rejectedProfile(candidate, status, "Provider version or analysis profile could not be resolved"));
        const profile = analysisProfileSchema.parse(resolved.value.profile);
        const compatibility = jsonObjectSchema.parse(resolved.value.compatibility);
        const identity = candidate.identity();
        if (profile.provider.id !== identity.id ||
            profile.provider.name !== identity.name ||
            (identity.version !== null &&
                profile.provider.version !== identity.version))
            return ok(rejectedProfile(candidate, status, "Resolved analysis profile has mismatched provider identity"));
        return ok({ candidate, status, profile, compatibility });
    }
    catch (cause) {
        void cause;
        return ok(rejectedProfile(candidate, status, "Provider returned an invalid analysis profile"));
    }
};
const signalIsAborted = (signal) => signal?.aborted === true;
const rejectedProfile = (candidate, status, reason, diagnostics = {}) => ({
    candidate,
    status: {
        ...status,
        availability: {
            status: "unavailable",
            code: "version_unresolved",
            reason,
            diagnostics: jsonObjectSchema.parse({
                ...status.availability.diagnostics,
                ...diagnostics,
            }),
        },
    },
});
