/** Construct a successful result. */
export const ok = (value) => ({ ok: true, value });
/** Construct a failed result. */
export const err = (error) => ({ ok: false, error });
