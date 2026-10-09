import { z } from "zod";
import { AnalysisOutputError } from "../domain/analysisErrorCore.js";
import {} from "../domain/analysisErrorBase.js";
import { err, ok } from "../domain/result.js";
const LITERAL_SEARCH_SOURCES = [
    ["search_strings", "string"],
    ["search_procedures", "procedure"],
];
/** Trace matching strings and procedures through provider xrefs. */
export const traceLiteralFeature = async (call, input, signal) => {
    const searched = await literalMatches(call, input, LITERAL_SEARCH_SOURCES, signal);
    if (!searched.ok)
        return searched;
    const traced = await traceReferences(call, {
        matches: searched.value.matches,
        ...(signal === undefined ? {} : { signal }),
    });
    if (!traced.ok)
        return traced;
    return ok({
        query: input.query,
        search_mode: "literal",
        matches: searched.value.matches,
        references: traced.value.references,
        truncated: false,
        residual_unknowns: [],
    });
};
const literalMatches = async (call, input, sources, signal) => {
    const matches = [];
    const matched = new Set();
    for (const [tool, type] of sources) {
        const result = await call(tool, {
            pattern: input.query,
            mode: "literal",
            case_sensitive: input.case_sensitive,
        }, signal);
        if (!result.ok)
            return result;
        const items = z
            .array(z.object({ address: z.string(), value: z.string() }))
            .safeParse(result.value);
        if (!items.success)
            return err(new AnalysisOutputError(tool, "provider returned an invalid search result"));
        addPageMatches({
            items: items.data.map(({ address, value: name }) => ({
                address,
                name,
            })),
            type,
            matches,
            matched,
        });
    }
    return ok({ matches });
};
const addPageMatches = (input) => {
    const { items, type, matches, matched } = input;
    for (const item of items) {
        const key = `${type}\u0000${item.address}`;
        if (matched.has(key))
            continue;
        matches.push({ type, address: item.address, value: item.name });
        matched.add(key);
    }
};
const traceReferences = async (call, request) => {
    const references = [];
    for (const match of request.matches) {
        const xrefs = await call("xrefs", { address: match.address }, request.signal);
        if (!xrefs.ok)
            return xrefs;
        if (!Array.isArray(xrefs.value))
            return err(new AnalysisOutputError("xrefs", "provider returned a non-array result"));
        for (const source of xrefs.value) {
            if (typeof source !== "string")
                return err(new AnalysisOutputError("xrefs", "provider returned a non-address value"));
            const resolved = await call("resolve_containing_procedure", { address: source }, request.signal);
            if (!resolved.ok)
                return resolved;
            references.push({
                target_address: match.address,
                source_address: source,
                containing_procedure: resolved.value,
            });
        }
    }
    return ok({ references });
};
