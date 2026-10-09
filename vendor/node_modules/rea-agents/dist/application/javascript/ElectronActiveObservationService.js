import { dirname } from "node:path";
import { realpath } from "node:fs/promises";
import { AnalysisCapabilityUnavailableError, AnalysisInputError, } from "../../domain/analysisErrorCore.js";
import {} from "../../domain/analysisErrorBase.js";
import { err } from "../../domain/result.js";
import { createElectronActiveEvidence } from "./ElectronActiveEvidence.js";
const OPERATION = "capture_electron_scenario";
const PROVIDER_ID = "rea-playwright-electron-active";
const canonicalizeInput = async (input) => {
    try {
        const [executablePath, applicationPath] = await Promise.all([
            realpath(input.executable_path),
            realpath(input.application_path),
        ]);
        const applicationRoot = input.application_root === undefined
            ? dirname(applicationPath)
            : await realpath(input.application_root);
        return {
            ok: true,
            value: {
                ...input,
                executable_path: executablePath,
                application_path: applicationPath,
                application_root: applicationRoot,
            },
        };
    }
    catch (cause) {
        return err(new AnalysisInputError(OPERATION, { cause }, [
            {
                path: ["application_path"],
                reason: "invalid_format",
                message: "Electron executable, application, and root must resolve to existing paths",
            },
        ]));
    }
};
/** Canonicalize request paths and execute one provider-owned Electron run. */
export const captureElectronScenario = async (provider, input, options = {}) => {
    const canonical = await canonicalizeInput(input);
    if (!canonical.ok)
        return canonical;
    if (provider === undefined)
        return err(new AnalysisCapabilityUnavailableError(PROVIDER_ID, OPERATION, "active Electron observation provider is not configured"));
    const captured = await provider.capture(canonical.value, options);
    return captured.ok
        ? {
            ok: true,
            value: createElectronActiveEvidence(canonical.value, captured.value, provider.identity()),
        }
        : captured;
};
