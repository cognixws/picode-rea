export const issue = (facet, code, message, location) => ({
    facet,
    code,
    message,
    ...(location === undefined ? {} : { location }),
});
