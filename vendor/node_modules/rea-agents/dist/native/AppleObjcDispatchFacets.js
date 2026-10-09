import { boundClassName, decodeObjcCategories } from "./AppleObjcCategories.js";
import { readObjcPropertiesOf } from "./AppleObjcProperties.js";
import { createObjcProtocolReader } from "./AppleObjcProtocols.js";
const hex = (value) => `0x${value.toString(16)}`;
const decoded = { status: "decoded", reason: null };
/** Name of a class defined in this image, from its class_ro_t. */
const localClassName = (read, address) => read.string(read.pointer((read.pointer(address + 32n) & ~7n) + 24n));
/**
 * Resolve a class's superclass: a bind to `_OBJC_CLASS_$_Name` names a class
 * in another image; otherwise the pointer is a class_t in this image.
 */
const resolveSuperclass = (read, address, className, failures) => {
    const external = boundClassName(read, address + 8n);
    if (external !== undefined)
        return { name: external, address: null };
    const superclass = read.pointer(address + 8n);
    if (superclass === 0n)
        return { name: null, address: null };
    try {
        return { name: localClassName(read, superclass), address: hex(superclass) };
    }
    catch (cause) {
        // Superclass resolution failure is recorded; the cause adds no identity.
        void cause;
        failures.push(`Superclass pointer ${hex(superclass)} of ${className} requires unsupported binding/fixup resolution`);
        return { name: null, address: hex(superclass) };
    }
};
/** Decode Objective-C protocol lists, classlists, methods, and ivars into `result`. */
export const decodeObjcDispatchFacets = (input) => {
    const { bytes, sections, segments, readers: read, budget, result } = input;
    const failures = [];
    const categoryIssues = [];
    let examined = 0;
    const methods = (list, className, methodType, category) => {
        const selectors = [];
        if (list === 0n)
            return selectors;
        const flags = read.u32(list), count = read.u32(list + 4n), relative = (flags & 0x80000000) !== 0;
        const stride = flags & 0xfffc;
        if (stride !== (relative ? 12 : 24))
            throw new TypeError(`Unsupported method stride/flags at ${hex(list)}`);
        for (let index = 0; index < count; index++) {
            if (!budget.admit())
                break;
            const entry = list + 8n + BigInt(index * stride);
            const rel = (field) => {
                const displacement = bytes.readInt32LE(read.offset(field, 4));
                const target = field + BigInt(displacement);
                let fileOffset = null;
                try {
                    fileOffset = read.offset(target);
                }
                catch (cause) {
                    // best-effort cleanup: serialized target remains unresolved.
                    void cause;
                }
                if (budget.admit())
                    result.relative_pointers.push({
                        field: read.location(field),
                        target: { address: hex(target), file_offset: fileOffset },
                        displacement,
                        indirectable: false,
                        indirect: false,
                        decode: fileOffset === null
                            ? { status: "partial", reason: "relative_target_unmapped" }
                            : decoded,
                        evidence: read.evidence(field, "Signed-relative Objective-C method-list pointer"),
                    });
                return target;
            };
            let selectorAddress = relative ? rel(entry) : read.pointer(entry);
            if (relative && (flags & 0x40000000) === 0)
                selectorAddress = read.pointer(selectorAddress);
            const implementation = relative
                ? rel(entry + 8n)
                : read.pointer(entry + 16n);
            let implementationLocation = null;
            try {
                if (!segments.some((segment) => segment.executable &&
                    implementation >= segment.address &&
                    implementation < segment.address + segment.size))
                    throw new RangeError("Method implementation is not in an executable segment");
                implementationLocation = read.location(implementation);
            }
            catch (cause) {
                // best-effort cleanup: external/chained pointers remain unresolved.
                void cause;
            }
            const selector = read.string(selectorAddress);
            selectors.push(selector);
            result.objc_dispatch_implementations.push({
                class_name: className,
                selector,
                method_type: methodType,
                ...(category === undefined ? {} : { category }),
                implementation_address: implementationLocation?.address ?? null,
                location: read.location(entry),
                decode: implementationLocation === null
                    ? {
                        status: "partial",
                        reason: "implementation_pointer_unmapped_or_encoded",
                    }
                    : decoded,
                evidence: read.evidence(entry, relative
                    ? "Encoded relative Objective-C method entry"
                    : "Encoded absolute Objective-C method entry"),
            });
        }
        return selectors;
    };
    const protocolReader = createObjcProtocolReader({
        readers: {
            u32: read.u32,
            pointer: read.pointer,
            string: read.string,
            location: read.location,
            evidence: read.evidence,
            admit: () => budget.admit(),
            i32: read.i32,
            u64: read.u64,
        },
        result,
        failures,
    });
    for (const section of sections.filter(({ name }) => name === "__objc_protolist")) {
        if (section.size % 8 !== 0)
            throw new RangeError("Misaligned Objective-C protocol list");
        for (let index = 0; index < section.size / 8; index++) {
            if (budget.isFull()) {
                budget.markTruncated();
                break;
            }
            protocolReader.record(read.pointer(section.address + BigInt(index * 8)));
        }
    }
    const visited = new Set();
    const readClass = (address, meta = false) => {
        if (address === 0n || visited.has(hex(address)) || !budget.admit())
            return;
        visited.add(hex(address));
        const ro = read.pointer(address + 32n) & ~7n;
        const name = read.string(read.pointer(ro + 24n));
        const root = (read.u32(ro) & 2) !== 0;
        const superclass = resolveSuperclass(read, address, name, failures);
        if (superclass.name === null && superclass.address === null && !root)
            failures.push(`Superclass of ${name} requires external binding resolution`);
        const ivarList = read.pointer(ro + 48n);
        let ivarCount = 0;
        if (ivarList !== 0n && !meta) {
            const stride = read.u32(ivarList), count = read.u32(ivarList + 4n);
            if (stride !== 32)
                throw new TypeError("Unsupported Objective-C ivar entry size");
            ivarCount = count;
            for (let index = 0; index < count; index++) {
                if (!budget.admit())
                    break;
                const entry = ivarList + 8n + BigInt(index * stride);
                const encodedOffset = read.pointer(entry);
                let value = null;
                try {
                    value = read.u32(encodedOffset);
                }
                catch (cause) {
                    // Unresolved offsets are recorded; the cause adds no identity.
                    void cause;
                    failures.push(`Unresolved ivar offset pointer ${hex(encodedOffset)}`);
                }
                result.objc_ivars.push({
                    class_name: name,
                    name: read.string(read.pointer(entry + 8n)),
                    type_encoding: read.string(read.pointer(entry + 16n)),
                    offset: value,
                    size: read.u32(entry + 28n),
                    alignment: read.u32(entry + 24n) < 31 ? 2 ** read.u32(entry + 24n) : null,
                    location: read.location(entry),
                    decode: value === null
                        ? { status: "partial", reason: "ivar_offset_pointer_unresolved" }
                        : decoded,
                    evidence: read.evidence(entry, "Objective-C ivar entry and encoded offset storage"),
                });
            }
        }
        methods(read.pointer(ro + 32n), name, meta ? "class" : "instance");
        result.objc_classes.push({
            name,
            super_class: superclass.name,
            is_meta_class: meta,
            is_root_class: root,
            methods: result.objc_dispatch_implementations
                .filter((item) => item.class_name === name &&
                item.method_type === (meta ? "class" : "instance"))
                .map((item) => ({
                selector: item.selector,
                method_type: item.method_type,
                address: item.implementation_address !== null &&
                    BigInt(item.implementation_address) <=
                        BigInt(Number.MAX_SAFE_INTEGER)
                    ? Number(BigInt(item.implementation_address))
                    : null,
                is_required: false,
                is_optional: false,
            })),
            properties: readObjcPropertiesOf(read, read.pointer(ro + 64n), {
                owner: name,
                admit: () => budget.admit(),
                issues: categoryIssues,
                location: hex(read.pointer(ro + 64n)),
            }),
            protocols: protocolReader.list(read.pointer(ro + 40n)),
            ivar_count: ivarCount,
            instance_size: read.u32(ro + 8n),
            location: read.location(address),
            superclass_address: superclass.address,
            metaclass_address: meta ? null : hex(read.pointer(address)),
            decode: superclass.name === null && !root
                ? { status: "partial", reason: "superclass_binding_unresolved" }
                : decoded,
            evidence: read.evidence(address, "Objective-C class and class_ro_t records"),
        });
        if (!meta) {
            try {
                readClass(read.pointer(address), true);
            }
            catch (cause) {
                failures.push(`Metaclass of ${name}: ${cause instanceof Error ? cause.message : String(cause)}`);
            }
        }
    };
    for (const section of sections.filter(({ name }) => name === "__objc_classlist")) {
        if (section.size % 8 !== 0)
            throw new RangeError("Misaligned Objective-C class-list size");
        for (let index = 0; index < section.size / 8; index++) {
            if (budget.isFull()) {
                budget.markTruncated();
                break;
            }
            examined++;
            const field = section.address + BigInt(index * 8);
            try {
                readClass(read.pointer(field));
            }
            catch (cause) {
                failures.push(`${hex(field)}: ${cause instanceof Error ? cause.message : String(cause)}`);
            }
        }
    }
    const categoriesExamined = decodeObjcCategories({
        sections,
        read,
        result,
        failures,
        issues: categoryIssues,
        admit: () => budget.admit(),
        methods,
        protocols: (list) => protocolReader.list(list),
        localClassName: (address) => localClassName(read, address),
    });
    return { failures, categoryIssues, examined, categoriesExamined };
};
