import * as t from "@babel/types";
import { sanitizeBrowserUrl } from "./browserObservation.js";
import { semanticStaticPropertyName } from "./javascript/javascriptAstValues.js";
/** Pick the endpoint argument for common network-call patterns. */
export const objectValue = (object, name) => {
    let value;
    for (const property of object.properties) {
        if (t.isSpreadElement(property)) {
            value = undefined;
            continue;
        }
        const key = semanticStaticPropertyName(property.key, property.computed);
        if (key === "" && !t.isStringLiteral(property.key))
            value = undefined;
        else if (key === name)
            value = t.isObjectProperty(property) ? property.value : undefined;
    }
    return value;
};
export const objectString = (object, name) => {
    const value = objectValue(object, name);
    return t.isStringLiteral(value) ? value.value : undefined;
};
/** Whether module syntax supplies a URL location without a package/import-map resolver. */
export const isUrlLikeModuleSpecifier = (specifier) => specifier.startsWith("/") ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(specifier);
export const resolveSpecifier = (specifier, base) => {
    try {
        const resolved = new URL(specifier, base);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:")
            return null;
        return sanitizeBrowserUrl(resolved.href).url;
    }
    catch (cause) {
        // Unresolvable specifiers are represented by the null return.
        void cause;
        return null;
    }
};
export const location = (scriptKey, node) => ({
    script_key: scriptKey,
    ...locationFields(node),
});
export const locationFields = (node) => ({
    line: node.loc?.start.line ?? null,
    column: node.loc?.start.column ?? null,
});
