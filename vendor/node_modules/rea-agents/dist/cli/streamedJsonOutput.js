import {} from "node:stream";
import { Filter } from "incur";
import { parseCliOutputArguments } from "../cliOutput.js";
import { writeJsonOutput } from "./jsonOutput.js";
/** Preserve Incur's JSON controls while streaming the complete result. */
export const createStreamedCliJsonOutput = (arguments_, destination) => {
    const options = parseCliOutputArguments(arguments_);
    if (options.parseError ||
        options.tokenCount ||
        options.tokenWindow ||
        (options.format !== "json" && options.format !== "jsonl"))
        return undefined;
    const format = options.format;
    let handled = false;
    let failed = false;
    return {
        get handled() {
            return handled;
        },
        get failed() {
            return failed;
        },
        async write(value, metadata) {
            if (metadata.format !== format)
                return false;
            const filtered = options.filterOutput
                ? Filter.apply(value, Filter.parse(options.filterOutput))
                : value;
            const meta = {
                command: metadata.command,
                duration: metadata.duration,
            };
            const document = options.fullOutput
                ? filtered === undefined
                    ? { ok: true, meta }
                    : { ok: true, data: filtered, meta }
                : filtered === undefined ||
                    filtered === null ||
                    typeof filtered === "function" ||
                    typeof filtered === "symbol"
                    ? {}
                    : filtered;
            // Once writing starts, a failed destination must not receive a second
            // document from Incur's error formatter.
            handled = true;
            try {
                await writeJsonOutput(document, destination, format);
            }
            catch (cause) {
                failed = true;
                throw cause;
            }
            return true;
        },
    };
};
