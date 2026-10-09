import { hopperStartupFailure, } from "../domain/hopperStartupFailure.js";
import { parseLinuxPrivateDisplayDiagnostic } from "./LinuxPrivateDisplayDiagnostic.js";
/** Extract only a matching Linux adapter failure record. */
export const hopperLauncherFailureDiagnostic = (event) => {
    const parsed = parseLinuxPrivateDisplayDiagnostic(event.snapshot.stderr.text);
    if (!parsed.ok)
        return undefined;
    const expected = hopperStartupFailure(event.code)?.code;
    return parsed.value.operation === "launch" &&
        parsed.value.status === "error" &&
        parsed.value.failure_code === expected
        ? parsed.value
        : undefined;
};
