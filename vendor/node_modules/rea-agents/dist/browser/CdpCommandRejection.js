import { BrowserObservationError } from "../domain/browserObservationError.js";
/** Preserve a producer's command rejection independently from fatal transport parsing errors. */
export class CdpCommandRejection extends BrowserObservationError {
    command;
    code;
    reportedMessage;
    constructor(operation, command, code, reportedMessage) {
        super(operation, "protocol_error", {
            detail: reportedMessage === null
                ? "CDP returned a malformed command error."
                : `CDP ${command} failed (${code === null ? "unknown code" : String(code)}): ${reportedMessage}`,
        });
        this.command = command;
        this.code = code;
        this.reportedMessage = reportedMessage;
    }
}
