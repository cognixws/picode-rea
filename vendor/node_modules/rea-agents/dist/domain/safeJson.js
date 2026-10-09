/** Parse JSON text, returning the failure reason instead of throwing. */
export const safeParseJson = (value) => {
    try {
        return { ok: true, value: JSON.parse(value) };
    }
    catch (cause) {
        return {
            ok: false,
            error: cause instanceof Error ? cause.message : String(cause),
            cause,
        };
    }
};
