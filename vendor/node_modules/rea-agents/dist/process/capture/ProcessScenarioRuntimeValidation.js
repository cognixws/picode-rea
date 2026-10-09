import { access, realpath, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { ProcessCaptureError, processCaptureCancelled, } from "./ProcessCaptureError.js";
/** Resolve caller-selected executable and observation paths for this execution. */
export const resolveProcessScenarioRuntimePaths = async (scenario, environment = process.env) => {
    const selectedWorkingDirectory = resolve(scenario.working_directory);
    let workingDirectory;
    try {
        workingDirectory = await realpath(selectedWorkingDirectory);
    }
    catch (cause) {
        throw new ProcessCaptureError(`working directory could not be resolved: ${selectedWorkingDirectory}${osFailure(cause)}`, { cause });
    }
    let workingDirectoryStat;
    try {
        workingDirectoryStat = await stat(workingDirectory);
    }
    catch (cause) {
        throw new ProcessCaptureError(`working directory could not be inspected: ${workingDirectory}${osFailure(cause)}`, { cause });
    }
    if (!workingDirectoryStat.isDirectory())
        throw new ProcessCaptureError(`working directory is not a directory: ${workingDirectory}`);
    const executable = await resolveExecutable(scenario.executable, workingDirectory, scenario.environment.PATH ?? environment.PATH ?? "");
    const observationPaths = scenario.filesystem_observation_paths.map((path) => resolve(workingDirectory, path));
    return {
        ...scenario,
        executable,
        working_directory: workingDirectory,
        filesystem_observation_paths: observationPaths,
    };
};
/** Resolve a selected executable through the caller's effective PATH. */
export const resolveExecutable = async (command, workingDirectory, searchPath) => {
    const directories = searchPath
        .split(delimiter)
        .map((directory) => directory === ""
        ? workingDirectory
        : resolve(workingDirectory, directory));
    const candidates = isAbsolute(command) || command.includes("/") || command.includes("\\")
        ? [resolve(workingDirectory, command)]
        : directories.map((directory) => join(directory, command));
    const failures = [];
    for (const candidate of candidates) {
        try {
            await access(candidate, fsConstants.X_OK);
            if ((await stat(candidate)).isFile())
                return candidate;
            failures.push(`${candidate} (not a regular file)`);
        }
        catch (cause) {
            const code = osErrorCode(cause);
            if (code !== "ENOENT" && code !== "ENOTDIR")
                failures.push(`${candidate}${osFailure(cause)}`);
            continue;
        }
    }
    throw new ProcessCaptureError(failures.length === 0
        ? `executable could not be resolved: ${command}`
        : `executable could not be resolved: ${command}; checked ${failures.join("; ")}`);
};
const osErrorCode = (cause) => typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
    ? cause.code
    : undefined;
const osFailure = (cause) => {
    const code = osErrorCode(cause);
    return code === undefined ? "" : ` (${code})`;
};
/** Reject cancellation before a process capture operation begins. */
export const assertNotCancelled = (signal) => {
    if (signal?.aborted === true)
        throw processCaptureCancelled();
};
