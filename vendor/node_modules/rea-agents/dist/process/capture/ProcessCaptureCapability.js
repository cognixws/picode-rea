import { tmpdir } from "node:os";
import { prepareProcessOwnershipInspection } from "../ProcessOwnershipObservation.js";
/** Explain why process capture cannot claim owned-process cleanup on a host. */
export const processCaptureOwnershipUnavailableReason = (platform) => platform === "win32"
    ? "Windows PTY process capture is unavailable because this adapter does not yet verify descendant cleanup. Use Linux (including WSL for Linux commands) or macOS. Reinstalling the PTY backend does not enable native Windows capture."
    : undefined;
/** Probe the native PTY seam and explain loader failures at their source. */
export const processCaptureProbeFailureReason = (cause) => {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    const code = "code" in error ? String(error.code) : "";
    const diagnostic = error.message;
    if (code === "ERR_MODULE_NOT_FOUND" ||
        code === "MODULE_NOT_FOUND" ||
        /cannot find module|cannot find package/iu.test(diagnostic))
        return `the native PTY module is missing (${diagnostic}); reinstall REA for this host with optional dependencies enabled (for a source checkout, run npm ci)`;
    if (/NODE_MODULE_VERSION|compiled against a different Node\.js version|module version mismatch/iu.test(diagnostic))
        return `the native PTY module is incompatible with this Node.js runtime (${diagnostic}); reinstall REA for this host and active Node.js version with optional dependencies enabled (for a source checkout, run npm ci after selecting that Node.js version)`;
    if (code === "ERR_DLOPEN_FAILED")
        return `the native PTY library failed to load (${diagnostic}); check the loader error, then reinstall REA for this host with optional dependencies enabled (for a source checkout, run npm ci)`;
    return `the native PTY probe failed (${diagnostic}); check the reported operating-system or process-startup error and reinstall REA for this host with optional dependencies enabled if the native binary is missing`;
};
/** Probe the actual native PTY seam instead of inferring support from the OS name. */
export const probeProcessCaptureCapability = async (options = {}) => {
    const platform = options.platform ?? process.platform;
    const ownershipReason = processCaptureOwnershipUnavailableReason(platform);
    if (ownershipReason !== undefined)
        return {
            available: false,
            backend: "node-pty",
            reason: ownershipReason,
        };
    if (platform === "darwin") {
        try {
            await (options.prepareOwnershipInspector ?? prepareProcessOwnershipInspection)();
        }
        catch (cause) {
            return {
                available: false,
                backend: "node-pty",
                reason: cause instanceof Error
                    ? cause.message
                    : "macOS process ownership inspection could not be prepared",
            };
        }
    }
    try {
        const { spawn } = await (options.loadPty ?? (() => import("@lydell/node-pty")))();
        const terminal = spawn(platform === "win32" ? "cmd.exe" : "/bin/sh", platform === "win32" ? ["/c", "exit", "0"] : ["-c", "exit 0"], {
            cwd: tmpdir(),
            env: { HOME: tmpdir(), TERM: "xterm-256color" },
            cols: 80,
            rows: 24,
            name: "xterm-256color",
        });
        await new Promise((resolveExit) => terminal.onExit(() => resolveExit()));
        return { available: true, backend: "node-pty" };
    }
    catch (cause) {
        return {
            available: false,
            backend: "node-pty",
            reason: processCaptureProbeFailureReason(cause),
        };
    }
};
