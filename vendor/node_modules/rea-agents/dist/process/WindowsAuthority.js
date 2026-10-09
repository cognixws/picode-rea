import { systemWindowsNativeAuthority } from "../windows/WindowsNativeLoader.js";
/** Stable explanation used whenever the native Windows authority is absent. */
export const WINDOWS_NATIVE_AUTHORITY_UNAVAILABLE_REASON = "Windows native controls are unavailable in this runtime; use the Windows x64 REA package with its matching bundled native artifact.";
/**
 * Describe native Windows controls without inferring them from taskkill,
 * chmod, symlink creation, or a numeric POSIX open flag.
 */
export const windowsNativeCapabilities = (platform) => {
    if (platform !== "win32") {
        const notApplicable = {
            available: false,
            reason: "Windows native authority is not applicable on this host",
            proof: "not-applicable",
        };
        return {
            job_object_process_ownership: notApplicable,
            private_runtime_dacl: notApplicable,
            reparse_safe_path_admission: notApplicable,
        };
    }
    if (process.platform === "win32") {
        const loaded = systemWindowsNativeAuthority();
        const capability = loaded.available
            ? { available: true, reason: null, proof: "native-authority" }
            : {
                available: false,
                reason: loaded.reason,
                proof: "not-proven",
            };
        return {
            job_object_process_ownership: capability,
            private_runtime_dacl: capability,
            reparse_safe_path_admission: capability,
        };
    }
    const notProven = {
        available: false,
        reason: WINDOWS_NATIVE_AUTHORITY_UNAVAILABLE_REASON,
        proof: "not-proven",
    };
    return {
        job_object_process_ownership: notProven,
        private_runtime_dacl: notProven,
        reparse_safe_path_admission: notProven,
    };
};
/** Whether every native control needed for Windows isolation is proven. */
export const hasWindowsNativeAuthority = (platform) => Object.values(windowsNativeCapabilities(platform)).every(({ available }) => available);
/** Preserve the actual loader or operating-system constraint in provider errors. */
export const windowsNativeAuthorityUnavailableReason = (platform) => windowsNativeCapabilities(platform).job_object_process_ownership.reason ??
    WINDOWS_NATIVE_AUTHORITY_UNAVAILABLE_REASON;
