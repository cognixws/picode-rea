import { managedFailure } from "./ManagedReaderFailure.js";
import { computeRowSize, } from "./ManagedMetadataRowSizes.js";
export const METADATA_TABLE_NAMES = [
    "Module",
    "TypeRef",
    "TypeDef",
    "FieldPtr",
    "Field",
    "MethodPtr",
    "MethodDef",
    "ParamPtr",
    "Param",
    "InterfaceImpl",
    "MemberRef",
    "Constant",
    "CustomAttribute",
    "FieldMarshal",
    "DeclSecurity",
    "ClassLayout",
    "FieldLayout",
    "StandAloneSig",
    "EventMap",
    "EventPtr",
    "Event",
    "PropertyMap",
    "PropertyPtr",
    "Property",
    "MethodSemantics",
    "MethodImpl",
    "ModuleRef",
    "TypeSpec",
    "ImplMap",
    "FieldRVA",
    "ENCLog",
    "ENCMap",
    "Assembly",
    "AssemblyProcessor",
    "AssemblyOS",
    "AssemblyRef",
    "AssemblyRefProcessor",
    "AssemblyRefOS",
    "File",
    "ExportedType",
    "ManifestResource",
    "NestedClass",
    "GenericParam",
    "MethodSpec",
    "GenericParamConstraint",
];
const CODED_INDEXES = {
    TypeDefOrRef: { bits: 2, tables: [2, 1, 27] },
    HasConstant: { bits: 2, tables: [4, 8, 23] },
    HasCustomAttribute: {
        bits: 5,
        tables: [
            6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42,
            44, 43,
        ],
    },
    HasFieldMarshal: { bits: 1, tables: [4, 8] },
    HasDeclSecurity: { bits: 2, tables: [2, 6, 32] },
    MemberRefParent: { bits: 3, tables: [2, 1, 26, 6, 27] },
    HasSemantics: { bits: 1, tables: [20, 23] },
    MethodDefOrRef: { bits: 1, tables: [6, 10] },
    MemberForwarded: { bits: 1, tables: [4, 6] },
    Implementation: { bits: 2, tables: [38, 35, 39] },
    CustomAttributeType: { bits: 3, tables: [6, 10] },
    ResolutionScope: { bits: 2, tables: [0, 26, 35, 1] },
    TypeOrMethodDef: { bits: 1, tables: [2, 6] },
};
const SUPPORTED_TABLE_MASK = (1n << BigInt(METADATA_TABLE_NAMES.length)) - 1n;
const requireRange = (bytes, offset, length, scope) => {
    if (!Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset > bytes.length - length)
        throw managedFailure("invalid-metadata-root", scope, `${scope} leaves the metadata byte range`, Number.isSafeInteger(offset) && offset >= 0 ? offset : null);
};
const align4 = (value) => (value + 3) & ~3;
const readStreamName = (bytes, offset) => {
    const endLimit = Math.min(bytes.length, offset + 32);
    let end = offset;
    while (end < endLimit && bytes[end] !== 0)
        end += 1;
    if (end === endLimit)
        throw managedFailure("invalid-stream", "metadata.stream-name", "Metadata stream name is missing a bounded terminator", offset);
    const nameBytes = bytes.subarray(offset, end);
    if (nameBytes.some((byte) => byte < 0x20 || byte > 0x7e))
        throw managedFailure("invalid-stream", "metadata.stream-name", "Metadata stream name is not printable ASCII", offset);
    return {
        name: nameBytes.toString("ascii"),
        next: align4(end + 1),
    };
};
const streamByName = (streams, names) => {
    for (const name of names) {
        const stream = streams.get(name);
        if (stream !== undefined)
            return stream;
    }
    return undefined;
};
const requireStream = (streams, name) => {
    const stream = streams.get(name);
    if (stream === undefined)
        throw managedFailure("missing-stream", `metadata.${name}`, `Required metadata stream ${name} is absent`);
    return stream;
};
const codedSize = (name, rowCounts) => {
    const descriptor = CODED_INDEXES[name];
    let maximum = 0;
    for (const table of descriptor.tables)
        maximum = Math.max(maximum, rowCounts[table] ?? 0);
    return maximum < 2 ** (16 - descriptor.bits) ? 2 : 4;
};
const tableSize = (index, rows) => (rows[index] ?? 0) < 0x1_0000 ? 2 : 4;
const readMetadataStreams = (bytes, rootOffset) => {
    if (bytes.readUInt32LE(0) !== 0x424a_5342)
        throw managedFailure("invalid-metadata-root", "metadata.signature", "CLI metadata signature is not BSJB", rootOffset);
    const versionLength = bytes.readUInt32LE(12);
    requireRange(bytes, 16, versionLength, "metadata.version");
    const versionBytes = bytes.subarray(16, 16 + versionLength);
    const zero = versionBytes.indexOf(0);
    const version = versionBytes
        .subarray(0, zero < 0 ? versionBytes.length : zero)
        .toString("utf8");
    let cursor = align4(16 + versionLength);
    requireRange(bytes, cursor, 4, "metadata.stream-count");
    const streamCount = bytes.readUInt16LE(cursor + 2);
    if (streamCount === 0 || streamCount > 64)
        throw managedFailure("invalid-stream", "metadata.stream-count", "Metadata stream count is outside the admitted range", rootOffset + cursor + 2);
    cursor += 4;
    const streams = new Map();
    for (let index = 0; index < streamCount; index += 1) {
        requireRange(bytes, cursor, 8, "metadata.stream-header");
        const relativeOffset = bytes.readUInt32LE(cursor);
        const streamSize = bytes.readUInt32LE(cursor + 4);
        const named = readStreamName(bytes, cursor + 8);
        if (streams.has(named.name))
            throw managedFailure("invalid-stream", "metadata.stream-header", `Duplicate metadata stream ${named.name}`, rootOffset + cursor);
        requireRange(bytes, relativeOffset, streamSize, `metadata.${named.name}`);
        streams.set(named.name, {
            name: named.name,
            offset: rootOffset + relativeOffset,
            size: streamSize,
        });
        cursor = named.next;
    }
    return { streams, version };
};
const readTablesHeader = (bytes, streams) => {
    const tablesStream = streamByName(streams, ["#~", "#-"]);
    if (tablesStream === undefined)
        throw managedFailure("missing-stream", "metadata.tables", "Required metadata table stream #~ or #- is absent");
    const tableBytes = bytes.subarray(tablesStream.offset, tablesStream.offset + tablesStream.size);
    requireRange(tableBytes, 0, 24, "metadata.tables-header");
    const heapSizes = tableBytes[6] ?? 0;
    const heaps = {
        string: (heapSizes & 0x01) === 0 ? 2 : 4,
        guid: (heapSizes & 0x02) === 0 ? 2 : 4,
        blob: (heapSizes & 0x04) === 0 ? 2 : 4,
    };
    const valid = tableBytes.readBigUInt64LE(8);
    if ((valid & ~SUPPORTED_TABLE_MASK) !== 0n)
        throw managedFailure("invalid-tables", "metadata.valid-mask", "Metadata valid mask names unsupported tables outside the admitted ECMA-335 range", tablesStream.offset + 8);
    return { tableBytes, tablesOffset: tablesStream.offset, heaps, valid };
};
const readRowCounts = (tableBytes, valid) => {
    const rowCounts = Array(METADATA_TABLE_NAMES.length).fill(0);
    let tableCursor = 24;
    for (let index = 0; index < METADATA_TABLE_NAMES.length; index += 1) {
        if ((valid & (1n << BigInt(index))) === 0n)
            continue;
        requireRange(tableBytes, tableCursor, 4, "metadata.table-row-count");
        const count = tableBytes.readUInt32LE(tableCursor);
        rowCounts[index] = count;
        tableCursor += 4;
    }
    return rowCounts;
};
const buildRowSizeContext = (rowCounts, heaps) => ({
    tableSize: (index) => tableSize(index, rowCounts),
    codedSize: (name) => codedSize(name, rowCounts),
    stringSize: heaps.string,
    guidSize: heaps.guid,
    blobSize: heaps.blob,
});
const buildMetadataTables = ({ tableBytes, rowCounts, heaps, valid, tablesOffset, }) => {
    const tables = new Map();
    const context = buildRowSizeContext(rowCounts, heaps);
    let tableCursor = 24;
    for (let index = 0; index < METADATA_TABLE_NAMES.length; index += 1) {
        if ((valid & (1n << BigInt(index))) === 0n)
            continue;
        tableCursor += 4;
    }
    for (let index = 0; index < METADATA_TABLE_NAMES.length; index += 1) {
        const count = rowCounts[index] ?? 0;
        if ((valid & (1n << BigInt(index))) === 0n)
            continue;
        const sizeOfRow = computeRowSize(index, context);
        const byteLength = count * sizeOfRow;
        if (!Number.isSafeInteger(byteLength))
            throw managedFailure("invalid-tables", "metadata.tables", "Metadata table byte size overflowed", tablesOffset + tableCursor);
        requireRange(tableBytes, tableCursor, byteLength, "metadata.table-data");
        tables.set(index, {
            index,
            name: METADATA_TABLE_NAMES[index] ?? `Table${String(index)}`,
            rowCount: count,
            rowSize: sizeOfRow,
            offset: tablesOffset + tableCursor,
        });
        tableCursor += byteLength;
    }
    return tables;
};
/** Parse ECMA-335 stream and table layout with checked byte extents. */
export const readManagedMetadataLayout = (artifact, rootOffset, size) => {
    if (size < 20 || rootOffset < 0 || rootOffset > artifact.length - size)
        throw managedFailure("invalid-metadata-root", "metadata.root", "CLI metadata directory leaves the artifact byte range", rootOffset);
    const bytes = artifact.subarray(rootOffset, rootOffset + size);
    const { streams, version } = readMetadataStreams(bytes, rootOffset);
    const { tableBytes, tablesOffset, heaps, valid } = readTablesHeader(artifact, streams);
    const rowCounts = readRowCounts(tableBytes, valid);
    const tables = buildMetadataTables({
        tableBytes,
        rowCounts,
        heaps,
        valid,
        tablesOffset,
    });
    return {
        rootOffset,
        size,
        version,
        streamNames: [...streams.keys()].sort(),
        strings: requireStream(streams, "#Strings"),
        guid: requireStream(streams, "#GUID"),
        blob: requireStream(streams, "#Blob"),
        tables,
        rowCounts,
        stringIndexSize: heaps.string,
        guidIndexSize: heaps.guid,
        blobIndexSize: heaps.blob,
        table: (index) => tables.get(index),
        tableIndexSize: (index) => tableSize(index, rowCounts),
        codedIndexSize: (name) => codedSize(name, rowCounts),
    };
};
/** Resolve a one-based metadata row to its exact file offset. */
export const metadataRowOffset = (layout, table, row) => {
    const descriptor = layout.table(table);
    if (descriptor === undefined || row < 1 || row > descriptor.rowCount)
        throw managedFailure("invalid-row", `metadata.${METADATA_TABLE_NAMES[table] ?? String(table)}`, `Metadata row ${String(row)} is outside its table`);
    return descriptor.offset + (row - 1) * descriptor.rowSize;
};
