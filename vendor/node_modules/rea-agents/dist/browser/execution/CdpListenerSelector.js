import { AnalysisInputError } from "../../domain/analysisErrorCore.js";
import { CdpCommandRejection } from "../CdpCommandRejection.js";
/** Classify Chromium's selector syntax rejection without changing other command/transport failures. */
export const queryListenerSelector = async (session, nodeId, selector) => {
    try {
        return await session.command("DOM.querySelector", { nodeId, selector });
    }
    catch (cause) {
        if (cause instanceof CdpCommandRejection &&
            cause.command === "DOM.querySelector" &&
            cause.code === -32000 &&
            cause.reportedMessage === "DOM Error while querying")
            throw new AnalysisInputError(session.operation, { cause }, [
                {
                    path: ["selector"],
                    reason: "invalid_format",
                    message: `Chromium rejected the CSS selector syntax for target ${session.target.target_id}: ${selector}. ${cause.userMessage ?? cause.message}`,
                },
            ]);
        throw cause;
    }
};
