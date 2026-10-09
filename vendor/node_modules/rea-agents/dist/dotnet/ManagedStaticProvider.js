import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createAnalysisExecution, } from "../application/AnalysisProvider.js";
import { MANAGED_STATIC_PROVIDER_IDENTITY as IDENTITY, managedStaticCapabilities, } from "./ManagedStaticProviderMetadata.js";
import { MANAGED_TOOL_CONTRACTS, managedArtifactInputSchema, managedMemberInputSchema, managedNativeBoundaryInputSchema, } from "../contracts/managed/managedToolContracts.js";
import { AnalysisCancelledError, AnalysisCapabilityUnavailableError, } from "../domain/analysisErrorCore.js";
import { EvidenceIntegrityError } from "../domain/evidenceErrors.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import { err, ok } from "../domain/result.js";
import { inspectManagedArtifactBytes } from "./ManagedArtifactInspector.js";
import { inspectManagedMembersBytes } from "./ManagedMemberInspector.js";
import { inspectManagedNativeBoundariesBytes } from "./ManagedNativeBoundaryInspector.js";
/** Execution-free managed PE/CLI auxiliary provider. */
export class ManagedStaticProvider {
    #capabilities = managedStaticCapabilities();
    identity() {
        return IDENTITY;
    }
    capabilities() {
        return this.#capabilities;
    }
    createClient(target) {
        return new ManagedStaticClient(target);
    }
}
class ManagedStaticClient {
    target;
    #snapshotBytes;
    constructor(target) {
        this.target = target;
    }
    async execute(operation, parameters, options) {
        if (operation === "health")
            return ok(createAnalysisExecution(null, IDENTITY));
        if (!isManagedOperation(operation))
            return err(new AnalysisCapabilityUnavailableError(IDENTITY.id, operation, "Operation is not implemented by the managed static provider."));
        if (this.target.format !== "pe")
            return err(new AnalysisCapabilityUnavailableError(IDENTITY.id, operation, `Managed static triage requires a PE target; observed ${this.target.format}.`));
        try {
            if (options?.signal?.aborted === true)
                return err(new AnalysisCancelledError(operation));
            const snapshot = this.#snapshotBytes;
            const observed = snapshot === undefined
                ? await readManagedSnapshot(this.target.path, options?.signal)
                : await hashManagedSource(this.target.path, options?.signal);
            if (observed.sha256 !== this.target.sha256)
                return err(new EvidenceIntegrityError(`Managed artifact digest changed after open: expected ${this.target.sha256}, observed ${observed.sha256} at ${this.target.path}`));
            const bytes = snapshot ?? observed.bytes;
            if (bytes === undefined)
                throw new TypeError("Managed snapshot bytes are unavailable");
            this.#snapshotBytes = bytes;
            const result = inspectManagedOperation(operation, parameters, bytes, this.target);
            return ok(createAnalysisExecution(result, IDENTITY, {
                rawResult: null,
                limitations: result.limitations,
                subject: this.target,
                locations: managedLocations(result),
            }));
        }
        catch (cause) {
            if (options?.signal?.aborted === true)
                return err(new AnalysisCancelledError(operation));
            return err(new ProviderAdapterError(IDENTITY.id, operation, { cause }));
        }
    }
    close() {
        this.#snapshotBytes = undefined;
        return Promise.resolve();
    }
}
const readManagedSnapshot = async (path, signal) => {
    const bytes = await readFile(path, signal === undefined ? undefined : { signal });
    return {
        byteLength: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
    };
};
const hashManagedSource = async (path, signal) => {
    const digest = createHash("sha256");
    let byteLength = 0;
    const stream = createReadStream(path, signal === undefined ? undefined : { signal });
    for await (const chunk of stream) {
        if (!Buffer.isBuffer(chunk))
            throw new TypeError("Managed source stream returned non-buffer data");
        if (chunk.length > Number.MAX_SAFE_INTEGER - byteLength)
            throw new RangeError("Managed source byte length overflowed");
        byteLength += chunk.length;
        digest.update(chunk);
    }
    return { byteLength, sha256: digest.digest("hex") };
};
const isManagedOperation = (operation) => MANAGED_TOOL_CONTRACTS.some(({ name }) => name === operation);
const inspectManagedOperation = (operation, parameters, bytes, target) => {
    if (operation === "inspect_managed_artifact") {
        managedArtifactInputSchema.parse(parameters);
        return inspectManagedArtifactBytes(bytes, target);
    }
    if (operation === "inspect_managed_native_boundaries") {
        managedNativeBoundaryInputSchema.parse(parameters);
        return inspectManagedNativeBoundariesBytes(bytes, target);
    }
    managedMemberInputSchema.parse(parameters);
    return inspectManagedMembersBytes(bytes, target);
};
const managedLocations = (result) => {
    if ("pe" in result) {
        if (result.pe.cli === null)
            return [{ kind: "file-offset", offset: 0 }];
        return [
            {
                kind: "file-offset-range",
                start: result.pe.cli.header_offset,
                end: result.pe.cli.header_offset + result.pe.cli.header_size,
            },
            ...[result.module, result.assembly]
                .filter((value) => value !== null)
                .map((value) => ({
                kind: "file-offset",
                offset: value.row_offset,
            })),
        ];
    }
    if ("methods" in result)
        return [
            ...(result.module === null
                ? [{ kind: "file-offset", offset: 0 }]
                : [{ kind: "file-offset", offset: result.module.row_offset }]),
            ...result.methods
                .filter((method) => method.body.file_offset !== null)
                .map((method) => ({
                kind: "file-offset",
                offset: method.body.file_offset ?? 0,
            })),
        ];
    return [
        ...(result.module === null
            ? [{ kind: "file-offset", offset: 0 }]
            : [{ kind: "file-offset", offset: result.module.row_offset }]),
        ...result.pinvoke_imports.map((mapping) => ({
            kind: "file-offset",
            offset: mapping.row_offset,
        })),
    ];
};
