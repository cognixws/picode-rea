import { snapshotMatchesBinding, snapshotMatchesTarget, snapshotTarget, } from "../../domain/analysisSnapshot.js";
import { parseBinaryTarget } from "../BinaryTargetResolver.js";
import {} from "../../domain/binaryTarget.js";
import { EvidenceIntegrityError, AnalysisSnapshotMismatchError, } from "../../domain/evidenceErrors.js";
import {} from "../../domain/analysisErrorBase.js";
import { err } from "../../domain/result.js";
import { SessionProviderRouter } from "./SessionProviderRouter.js";
/** Parse a target, resolve its provider route, and validate snapshot binding. */
export const resolveSessionOpen = async (input) => {
    const { path, options } = input;
    const parsed = await parseBinaryTarget(path, process.cwd(), process.arch, options.targetKind, options.formatHint);
    if (!parsed.ok)
        return parsed;
    return resolveSessionTarget({ ...input, target: parsed.value });
};
/** Resolve a known target's provider route and validate snapshot binding. */
export const resolveSessionTarget = async (input) => {
    const { router, current, target, options } = input;
    const sameTarget = current?.target.path === target.path &&
        snapshotMatchesTarget(snapshotTarget(current.target), target);
    const resolvedRoute = sameTarget && options.providerId === undefined && current !== undefined
        ? { ok: true, value: current.route }
        : await router.resolve(target, options.providerId, options.signal);
    if (!resolvedRoute.ok)
        return resolvedRoute;
    return validateResolvedSessionTarget({
        ...input,
        route: resolvedRoute.value,
    });
};
/** Revalidate a previewed route against the current session and snapshot binding. */
export const validateResolvedSessionTarget = (input) => {
    const { current, target, route, options, stagedSnapshotMatches } = input;
    const sameTarget = current?.target.path === target.path &&
        snapshotMatchesTarget(snapshotTarget(current.target), target);
    const snapshotError = validateSnapshot({
        snapshot: options.snapshot,
        target,
        profile: route.profile,
        current,
        stagedSnapshotMatches,
    });
    if (snapshotError !== undefined)
        return err(snapshotError);
    return { ok: true, value: { target, route, sameTarget } };
};
const validateSnapshot = ({ snapshot, target, profile, current, stagedSnapshotMatches, }) => {
    if (snapshot !== undefined &&
        (profile === null || !snapshotMatchesBinding(snapshot, target, profile)))
        return new AnalysisSnapshotMismatchError("Analysis snapshot profile_mismatch: target, provider, or analysis profile does not match the requested binary");
    if (current === undefined && !stagedSnapshotMatches(target, profile))
        return new AnalysisSnapshotMismatchError("Analysis snapshot profile_mismatch: staged target, provider, or analysis profile does not match");
    return undefined;
};
