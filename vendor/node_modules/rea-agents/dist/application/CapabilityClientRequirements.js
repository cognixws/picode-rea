/** Empty MCP client feature declaration used when the caller supplies none. */
export const NO_CLIENT_FEATURES = {
    elicitation_form: false,
    elicitation_url: false,
    roots: false,
    sampling: false,
};
/** Project a tool's client requirements against the negotiated feature set. */
export const clientRequirementsFor = (_name, clientFeatures) => {
    const requirements = { required: [], optional: [] };
    return {
        required: [...requirements.required],
        optional: [...requirements.optional],
        missing_required: requirements.required.filter((feature) => !clientFeatures[feature]),
        missing_optional: requirements.optional.filter((feature) => !clientFeatures[feature]),
    };
};
