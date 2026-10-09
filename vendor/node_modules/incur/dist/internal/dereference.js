/**
 * Dereferences all local `$ref` pointers in a JSON object (e.g. `{"$ref": "#/components/schemas/User"}`),
 * replacing them inline with the resolved values. Only handles local (`#/...`) references.
 *
 * Handles circular references by caching a mutable placeholder before recursing.
 *
 * Minimal reimplementation of the dereferencing behavior from `@apidevtools/json-schema-ref-parser`
 * (https://github.com/APIDevTools/json-schema-ref-parser). Only supports in-memory, local-pointer
 * resolution — no file/URL resolution, no `$id` scoping.
 */
export function dereference(root) {
    const cache = new Map();
    return walk(root, root, cache);
}
function walk(node, root, cache) {
    if (Array.isArray(node))
        return node.map((item) => walk(item, root, cache));
    if (typeof node !== 'object' || node === null)
        return node;
    const obj = node;
    // Resolve $ref pointer
    if (typeof obj.$ref === 'string' && obj.$ref.startsWith('#')) {
        const ref = obj.$ref;
        if (cache.has(ref))
            return cache.get(ref);
        const resolved = resolvePointer(root, ref);
        // Non-object targets (primitives, arrays) can't be circular — resolve directly
        if (typeof resolved !== 'object' || resolved === null || Array.isArray(resolved)) {
            const dereferenced = walk(resolved, root, cache);
            cache.set(ref, dereferenced);
            return dereferenced;
        }
        // Use a mutable placeholder so circular refs resolve to the same object.
        // If the walked result is not a plain object (e.g. chained ref to primitive/array),
        // skip the placeholder and cache directly.
        const placeholder = {};
        cache.set(ref, placeholder);
        const dereferenced = walk(resolved, root, cache);
        if (typeof dereferenced !== 'object' || dereferenced === null || Array.isArray(dereferenced)) {
            cache.set(ref, dereferenced);
            return dereferenced;
        }
        Object.assign(placeholder, dereferenced);
        return placeholder;
    }
    const result = {};
    for (const key of Object.keys(obj))
        result[key] = walk(obj[key], root, cache);
    return result;
}
/** Resolves a JSON Pointer (e.g. `#/components/schemas/User`) against a root object. */
function resolvePointer(root, pointer) {
    // "#" or "#/" → root
    const fragment = pointer.slice(1);
    if (fragment === '' || fragment === '/')
        return root;
    const parts = fragment
        .slice(1)
        .split('/')
        .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = root;
    for (const part of parts) {
        if (typeof current !== 'object' || current === null)
            throw new Error(`Cannot resolve $ref "${pointer}": path segment "${part}" not found`);
        current = current[part];
        if (current === undefined)
            throw new Error(`Cannot resolve $ref "${pointer}": "${part}" not found`);
    }
    return current;
}
//# sourceMappingURL=dereference.js.map