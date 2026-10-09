import { managedFailure, ManagedReaderFailure, } from "./ManagedReaderFailure.js";
const requireRange = (bytes, offset, length, scope) => {
    if (!Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset > bytes.length - length)
        throw managedFailure("invalid-directory", scope, `${scope} leaves the artifact byte range`, Number.isSafeInteger(offset) && offset >= 0 ? offset : null);
};
const add = (left, right, scope) => {
    const result = left + right;
    if (!Number.isSafeInteger(result) || result < left)
        throw managedFailure("invalid-directory", scope, `${scope} offset arithmetic overflowed`, left);
    return result;
};
const architectureFor = (machine) => {
    switch (machine) {
        case 0x014c:
            return "x86";
        case 0x8664:
            return "x86_64";
        case 0x01c0:
        case 0x01c2:
        case 0x01c4:
            return "arm";
        case 0xaa64:
            return "arm64";
        default:
            throw managedFailure("invalid-directory", "pe.machine", `Unsupported PE machine 0x${machine.toString(16).padStart(4, "0")}`);
    }
};
const mapRva = (mapping) => {
    const { bytes, sections, rva, size, scope } = mapping;
    if (rva === 0 && size === 0)
        return 0;
    for (const section of sections) {
        const mappedSize = Math.max(section.virtualSize, section.rawSize);
        if (rva < section.virtualAddress)
            continue;
        const within = rva - section.virtualAddress;
        if (within > mappedSize || size > mappedSize - within)
            continue;
        if (within > section.rawSize || size > section.rawSize - within)
            throw managedFailure("invalid-directory", scope, `${scope} occupies virtual bytes without file-backed data`);
        const offset = add(section.rawOffset, within, scope);
        requireRange(bytes, offset, size, scope);
        return offset;
    }
    throw managedFailure("invalid-directory", scope, `${scope} RVA is not covered by a PE section`);
};
const readDirectory = (bytes, offset) => {
    requireRange(bytes, offset, 8, "pe.data-directory");
    return {
        rva: bytes.readUInt32LE(offset),
        size: bytes.readUInt32LE(offset + 4),
    };
};
const readCliHeader = (bytes, sections, directory) => {
    if (directory.size < 72)
        throw managedFailure("invalid-cli-header", "cli.header", "CLI header is shorter than the required 72 bytes");
    const offset = mapRva({
        bytes,
        sections,
        rva: directory.rva,
        size: 72,
        scope: "cli.header",
    });
    const headerSize = bytes.readUInt32LE(offset);
    if (headerSize < 72 || headerSize > directory.size)
        throw managedFailure("invalid-cli-header", "cli.header", "CLI header size is outside its PE data directory", offset);
    const metadata = readDirectory(bytes, offset + 8);
    if (metadata.rva === 0 || metadata.size === 0)
        throw managedFailure("invalid-cli-header", "cli.metadata", "CLI metadata directory is absent", offset + 8);
    const flags = bytes.readUInt32LE(offset + 16);
    const managedNativeHeader = readDirectory(bytes, offset + 64);
    let readyToRunSignature = false;
    if (managedNativeHeader.rva !== 0 && managedNativeHeader.size >= 4) {
        const nativeOffset = mapRva({
            bytes,
            sections,
            rva: managedNativeHeader.rva,
            size: 4,
            scope: "cli.managed-native-header",
        });
        readyToRunSignature = bytes.readUInt32LE(nativeOffset) === 0x0052_5452;
    }
    return {
        headerOffset: offset,
        headerSize,
        runtimeMajor: bytes.readUInt16LE(offset + 4),
        runtimeMinor: bytes.readUInt16LE(offset + 6),
        metadata,
        flags,
        entryPoint: bytes.readUInt32LE(offset + 20),
        resources: readDirectory(bytes, offset + 24),
        strongName: readDirectory(bytes, offset + 32),
        managedNativeHeader,
        readyToRunSignature,
    };
};
const readCoffHeader = (bytes) => {
    const peOffset = bytes.readUInt32LE(0x3c);
    requireRange(bytes, peOffset, 24, "pe.coff-header");
    if (bytes.readUInt32LE(peOffset) !== 0x0000_4550)
        throw managedFailure("invalid-directory", "pe.signature", "PE signature is invalid", peOffset);
    const coff = peOffset + 4;
    const machine = bytes.readUInt16LE(coff);
    const sectionCount = bytes.readUInt16LE(coff + 2);
    if (sectionCount === 0)
        throw managedFailure("invalid-directory", "pe.sections", "PE section count must be positive", coff + 2);
    const optionalSize = bytes.readUInt16LE(coff + 16);
    const characteristics = bytes.readUInt16LE(coff + 18);
    return { coff, machine, sectionCount, optionalSize, characteristics };
};
const readOptionalHeader = (bytes, coff) => {
    const optionalOffset = coff.coff + 20;
    requireRange(bytes, optionalOffset, coff.optionalSize, "pe.optional-header");
    if (coff.optionalSize < 96)
        throw managedFailure("invalid-directory", "pe.optional-header", "PE optional header is too short", optionalOffset);
    const magic = bytes.readUInt16LE(optionalOffset);
    const optionalHeader = magic === 0x010b ? "pe32" : magic === 0x020b ? "pe32-plus" : undefined;
    if (optionalHeader === undefined)
        throw managedFailure("invalid-directory", "pe.optional-header", "PE optional header magic is unsupported", optionalOffset);
    return {
        optionalOffset,
        optionalHeader,
        directoryCountOffset: optionalOffset + (optionalHeader === "pe32" ? 92 : 108),
        directoryOffset: optionalOffset + (optionalHeader === "pe32" ? 96 : 112),
    };
};
const readSections = (bytes, coff, optional) => {
    const sectionOffset = add(optional.optionalOffset, coff.optionalSize, "pe.sections");
    requireRange(bytes, sectionOffset, coff.sectionCount * 40, "pe.sections");
    const sections = [];
    for (let index = 0; index < coff.sectionCount; index += 1) {
        const offset = sectionOffset + index * 40;
        const section = {
            virtualSize: bytes.readUInt32LE(offset + 8),
            virtualAddress: bytes.readUInt32LE(offset + 12),
            rawSize: bytes.readUInt32LE(offset + 16),
            rawOffset: bytes.readUInt32LE(offset + 20),
        };
        if (section.rawSize > 0)
            requireRange(bytes, section.rawOffset, section.rawSize, "pe.section-data");
        sections.push(section);
    }
    return sections;
};
const readCliDirectory = (bytes, coff, optional) => {
    requireRange(bytes, optional.directoryCountOffset, 4, "pe.data-directories");
    const directoryCount = bytes.readUInt32LE(optional.directoryCountOffset);
    if (directoryCount <= 14 ||
        coff.optionalSize < optional.directoryOffset - optional.optionalOffset + 120)
        return { rva: 0, size: 0 };
    return readDirectory(bytes, optional.directoryOffset + 14 * 8);
};
/** Parse the file-backed PE and CLI layout without loading target code. */
export const readManagedPeLayout = (bytes) => {
    requireRange(bytes, 0, 64, "pe.dos-header");
    if (bytes[0] !== 0x4d || bytes[1] !== 0x5a)
        throw managedFailure("invalid-directory", "pe.dos-header", "Artifact does not start with an MZ header", 0);
    const coff = readCoffHeader(bytes);
    const optional = readOptionalHeader(bytes, coff);
    const sections = readSections(bytes, coff, optional);
    const cliDirectory = readCliDirectory(bytes, coff, optional);
    const cliDirectoryPresent = cliDirectory.rva !== 0 || cliDirectory.size !== 0;
    let cli = null;
    let cliIssue = null;
    if (cliDirectoryPresent)
        try {
            cli = readCliHeader(bytes, sections, cliDirectory);
        }
        catch (cause) {
            if (!(cause instanceof ManagedReaderFailure))
                throw cause;
            cliIssue = cause.issue;
        }
    return {
        machine: coff.machine,
        architecture: architectureFor(coff.machine),
        optionalHeader: optional.optionalHeader,
        sectionCount: coff.sectionCount,
        characteristics: coff.characteristics,
        sections,
        cli,
        cliDirectoryPresent,
        cliIssue,
        rvaToOffset: (rva, size, scope) => mapRva({ bytes, sections, rva, size, scope }),
        rvaAvailableBytes: (rva, scope) => {
            mapRva({ bytes, sections, rva, size: 1, scope });
            for (const section of sections) {
                if (rva < section.virtualAddress)
                    continue;
                const within = rva - section.virtualAddress;
                if (within < section.rawSize)
                    return Math.min(section.rawSize - within, bytes.length - section.rawOffset - within);
            }
            throw managedFailure("invalid-directory", scope, `${scope} RVA is not covered by file-backed PE section data`);
        },
    };
};
