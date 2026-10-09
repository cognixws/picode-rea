/**
 * otool emits LF, but a capture replayed from another host or toolchain can
 * carry CRLF. The section/command boundaries below match a bare `\n`, so a
 * stray `\r` would swallow the terminator and silently empty `sections` while
 * leaking section fields into the command. Normalizing once at the boundary
 * keeps every parser below working on one line ending.
 */
const normalizeLineEndings = (output) => output.replaceAll("\r\n", "\n");
/** Parse stable fields from `otool -l`, preserving unknown command fields. */
export const parseOtoolLoadCommands = (raw) => {
    const output = normalizeLineEndings(raw);
    const header = parseHeader(output);
    const state = createLoadCommandState(header?.flags);
    for (const block of output.split(/(?=^Load command \d+$)/mu))
        parseLoadCommand(block, state);
    return {
        fileType: header?.fileType ?? null,
        flags: [...state.flags].sort(),
        uuid: state.uuid,
        commands: state.commands,
        segments: state.segments,
        dependencies: state.dependencies,
        entrypoints: state.entrypoints,
        builds: state.builds,
    };
};
const parseHeader = (output) => {
    const lines = output.split(/\r?\n/u).map((line) => line.trim());
    const columnsLine = lines.findIndex((line) => /(?:^|\s)magic\s/u.test(line));
    if (columnsLine < 0)
        return undefined;
    const columns = lines[columnsLine]?.split(/\s+/u);
    const dataLine = lines.slice(columnsLine + 1).find((line) => line.length > 0);
    const values = dataLine?.split(/\s+/u);
    if (columns === undefined || values === undefined)
        return undefined;
    const fileTypeIndex = columns.indexOf("filetype");
    const flagsIndex = columns.indexOf("flags");
    const complete = values.length >= columns.length;
    const fileTypeValueIndex = flagsIndex >= 0 && fileTypeIndex > flagsIndex
        ? values.length - (columns.length - fileTypeIndex)
        : fileTypeIndex;
    const flagsEnd = flagsIndex >= 0 ? values.length - (columns.length - flagsIndex - 1) : 0;
    return {
        fileType: complete && fileTypeValueIndex >= 0 && fileTypeValueIndex < values.length
            ? (values[fileTypeValueIndex] ?? null)
            : null,
        flags: !complete || flagsIndex < 0 || flagsIndex >= flagsEnd
            ? []
            : values
                .slice(flagsIndex, flagsEnd)
                .filter((value) => value.length > 0),
    };
};
const createLoadCommandState = (headerFlags) => ({
    commands: [],
    segments: [],
    dependencies: [],
    entrypoints: [],
    builds: [],
    uuid: null,
    flags: new Set(headerFlags ?? []),
});
const parseLoadCommand = (block, state) => {
    const indexText = /^Load command (\d+)/u.exec(block)?.[1];
    if (indexText === undefined)
        return;
    const header = block.split(/\n\s*Section\n/u)[0] ?? block;
    const fields = parseFields(header);
    const kind = stringField(fields, "cmd") ?? "unknown";
    state.commands.push({
        index: Number.parseInt(indexText, 10),
        kind,
        fields,
    });
    collectUuid(kind, fields, state);
    collectEntrypoint(kind, fields, state);
    collectBuild(kind, block, fields, state);
    collectDependency(kind, fields, state);
    collectSegment(kind, block, fields, state);
};
const collectUuid = (kind, fields, state) => {
    if (kind === "LC_UUID")
        state.uuid = stringField(fields, "uuid") ?? state.uuid;
};
const collectEntrypoint = (kind, fields, state) => {
    if (kind !== "LC_MAIN")
        return;
    const entry = numberField(fields, "entryoff");
    if (entry !== null)
        state.entrypoints.push({ file_offset: entry });
};
const collectBuild = (kind, block, fields, state) => {
    if (kind === "LC_BUILD_VERSION") {
        state.builds.push({
            platform: stringField(fields, "platform"),
            minimum_os: stringField(fields, "minos"),
            sdk: stringField(fields, "sdk"),
            tools: parseBuildTools(block),
        });
        return;
    }
    if (kind.startsWith("LC_VERSION_MIN_"))
        state.builds.push({
            platform: kind.slice("LC_VERSION_MIN_".length) || null,
            minimum_os: stringField(fields, "version"),
            sdk: stringField(fields, "sdk"),
            tools: [],
        });
};
const collectDependency = (kind, fields, state) => {
    if (!kind.startsWith("LC_LOAD_") &&
        kind !== "LC_ID_DYLIB" &&
        kind !== "LC_REEXPORT_DYLIB" &&
        kind !== "LC_LAZY_LOAD_DYLIB")
        return;
    state.dependencies.push({
        path: stripOffsetSuffix(stringField(fields, "name")),
        kind,
        current_version: stringField(fields, "current version"),
        compatibility_version: stringField(fields, "compatibility version"),
    });
};
const collectSegment = (kind, block, fields, state) => {
    if (kind === "LC_SEGMENT" || kind === "LC_SEGMENT_64")
        state.segments.push(parseSegment(block, fields));
};
const parseFields = (block) => {
    const fields = {};
    for (const rawLine of block.split(/\r?\n/u).slice(1)) {
        const line = rawLine.trim();
        // Keys are `token` or a compound `token version`. `time stamp` is the one
        // other real key, and it must be matched as a whole: treating `stamp` as a
        // generic suffix would swallow an install name such as
        // `name stamp plugin.dylib`, hiding the dependency path behind `unknown`.
        const match = /^((?:time stamp)|\S+(?:\s+version)?)\s+(.+)$/u.exec(line);
        if (match?.[1] === undefined || match[2] === undefined)
            continue;
        const value = match[2].trim();
        fields[match[1]] =
            match[1] === "segname" || match[1] === "sectname"
                ? value
                : (numeric(value) ?? value);
    }
    return fields;
};
const parseSegment = (block, fields) => ({
    name: stringField(fields, "segname") ?? "unknown",
    vm_address: hexField(fields, "vmaddr"),
    vm_size: numberField(fields, "vmsize"),
    file_offset: numberField(fields, "fileoff"),
    file_size: numberField(fields, "filesize"),
    maximum_permissions: permissions(stringField(fields, "maxprot")),
    initial_permissions: permissions(stringField(fields, "initprot")),
    sections: parseSections(block),
});
const parseSections = (block) => block
    .split(/(?=\n\s*Section\n)/u)
    .slice(1)
    .map((sectionBlock) => {
    const fields = parseFields(`Section${sectionBlock}`);
    return {
        segment: stringField(fields, "segname") ?? "unknown",
        name: stringField(fields, "sectname") ?? "unknown",
        address: hexField(fields, "addr"),
        size: numberField(fields, "size"),
        file_offset: numberField(fields, "offset"),
        alignment: sectionAlignment(stringField(fields, "align")),
        flags: (stringField(fields, "flags") ?? "")
            .split(/\s+/u)
            .filter((flag) => flag.length > 0),
    };
});
const parseBuildTools = (block) => {
    const tools = [];
    const lines = block.split(/\r?\n/u).map((line) => line.trim());
    for (let index = 0; index < lines.length - 1; index += 1) {
        const tool = /^tool\s+(.+)$/u.exec(lines[index] ?? "")?.[1];
        const version = /^version\s+(.+)$/u.exec(lines[index + 1] ?? "")?.[1];
        if (tool !== undefined && version !== undefined)
            tools.push({ name: tool, version });
    }
    return tools;
};
const permissions = (raw) => {
    if (raw === null)
        return { read: null, write: null, execute: null, raw: null };
    const numericValue = numeric(raw);
    if (numericValue !== null)
        return {
            read: (numericValue & 1) !== 0,
            write: (numericValue & 2) !== 0,
            execute: (numericValue & 4) !== 0,
            raw,
        };
    if (/^[r-][w-][x-]$/u.test(raw))
        return {
            read: raw[0] === "r",
            write: raw[1] === "w",
            execute: raw[2] === "x",
            raw,
        };
    return { read: null, write: null, execute: null, raw };
};
/** A whole decimal or hexadecimal integer literal, with no surrounding text. */
const NUMERIC_PATTERN = /^(?:0x[a-fA-F0-9]+|\d+)$/u;
const numeric = (value) => {
    if (!NUMERIC_PATTERN.test(value))
        return null;
    const parsed = Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
const stringField = (fields, name) => {
    const value = fields[name];
    return typeof value === "string"
        ? value
        : value === undefined || value === null
            ? null
            : String(value);
};
const numberField = (fields, name) => {
    const value = fields[name];
    return typeof value === "number"
        ? value
        : typeof value === "string"
            ? numeric(value)
            : null;
};
const hexField = (fields, name) => {
    const value = stringField(fields, name);
    if (value === null || !NUMERIC_PATTERN.test(value))
        return null;
    return `0x${BigInt(value).toString(16)}`;
};
const stripOffsetSuffix = (value) => value?.replace(/\s+\(offset\s+\d+\)$/u, "") ?? "unknown";
const sectionAlignment = (raw) => {
    if (raw === null)
        return null;
    const exponent = numeric(/^2\^(\d+)(?:\s+\(\d+\))?$/u.exec(raw)?.[1] ?? raw);
    return exponent === null || exponent > 52 ? null : 2 ** exponent;
};
