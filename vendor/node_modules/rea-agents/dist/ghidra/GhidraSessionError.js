/** Provider-owned failure with bounded, token-redacted local diagnostics. */
export class GhidraSessionError extends Error {
    kind;
    diagnostics;
    timeoutMs;
    remoteCode;
    constructor(kind, message, diagnostics = {}, options = {}) {
        super(message, options);
        this.kind = kind;
        this.name = "GhidraSessionError";
        this.diagnostics = structuredClone(diagnostics);
        this.timeoutMs = options.timeoutMs;
        this.remoteCode = options.remoteCode;
    }
}
/** Build a session failure while preserving bounded remote failure metadata. */
const createGhidraSessionError = (failure) => new GhidraSessionError(failure.kind, failure.message, {
    ...failure.diagnostics,
    failure_kind: failure.kind,
    failure_message: failure.message,
    ...(failure.remoteCode === undefined
        ? {}
        : {
            remote_code: failure.redact(failure.remoteCode),
            remote_message: failure.message,
        }),
}, {
    ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    ...(failure.timeoutMs === undefined
        ? {}
        : { timeoutMs: failure.timeoutMs }),
    ...(failure.remoteCode === undefined
        ? {}
        : { remoteCode: failure.remoteCode }),
});
/** Bind session-failure construction to a live, token-redacted diagnostic view. */
export const bindGhidraSessionFailure = (diagnostics, redact = (value) => value) => (kind, message, cause, options = {}) => createGhidraSessionError({
    kind,
    message: redact(message),
    diagnostics: {
        ...diagnostics(),
        ...(cause === undefined
            ? {}
            : { failure_cause: describeCause(cause, redact) }),
    },
    redact,
    ...(cause === undefined ? {} : { cause }),
    ...options,
});
const describeCause = (cause, redact) => {
    if (cause instanceof Error) {
        const code = "code" in cause ? cause.code : undefined;
        return {
            name: redact(cause.name),
            message: redact(cause.message),
            ...(typeof code === "string"
                ? { code: redact(code) }
                : typeof code === "number" && Number.isFinite(code)
                    ? { code }
                    : {}),
        };
    }
    if (typeof cause === "string")
        return { type: "string", message: redact(cause) };
    if (cause === null || typeof cause === "boolean")
        return { type: cause === null ? "null" : "boolean", value: cause };
    if (typeof cause === "number" && Number.isFinite(cause))
        return { type: "number", value: cause };
    return { type: typeof cause };
};
