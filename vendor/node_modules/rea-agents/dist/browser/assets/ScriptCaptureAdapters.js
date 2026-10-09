import { webPageInspectionSchema } from "../../domain/browserObservation.js";
import { browserScenarioCaptureSchema } from "../../domain/browserScenarioCapture.js";
import { parseEvidence } from "../../domain/evidence.js";
import { pageScripts } from "./PageScriptCapture.js";
import { scenarioScripts } from "./ScenarioScriptCapture.js";
/** Built-in adapters; add capture formats here without changing the publisher. */
export const SCRIPT_CAPTURE_ADAPTERS = [
    {
        operation: "inspect_web_page",
        parse: (input) => {
            const parsed = webPageInspectionSchema.safeParse(input);
            return parsed.success
                ? {
                    kind: "page-inspection",
                    completeness: parsed.data.completeness,
                    scripts: pageScripts(parsed.data),
                    limitations: parsed.data.limitations,
                }
                : undefined;
        },
    },
    {
        operation: "capture_browser_scenario",
        parse: (input) => {
            const parsed = browserScenarioCaptureSchema.safeParse(input);
            return parsed.success
                ? {
                    kind: "browser-scenario",
                    completeness: parsed.data.completeness,
                    scripts: scenarioScripts(parsed.data),
                    limitations: parsed.data.limitations,
                }
                : undefined;
        },
    },
];
/** Reject unsupported/malformed captures and tampered Evidence before writing. */
export const selectScriptCapture = (raw, adapters = SCRIPT_CAPTURE_ADAPTERS) => {
    if (typeof raw === "object" &&
        raw !== null &&
        ("normalized_result" in raw || "evidence_id" in raw)) {
        const evidence = parseEvidence(raw);
        const selected = adapters
            .find(({ operation }) => operation === evidence.operation)
            ?.parse(evidence.normalized_result);
        if (selected !== undefined)
            return { ...selected, sourceEvidenceId: evidence.evidence_id };
    }
    else {
        for (const adapter of adapters) {
            const selected = adapter.parse(raw);
            if (selected !== undefined)
                return { ...selected, sourceEvidenceId: null };
        }
    }
    throw new TypeError("Expected a valid inspect_web_page or capture_browser_scenario capture, with retained script sources or response bytes. Evidence envelopes must have a matching operation and semantic identifier.");
};
