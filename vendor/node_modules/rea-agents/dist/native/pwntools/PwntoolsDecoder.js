import { pwntoolsDecoderFailure, pwntoolsUnavailable, capturedPwntoolsOutput, } from "./PwntoolsFailures.js";
import { randomUUID } from "node:crypto";
import { access, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readStableArtifact } from "../../artifacts/readStableArtifact.js";
import { AnalysisCancelledError, AnalysisCapabilityUnavailableError, AnalysisUnsupportedTargetError, AnalysisInputError, AnalysisOutputError, AnalysisResourceConstraintError, } from "../../domain/analysisErrorCore.js";
import { projectAnalysisError } from "../../domain/analysisErrorProjection.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { ProviderCleanupError } from "../../domain/providerCleanupError.js";
import { err, ok } from "../../domain/result.js";
import { runOwnedCommand } from "../../process/OwnedCommand.js";
import { OwnedCommandFailure } from "../../process/OwnedCommand.js";
import { pwntoolsResourceLimitsSchema, readPwntoolsFailureEvidence, } from "./PwntoolsResourceLimits.js";
import { PrivateRuntimeRoot } from "../../process/PrivateRuntimeRoot.js";
import { PWNTOOLS_PROVIDER_IDENTITY, PWNTOOLS_LIMITS, } from "./PwntoolsRelease.js";
/** Thin owned-process adapter; all ELF parsing and heuristics come from unchanged upstream code. */
export class PwntoolsDecoder {
    profile;
    environment;
    launcher;
    createRuntime;
    identity;
    constructor(profile, environment, launcher, createRuntime = () => PrivateRuntimeRoot.create({ prefix: "rea-artifact-decoder-" })) {
        this.profile = profile;
        this.environment = environment;
        this.launcher = launcher;
        this.createRuntime = createRuntime;
        this.identity = profile.identity;
    }
    /** Snapshot one explicit artifact and return complete static observations without launching the selected object as a host process. */
    async inspect(input, options) {
        const OPERATION = this.profile.operation;
        const context = { operation: OPERATION, providerId: this.identity.id };
        const replySchema = z.discriminatedUnion("ok", [
            z.strictObject({
                ok: z.literal(true),
                profile: z.literal(PWNTOOLS_PROVIDER_IDENTITY.version),
                value: this.profile.payloadSchema,
            }),
            z.strictObject({
                ok: z.literal(false),
                reason: z.enum([
                    "format",
                    "unsupported",
                    "unsupported-target",
                    "unavailable",
                    "resource-limit",
                    "output-limit",
                    "decoder",
                ]),
                message: z.string(),
                reported_limits: pwntoolsResourceLimitsSchema.nullable().optional(),
            }),
        ]);
        let root;
        let result;
        let phase = "configuration";
        const executablePath = this.environment.REA_PWNTOOLS_PYTHON ?? "";
        let selectedPath = executablePath;
        try {
            if (options?.signal?.aborted)
                throw new AnalysisCancelledError(OPERATION);
            if (process.platform !== "linux" || process.arch !== "x64")
                throw new AnalysisCapabilityUnavailableError(this.identity.id, OPERATION, "The initial real-verified pwntools artifact profile supports Linux x64 only.");
            if (!isAbsolute(selectedPath))
                throw pwntoolsUnavailable("Set REA_PWNTOOLS_PYTHON to an absolute caller-supplied Python executable with pwntools 4.15.0, pyelftools 0.33 and Unicorn 2.1.2; REA never installs Python or packages.", selectedPath, undefined, undefined, context);
            await access(selectedPath, constants.X_OK);
            if (!(await stat(selectedPath)).isFile())
                throw pwntoolsUnavailable("Selected Python executable must be a regular executable file, not a directory: " +
                    selectedPath, selectedPath, undefined, undefined, context);
            phase = "artifact-read";
            selectedPath = input.path;
            const snapshot = await readStableArtifact(input.path, PWNTOOLS_LIMITS.inputBytes, options?.signal);
            phase = "decoder";
            root = await this.createRuntime();
            const requestPath = join(root.path, "request.json");
            const snapshotPath = join(root.path, "object.snapshot");
            const replyPath = join(root.path, "reply.json");
            await writeFile(snapshotPath, snapshot.bytes, {
                flag: "wx",
                mode: 0o600,
                ...(options?.signal === undefined ? {} : { signal: options.signal }),
            });
            await writeFile(requestPath, JSON.stringify({ snapshot_path: snapshotPath, reply_path: replyPath }), { flag: "wx", mode: 0o600 });
            const execution = await runOwnedCommand({
                command: this.environment.REA_PWNTOOLS_PYTHON ?? "",
                arguments: [
                    "-I",
                    fileURLToPath(this.profile.bridge),
                    join(root.path, "resource.failure"),
                    requestPath,
                ],
                cwd: root.path,
                runId: `rea-artifact-decoder-${randomUUID()}`,
                hostEnvironment: {
                    ...this.environment,
                    PWNLIB_NOTERM: "1",
                    OPENBLAS_NUM_THREADS: "1",
                    OMP_NUM_THREADS: "1",
                },
            }, {
                timeoutMs: PWNTOOLS_LIMITS.timeoutMs,
                diagnosticBytes: PWNTOOLS_LIMITS.diagnosticBytes,
            }, {
                ...(options?.signal === undefined ? {} : { signal: options.signal }),
                ...(this.launcher === undefined ? {} : { launcher: this.launcher }),
            });
            const capturedOutput = capturedPwntoolsOutput(execution);
            let reply;
            try {
                const file = await readStableArtifact(replyPath, PWNTOOLS_LIMITS.outputBytes, options?.signal);
                reply = replySchema.parse(JSON.parse(file.bytes.toString("utf8")));
            }
            catch (cause) {
                if (options?.signal?.aborted)
                    throw new AnalysisCancelledError(OPERATION, { capturedOutput });
                throw new AnalysisOutputError(OPERATION, `Owned pwntools decoder reply failed for ${input.path}: ${cause instanceof z.ZodError ? cause.issues[0]?.message + " at " + (cause.issues[0]?.path.map(String).join(".") ?? "root") : cause instanceof Error ? cause.message : String(cause)}`, { cause, capturedOutput });
            }
            if (!reply.ok) {
                if (reply.reason === "unsupported-target")
                    throw new AnalysisUnsupportedTargetError(OPERATION, input.path, reply.message, { capturedOutput });
                if (reply.reason === "resource-limit")
                    throw new AnalysisResourceConstraintError(OPERATION, "memory", reply.message, reply.reported_limits ?? null, { capturedOutput });
                if (reply.reason === "format")
                    throw new AnalysisInputError(OPERATION, { capturedOutput }, [
                        {
                            path: ["path"],
                            reason: "invalid_format",
                            message: reply.message,
                        },
                    ]);
                if (reply.reason === "unavailable")
                    throw pwntoolsUnavailable(reply.message, this.environment.REA_PWNTOOLS_PYTHON ?? "", undefined, capturedOutput, context);
                if (reply.reason === "unsupported")
                    throw new AnalysisCapabilityUnavailableError(this.identity.id, OPERATION, reply.message, { userMessage: reply.message, capturedOutput });
                if (reply.reason === "output-limit")
                    throw new AnalysisOutputError(OPERATION, reply.message, {
                        capturedOutput,
                    });
                throw new ProviderAdapterError(this.identity.id, OPERATION, {
                    diagnostics: {
                        phase,
                        failure_kind: reply.reason,
                        reason: reply.message,
                        stdout: execution.stdout.text,
                        stderr: execution.stderr.text,
                        captured_output: { ...capturedOutput },
                    },
                });
            }
            result = ok(await this.profile.project({
                input,
                payload: reply.value,
                snapshot,
                rootPath: root.path,
                diagnostics: capturedOutput,
                options,
            }));
        }
        catch (cause) {
            const evidence = await readPwntoolsFailureEvidence(cause, root?.path);
            result = err(options?.signal?.aborted &&
                (cause === options.signal.reason ||
                    (cause instanceof Error && cause.name === "AbortError"))
                ? new AnalysisCancelledError(OPERATION)
                : pwntoolsDecoderFailure(cause, phase, selectedPath, executablePath, evidence, context));
        }
        if (root !== undefined) {
            try {
                await root.close();
            }
            catch (cause) {
                return err(new ProviderCleanupError(this.identity.id, [root.path], {
                    reason: cause instanceof Error ? cause.message : String(cause),
                    previous_error: result.ok
                        ? null
                        : projectAnalysisError(result.error),
                    ...(result.ok
                        ? {
                            captured_output: {
                                stdout: result.value.diagnostics.stdout,
                                stderr: result.value.diagnostics.stderr,
                                truncated: result.value.diagnostics.truncated,
                            },
                        }
                        : {}),
                }, { operation: OPERATION }));
            }
        }
        return result.ok && options?.signal?.aborted
            ? err(new AnalysisCancelledError(OPERATION, {
                capturedOutput: {
                    stdout: result.value.diagnostics.stdout,
                    stderr: result.value.diagnostics.stderr,
                    truncated: result.value.diagnostics.truncated,
                },
            }))
            : result;
    }
}
