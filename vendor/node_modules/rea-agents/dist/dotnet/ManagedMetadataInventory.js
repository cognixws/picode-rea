import { METADATA_TABLE_NAMES, } from "./ManagedMetadataLayout.js";
import { readAssembly, readAssemblyReference, readCustomAttribute, readModule, readResource, } from "./ManagedMetadataInventoryRows.js";
import { metadataToken } from "./ManagedMetadataHeaps.js";
import { ManagedReaderFailure } from "./ManagedReaderFailure.js";
const safeRead = (operation, issues) => {
    try {
        return operation();
    }
    catch (cause) {
        if (!(cause instanceof ManagedReaderFailure))
            throw cause;
        issues.push(cause.issue);
        return undefined;
    }
};
const readRows = (descriptor, read) => {
    const total = descriptor?.rowCount ?? 0;
    const items = [];
    for (let index = 0; index < total; index += 1) {
        const item = read(index + 1);
        if (item !== undefined)
            items.push(item);
    }
    return items;
};
const uniqueIssues = (issues) => [
    ...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values(),
];
const heapExtent = (layout) => Math.max(layout.strings.size, layout.blob.size);
const validateIdentityTableCounts = (layout, issues) => {
    const moduleRows = layout.table(0)?.rowCount ?? 0;
    if (moduleRows !== 1)
        issues.push({
            code: "invalid-row",
            scope: "metadata.Module",
            offset: layout.table(0)?.offset ?? null,
            detail: `Module table must contain exactly one row; found ${String(moduleRows)}`,
        });
    const assemblyRows = layout.table(32)?.rowCount ?? 0;
    if (assemblyRows > 1)
        issues.push({
            code: "invalid-row",
            scope: "metadata.Assembly",
            offset: layout.table(32)?.offset ?? null,
            detail: `Assembly table can contain at most one row; found ${String(assemblyRows)}`,
        });
};
const readReferences = (bytes, layout, issues) => {
    const references = readRows(layout.table(35), (row) => safeRead(() => readAssemblyReference(bytes, layout, row, heapExtent(layout)), issues));
    return {
        references,
        referenceNames: [...new Set(references.map(({ name }) => name))].sort(),
    };
};
const readResources = ({ bytes, layout, resourceDirectory, issues, }) => readRows(layout.table(40), (row) => safeRead(() => readResource({
    bytes,
    layout,
    row,
    directory: resourceDirectory,
    issues,
}), issues));
const readAttributes = (bytes, layout, issues) => {
    const attributes = readRows(layout.table(12), (row) => safeRead(() => readCustomAttribute(bytes, layout, row, heapExtent(layout)), issues));
    const targetFrameworks = new Set();
    for (const attribute of attributes) {
        if (attribute.parent_token === metadataToken(32, 1) &&
            attribute.type_name ===
                "System.Runtime.Versioning.TargetFrameworkAttribute" &&
            attribute.decoded_fixed_string !== null)
            targetFrameworks.add(attribute.decoded_fixed_string);
    }
    return { attributes, targetFrameworks: [...targetFrameworks].sort() };
};
/** Inventory identity tables without CLR reflection or execution. */
export const readManagedMetadataInventory = (bytes, layout, resourceDirectory) => {
    const issues = [];
    validateIdentityTableCounts(layout, issues);
    const module = safeRead(() => readModule(bytes, layout, heapExtent(layout)), issues) ??
        null;
    const assembly = safeRead(() => readAssembly(bytes, layout, heapExtent(layout)), issues) ??
        null;
    const { references, referenceNames } = readReferences(bytes, layout, issues);
    const resources = readResources({
        bytes,
        layout,
        resourceDirectory,
        issues,
    });
    const { attributes, targetFrameworks } = readAttributes(bytes, layout, issues);
    return {
        module,
        assembly,
        targetFrameworks,
        referenceNames,
        references,
        resources,
        attributes,
        issues: uniqueIssues(issues),
    };
};
/** Stable table-name/count projection for caller-visible coverage. */
export const managedTableRowCounts = (layout) => Object.fromEntries([...layout.tables.values()].map(({ index, rowCount }) => [
    METADATA_TABLE_NAMES[index] ?? `Table${String(index)}`,
    rowCount,
]));
