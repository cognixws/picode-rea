import { execFile } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import { HopperCancelledError, HopperProcessError, HopperStartError, } from "../domain/hopperErrors.js";
import { err, ok } from "../domain/result.js";
import { cleanupOwnedProcessGroup } from "../process/ProcessOwnership.js";
import { execFileOutput } from "../process/ExecFileOutput.js";
import { spawnOwnedProviderProcess, } from "../process/ProviderProcess.js";
import { waitForAbortableDelay } from "../process/ProviderDeadline.js";
import { selectLinuxPrivateDisplayStrategy, } from "./LinuxPrivateDisplayProbe.js";
import writeFileAtomic from "write-file-atomic";
import { prepareHopperMachOImage, } from "./HopperMachOImage.js";
import { acquireHopperTargetLease } from "./HopperTargetLease.js";
const execFileAsync = promisify(execFile);
const HOPPER_BACKGROUND_STARTUP_MS = 5_000;
/**
 * Launches Hopper through its documented CLI and injects only REA's owned bridge.
 *
 * Hopper's `hopper` helper internally issues an AppleScript `activate` command.
 * Consequently, opening a target may bring Hopper to the foreground even though
 * REA first asks macOS to start the application hidden and in the background.
 * REA cannot reliably suppress that activation without replacing Hopper's
 * supported launcher; callers must treat possible foreground UI as an upstream
 * Hopper constraint, not as evidence that analysis failed.
 *
 * REA owns only the short-lived launcher helper's run-token-authenticated
 * process group. It does not claim ownership of the Hopper GUI process that
 * macOS LaunchServices may create or reuse.
 */
export class HopperApplicationLauncher {
    options;
    dependencies;
    constructor(options, dependencies = {}) {
        this.options = options;
        this.dependencies = dependencies;
    }
    async launch(session, options = {}) {
        const leaseResult = await this.#acquireTargetLease(session.runId);
        if (!leaseResult.ok)
            return leaseResult;
        const lease = leaseResult.value;
        let leaseTransferred = false;
        try {
            let loadedPath = this.options.targetPath;
            if (this.options.preparedImage !== undefined) {
                const prepared = await prepareHopperMachOImage(this.options.targetPath, this.options.preparedImage.sourceSha256, this.options.preparedImage.image, join(session.directory, "image.macho"), options.signal);
                if (!prepared.ok)
                    return prepared;
                loadedPath = prepared.value;
            }
            const ownsProcessLifetime = usesLinuxDemo(this.options);
            const bootstrap = await this.#writeBootstrap(session, ownsProcessLifetime, loadedPath);
            if (!bootstrap.ok)
                return bootstrap;
            const launched = await this.#launchPreparedTarget({
                session,
                signal: options.signal,
                bootstrapPath: bootstrap.value,
                loadedPath,
                ownsProcessLifetime,
                lease,
            });
            leaseTransferred = launched.ok;
            return launched;
        }
        finally {
            if (!leaseTransferred)
                await lease?.release();
        }
    }
    async #launchPreparedTarget(input) {
        const { session, signal, bootstrapPath, ownsProcessLifetime, lease } = input;
        const action = this.options.targetKind === "database" ? "--database" : "--executable";
        const argumentsForTarget = [
            ...this.options.loaderArgs,
            "--analysis",
            "-Y",
            bootstrapPath,
            action,
            input.loadedPath,
        ];
        try {
            if (signal?.aborted === true)
                return err(new HopperCancelledError());
            const display = await this.#privateDisplay(signal);
            if (!display.ok)
                return err(display.error);
            const prepared = await prepareHopperApplication(this.options.launcherPath, signal);
            if (!prepared)
                return err(new HopperCancelledError());
            const linuxDemo = linuxDemoLaunch(this.options, session, argumentsForTarget, display.strategy);
            const started = await launchHopperProcess({
                options: this.options,
                session,
                bootstrapPath,
                ownsProcessLifetime,
                argumentsForTarget,
                linuxDemo,
                signal,
            });
            if (started === null)
                return err(new HopperCancelledError());
            const cleanup = () => cleanupOwnedProcessGroup(started.ownership).finally(() => lease?.release());
            const ownership = {
                run_id: session.runId,
                pid: started.ownership.leaderPid,
                process_group_id: started.ownership.leaderPid,
                parent_pid: process.pid,
                launcher: linuxDemo?.command ?? this.options.launcherPath,
                created_at: new Date().toISOString(),
            };
            try {
                await writeFileAtomic(join(session.directory, "ownership.json"), `${JSON.stringify(ownership)}\n`, { encoding: "utf8", mode: 0o600 });
            }
            catch (cause) {
                await cleanupOwnedProcessGroup(started.ownership);
                return err(new HopperStartError({ cause }));
            }
            const ownedLauncher = {
                ...(this.options.preparedImage === undefined
                    ? {}
                    : { preparedImagePath: input.loadedPath }),
                process: started.process,
                ownsProcessLifetime: true,
                ownership: started.ownership,
                cleanup,
            };
            return ownsProcessLifetime
                ? ok({
                    ...ownedLauncher,
                    providerLifetime: "launcher-process",
                    shutdownMode: "process-cleanup",
                })
                : ok({
                    ...ownedLauncher,
                    providerLifetime: "external-application",
                    shutdownMode: "bridge-request",
                });
        }
        catch (cause) {
            return err(hopperLaunchFailure(cause, signal));
        }
    }
    async #acquireTargetLease(runId) {
        if ((this.dependencies.platform ?? process.platform) !== "darwin")
            return ok(undefined);
        try {
            const acquisition = await (this.dependencies.acquireTargetLease ?? acquireHopperTargetLease)({
                targetPath: this.options.targetPath,
                targetKind: this.options.targetKind,
                loaderArgs: this.options.loaderArgs,
                runId,
            });
            if (!acquisition.acquired)
                return err(new HopperStartError({
                    ownerRunId: acquisition.owner.runId,
                    userMessage: `This Hopper target is already open in REA session ${acquisition.owner.runId}. ` +
                        "Use that REA session or close it before opening this target again.",
                }));
            return ok(acquisition.lease);
        }
        catch (cause) {
            return err(new HopperStartError({ cause }));
        }
    }
    async #writeBootstrap(session, ownsProcessLifetime, loadedPath) {
        const bootstrapPath = `${session.directory}/bootstrap.py`;
        try {
            await writeFile(bootstrapPath, bridgeBootstrapSource(session, this.options, ownsProcessLifetime, loadedPath), { encoding: "utf8", mode: 0o600 });
            await chmod(bootstrapPath, 0o600);
            return ok(bootstrapPath);
        }
        catch (cause) {
            return err(new HopperStartError({ cause }));
        }
    }
    async #privateDisplay(signal) {
        if (!usesLinuxDemo(this.options))
            return { ok: true, strategy: undefined };
        const selection = await (this.dependencies.selectPrivateDisplay ??
            selectLinuxPrivateDisplayStrategy)({
            helperPath: this.options.demoHelperPath,
            ...(signal === undefined ? {} : { signal }),
        });
        if (signal?.aborted === true)
            return { ok: false, error: new HopperCancelledError() };
        return selection.ok
            ? { ok: true, strategy: selection.strategy }
            : {
                ok: false,
                error: new HopperProcessError(selection.exitCode, selection.diagnostic),
            };
    }
}
const bridgeBootstrapSource = (session, options, ownsProcessLifetime, loadedPath) => [
    `REA_SOCKET = ${JSON.stringify(session.socketPath)}`,
    `REA_TOKEN = ${JSON.stringify(session.token)}`,
    `REA_RUN_ID = ${JSON.stringify(session.runId)}`,
    `REA_TARGET_PATH = ${JSON.stringify(loadedPath)}`,
    `REA_OWNS_PROCESS_LIFETIME = ${ownsProcessLifetime ? "True" : "False"}`,
    `exec(compile(open(${JSON.stringify(options.bridgeScriptPath)}, 'rb').read(), ${JSON.stringify(options.bridgeScriptPath)}, 'exec'))`,
    "",
].join("\n");
const launchHopperProcess = async (input) => {
    const ownershipCommand = input.linuxDemo?.ownershipCommand ?? input.options.launcherPath;
    const spawn = (arguments_) => spawnOwnedProviderProcess({
        command: input.options.launcherPath,
        arguments: arguments_,
        runId: input.session.runId,
        expectedCommand: ownershipCommand,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (input.linuxDemo !== undefined)
        return spawnOwnedProviderProcess({
            command: input.linuxDemo.command,
            arguments: input.linuxDemo.args,
            runId: input.session.runId,
            expectedCommand: ownershipCommand,
            ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
    return spawn(input.argumentsForTarget);
};
export const linuxDemoLaunch = (options, session, hopperArgs, strategy) => {
    if (!usesLinuxDemo(options) || options.demoHelperPath === undefined)
        return undefined;
    const helperArguments = [
        options.demoHelperPath,
        "--strategy",
        strategy ?? "direct",
        ...(strategy === "user-mount-namespace" ? ["--mount-private-x11"] : []),
        "--hopper",
        options.launcherPath,
        "--socket",
        session.socketPath,
        "--",
        options.launcherPath,
        ...hopperArgs,
    ];
    if (strategy === "user-mount-namespace")
        return {
            command: "/usr/bin/unshare",
            ownershipCommand: "/usr/bin/python3",
            args: [
                "--user",
                "--map-root-user",
                "--mount",
                "--propagation",
                "private",
                "/usr/bin/python3",
                ...helperArguments,
            ],
        };
    return {
        command: "/usr/bin/python3",
        ownershipCommand: "/usr/bin/python3",
        args: helperArguments,
    };
};
const hopperLaunchFailure = (cause, signal) => signal?.aborted === true
    ? new HopperCancelledError()
    : new HopperStartError({ cause });
/** Select the version-pinned adapter from the caller's explicit launch mode. */
export const usesLinuxDemo = (options) => options.launchMode === "verified_linux_demo";
const prepareHopperApplication = async (launcherPath, signal) => {
    const appBundle = hopperApplicationBundle(launcherPath);
    if (appBundle === undefined)
        return signal?.aborted !== true;
    const executablePath = join(appBundle, "Contents/MacOS/Hopper Disassembler");
    if (await processIsRunning(executablePath))
        return signal?.aborted !== true;
    // This reduces activation when Hopper is cold, but the vendor launcher that
    // follows may still activate its window. See HopperApplicationLauncher.
    await execFileAsync("/usr/bin/open", [
        "--hide",
        "--background",
        "-a",
        appBundle,
    ]);
    return ((await waitForAbortableDelay(HOPPER_BACKGROUND_STARTUP_MS, signal)) ===
        "elapsed");
};
const hopperApplicationBundle = (launcherPath) => {
    if (basename(launcherPath) !== "hopper")
        return undefined;
    const candidate = dirname(dirname(dirname(launcherPath)));
    return extname(candidate) === ".app" ? candidate : undefined;
};
const processIsRunning = async (executablePath) => {
    try {
        const processes = await execFileOutput("/bin/ps", [
            "-ax",
            "-o",
            "command=",
        ]);
        return processes.stdout
            .split("\n")
            .some((command) => command.trim() === executablePath);
    }
    catch (cause) {
        // best-effort cleanup: optional process probing; failure means not running.
        void cause;
        return false;
    }
};
