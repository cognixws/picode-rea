import { jsonValueSchema } from "../domain/jsonValue.js";
import { nativeLoadImageObservationSchema, nativeLoadImageSchema, } from "../domain/native/nativeLoadImage.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import { err, ok } from "../domain/result.js";
import { attestGhidraDosComLoadImage, attestGhidraDosLoadImage, } from "./GhidraLoadImageValues.js";
/** Independently verify measured load-image observations for admitted DOS targets. */
export const attestGhidraNativeLoadImage = async (target, operation, measured, client, mapSessionError) => {
    const observations = nativeLoadImageObservationSchema.parse(measured);
    if (target.format !== "dos-mz" && target.format !== "dos-com") {
        return ok(jsonValueSchema.parse(nativeLoadImageSchema.parse({
            status: "unsupported",
            reason: "Independent load-image verification currently supports DOS MZ and explicit DOS COM targets only.",
            observations,
            limitations: [
                "Other formats expose measured mappings and source identities; no format-specific verification was performed.",
            ],
        })));
    }
    if (client.readTargetSnapshot === undefined)
        return err(new ProviderAdapterError("ghidra", operation, {
            diagnostics: {
                reason: "The Ghidra client does not expose its immutable target snapshot for independent load-image verification.",
            },
        }));
    const snapshot = await client.readTargetSnapshot();
    if (!snapshot.ok)
        return err(mapSessionError(snapshot.error));
    const attested = (target.format === "dos-com"
        ? attestGhidraDosComLoadImage
        : attestGhidraDosLoadImage)(snapshot.value, target.sha256 ?? "", observations);
    if (!attested.ok)
        return err(new ProviderAdapterError("ghidra", operation, {
            diagnostics: { reason: attested.error },
        }));
    return ok(jsonValueSchema.parse(attested.value));
};
