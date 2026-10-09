import { join } from "node:path";
import { Readable } from "node:stream";
import { AnalysisOutputError } from "../../domain/analysisErrorCore.js";
import { javascriptRecoveryResultSchema, } from "../../domain/javascript/javascriptRecovery.js";
import { readRecoveryFile, recoveryDigest } from "./RecoveryFiles.js";
import { recoveryRanges, validateRecoverySourceMap, } from "./WakaruReport.js";
import { RECOVERY_LIMITATIONS, RECOVERY_LIMITS, WAKARU_RELEASE, } from "./WakaruRelease.js";
/** Write validated artifacts to one exclusively owned, rollback-capable tree. */
export const publishWakaruArtifacts = async (context) => {
    const { tree, source, parsed, staging, signal } = context;
    const write = async (path, bytes) => {
        const sha256 = recoveryDigest(bytes);
        const file = await tree.write(path, Readable.from([bytes]), sha256, signal);
        return {
            path: join(tree.outputRoot, file.relativePath),
            sha256: file.sha256,
            bytes: file.bytesWritten,
        };
    };
    const snapshot = await readRecoveryFile(source.snapshot_path, RECOVERY_LIMITS.inputBytes, signal);
    if (recoveryDigest(snapshot) !== source.sha256)
        throw new AnalysisOutputError("recover_javascript_sources", "The input snapshot changed during recovery");
    const publishedCopy = await write("inputs/bundle.js", snapshot);
    const modules = [];
    for (const module of parsed.report.modules) {
        modules.push(await publishModule(context, module, write));
    }
    const report = await write("reports/stdout.json", Buffer.from(context.execution.stdout));
    const provenance = await write("reports/provenance.json", await readRecoveryFile(join(staging, "provenance.json"), RECOVERY_LIMITS.reportBytes, signal));
    const details = {
        source: { ...source, published_copy: publishedCopy },
        engine: {
            id: "wakaru",
            version: WAKARU_RELEASE.version,
            executable: {
                path: context.engine.command,
                sha256: context.engine.sha256,
                bytes: context.engine.bytes,
            },
            audited_source_revision: WAKARU_RELEASE.revision,
            executed_source_revision: null,
        },
        options: {
            extraction_mode: context.input.extraction_mode,
            rewrite_level: context.input.rewrite_level,
        },
        status: parsed.status,
        detected_formats: parsed.report.detected_formats,
        reported_safety: parsed.report.safety,
        reported_strategy: parsed.provenance.strategy,
        reported_format: parsed.provenance.format,
        total: parsed.report.total,
        failed: parsed.report.failed,
        modules,
        warnings: parsed.report.warnings,
        report,
        provenance,
        analysis_input: modules.length === 0
            ? null
            : {
                input_path: join(tree.outputRoot, "modules"),
                format: "directory",
            },
        runtime_equivalence: "unknown",
        limitations: [...RECOVERY_LIMITATIONS],
    };
    const manifest = await write("manifest.json", Buffer.from(`${JSON.stringify(details, null, 2)}\n`));
    return javascriptRecoveryResultSchema.parse({ ...details, manifest });
};
const publishModule = async (context, module, write) => {
    const { staging, source, parsed, signal } = context;
    const artifact = await write(`modules/${module.filename}`, await readRecoveryFile(join(staging, module.filename), RECOVERY_LIMITS.outputBytes, signal));
    const mapPath = join(staging, `${module.filename}.map`);
    let sourceMap = null;
    const map = await readRecoveryFile(mapPath, RECOVERY_LIMITS.outputBytes, signal).catch((cause) => {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
            return null;
        throw cause;
    });
    if (map !== null) {
        validateRecoverySourceMap(map, module.filename);
        sourceMap = await write(`modules/${module.filename}.map`, map);
    }
    const provenance = parsed.provenance.modules[module.filename];
    if (provenance === undefined)
        throw new AnalysisOutputError("recover_javascript_sources", `Missing module provenance: ${module.filename}`);
    return {
        reported_filename: module.filename,
        reported_status: module.status,
        artifact,
        source_map: sourceMap,
        provenance: {
            reported_input: provenance.input,
            original_path: source.path,
            original_sha256: source.sha256,
            extraction: provenance.extraction,
            byte_ranges: recoveryRanges(provenance.ranges),
            context_byte_ranges: recoveryRanges(provenance.context_ranges ?? []),
            range_semantics: "half-open-utf8-bytes",
        },
    };
};
