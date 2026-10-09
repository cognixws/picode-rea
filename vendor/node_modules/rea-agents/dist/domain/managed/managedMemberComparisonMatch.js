import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { managedMemberInspectionSchema, } from "./managedArtifact.js";
import { parseManagedInspectionEvidence } from "./managedInspectionEvidence.js";
export const sha256 = (value) => {
    const serialized = canonicalize(value);
    if (serialized === undefined)
        throw new TypeError("Managed comparison canonicalization failed");
    return createHash("sha256").update(serialized).digest("hex");
};
const keyMethod = (item) => ({
    item,
    exactKey: item.body.status === "present" && item.body.normalized_il_sha256 !== null
        ? stableKey([
            "method-exact",
            item.signature.raw_sha256,
            item.body.normalized_il_sha256,
        ])
        : null,
    // The raw blob is the exact signature; decoding only feeds shape keys.
    signatureKey: stableKey([
        "method-signature",
        item.declaring_type,
        item.name,
        item.signature.raw_sha256,
    ]),
    structuralKey: item.signature.parse_status === "decoded" && item.body.status === "present"
        ? stableKey([
            "method-structural",
            item.signature.kind,
            item.signature.calling_convention,
            item.signature.generic_parameter_count,
            item.signature.parameter_count,
            item.signature.return_type,
            item.signature.parameter_types,
            item.body.status,
            item.body.header_format,
            item.body.il_size,
            item.body.max_stack,
            item.body.init_locals,
            item.body.opcode_counts,
            item.body.anchors.map(({ opcode, operand_kind }) => [
                opcode,
                operand_kind,
            ]),
            item.body.exception_regions.map((region) => [
                region.flags,
                region.try_length,
                region.handler_length,
                region.class_token === null ? null : "type-token",
                region.filter_offset === null ? null : "filter",
            ]),
        ])
        : null,
});
const keyField = (item) => ({
    item,
    exactKey: item.signature.parse_status === "decoded"
        ? stableKey(["field-exact", item.signature.raw_sha256])
        : null,
    // Only an undecoded field reaches this round: a decoded field with the
    // same raw signature already met its counterpart in the exact round.
    signatureKey: stableKey([
        "field-signature",
        item.declaring_type,
        item.name,
        item.signature.raw_sha256,
    ]),
    structuralKey: stableKey([
        "field-structural",
        item.signature.kind,
        item.signature.field_type,
        item.flags,
    ]),
});
const stableKey = (value) => sha256(value);
const matchMethods = (left, right) => matchByKeys({
    left,
    right,
    exactBasis: "exact-il-signature",
    fallbackBases: [
        {
            basis: "exact-signature",
            key: ({ signatureKey }) => signatureKey,
        },
        {
            basis: "structural-method-shape",
            key: ({ structuralKey }) => structuralKey,
        },
    ],
});
const matchFields = (left, right) => matchByKeys({
    left,
    right,
    exactBasis: "field-signature",
    fallbackBases: [
        {
            basis: "exact-signature",
            key: ({ signatureKey }) => signatureKey,
        },
    ],
});
const matchByKeys = ({ left, right, exactBasis, fallbackBases, }) => {
    const usedLeft = new Set();
    const usedRight = new Set();
    const pairs = [];
    const ambiguous = [];
    const rounds = [
        { basis: exactBasis, key: ({ exactKey }) => exactKey },
        ...fallbackBases,
    ];
    for (const round of rounds) {
        const leftGroups = groupBy(left.filter((item) => !usedLeft.has(item)), round.key);
        const rightGroups = groupBy(right.filter((item) => !usedRight.has(item)), round.key);
        for (const [key, leftItems] of leftGroups) {
            const rightItems = rightGroups.get(key);
            if (rightItems === undefined)
                continue;
            if (leftItems.length === 1 && rightItems.length === 1) {
                const [leftItem] = leftItems;
                const [rightItem] = rightItems;
                if (leftItem === undefined || rightItem === undefined)
                    continue;
                usedLeft.add(leftItem);
                usedRight.add(rightItem);
                pairs.push({
                    left: leftItem,
                    right: rightItem,
                    basis: round.basis,
                    confidence: round.basis === "exact-il-signature" ||
                        round.basis === "exact-signature" ||
                        round.basis === "field-signature"
                        ? "exact"
                        : "high",
                });
            }
            else {
                for (const item of leftItems)
                    usedLeft.add(item);
                for (const item of rightItems)
                    usedRight.add(item);
                ambiguous.push({
                    left: leftItems,
                    right: rightItems,
                    basis: round.basis,
                });
            }
        }
    }
    return {
        pairs,
        ambiguous,
        leftOnly: left.filter((item) => !usedLeft.has(item)),
        rightOnly: right.filter((item) => !usedRight.has(item)),
    };
};
const groupBy = (items, keyOf) => {
    const grouped = new Map();
    for (const item of items) {
        const key = keyOf(item);
        if (key === null)
            continue;
        const bucket = grouped.get(key) ?? [];
        bucket.push(item);
        grouped.set(key, bucket);
    }
    return grouped;
};
export const keyMembers = (left, right) => ({
    methodMatches: matchMethods(left.result.methods.map(keyMethod), right.result.methods.map(keyMethod)),
    fieldMatches: matchFields(left.result.fields.map(keyField), right.result.fields.map(keyField)),
});
export const parseManagedMemberEvidence = (evidence) => {
    const parsed = parseManagedInspectionEvidence(evidence, "inspect_managed_members", managedMemberInspectionSchema);
    return {
        evidenceId: parsed.evidence.evidence_id,
        result: parsed.result,
    };
};
