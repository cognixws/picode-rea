/** Expected malformed, unsupported or oversized producer data at a historical decoder boundary. */
export class CaptureFormatError extends Error {
    reason;
    pointer;
    constructor(reason, message, pointer = "") {
        super(message);
        this.reason = reason;
        this.pointer = pointer;
    }
}
