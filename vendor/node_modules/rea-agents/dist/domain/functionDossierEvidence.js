import { parseEvidence } from "./evidence.js";
import { functionDossierSchema } from "./hopperValues.js";
const DOSSIER_COLLECTION_FIELDS = [
    "assembly",
    "comments",
    "callers",
    "callees",
    "incoming_references",
    "outgoing_references",
    "referenced_strings",
    "referenced_names",
    "basic_blocks",
];
/** Parse one complete analyze_function Evidence record for comparison workflows. */
export const parseFunctionEvidence = (input) => {
    const evidence = parseEvidence(input);
    if (evidence.operation !== "analyze_function")
        throw new TypeError("Function comparison requires analyze_function Evidence");
    if (evidence.subject === null)
        throw new TypeError("Function comparison requires artifact-bound Evidence");
    const dossier = functionDossierSchema.parse(evidence.normalized_result);
    return {
        evidence: [evidence],
        procedure: dossier.procedure,
        provider: evidence.provider,
        subject: evidence.subject,
        pseudocode: {
            text: dossier.pseudocode,
            total: [...dossier.pseudocode].length,
            complete: true,
            truncated: false,
        },
        collections: {
            assembly: completeCollection(dossier.assembly),
            comments: completeCollection(dossier.comments),
            callers: completeCollection(dossier.callers),
            callees: completeCollection(dossier.callees),
            incoming_references: completeCollection(dossier.incoming_references),
            outgoing_references: completeCollection(dossier.outgoing_references),
            referenced_strings: completeCollection(dossier.referenced_strings),
            referenced_names: completeCollection(dossier.referenced_names),
            basic_blocks: completeCollection(dossier.basic_blocks),
        },
        limitations: [
            ...new Set([...evidence.limitations, ...dossier.limitations]),
        ].sort((left, right) => left.localeCompare(right)),
    };
};
const completeCollection = (items) => ({
    items,
    total: items.length,
    complete: true,
    truncated: false,
});
