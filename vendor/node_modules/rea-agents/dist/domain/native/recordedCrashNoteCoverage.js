const align = (size) => ((size + 3n) / 4n) * 4n;
const layoutMatches = (note) => {
    const start = BigInt(note.location.offset);
    const owner = BigInt(note.owner_location.bytes);
    const descriptor = BigInt(note.descriptor_location.bytes);
    return (BigInt(note.owner_location.offset) === start + 12n &&
        BigInt(note.descriptor_location.offset) === start + 12n + align(owner) &&
        BigInt(note.location.bytes) === 12n + align(owner) + align(descriptor));
};
const paddingMatches = (item, segment) => {
    const bytes = BigInt(item.location.bytes);
    const decodedLength = (item.bytes_base64.length / 4) * 3 -
        (item.bytes_base64.endsWith("==")
            ? 2
            : item.bytes_base64.endsWith("=")
                ? 1
                : 0);
    return (bytes > 0n &&
        bytes < 12n &&
        BigInt(decodedLength) === bytes &&
        /^A*={0,2}$/.test(item.bytes_base64) &&
        segment !== undefined &&
        BigInt(item.location.offset) + bytes ===
            BigInt(segment.offset) + BigInt(segment.file_size));
};
/** Require exact aligned note layouts and one complete, nonoverlapping physical coverage. */
export function recordedNoteCoverageIssues(segments, notes, padding) {
    const issues = [];
    const bySegment = new Map();
    const all = [];
    const add = (segment, range) => {
        const ranges = bySegment.get(segment) ?? [];
        ranges.push(range);
        bySegment.set(segment, ranges);
        all.push(range);
    };
    for (const note of notes) {
        if (!layoutMatches(note))
            issues.push("Recorded note layout differs from its aligned header/owner/descriptor ranges.");
        add(note.segment_index, note.location);
    }
    for (const item of padding) {
        if (!paddingMatches(item, segments[item.segment_index]))
            issues.push("Recorded note padding must be a short zero-filled segment tail.");
        add(item.segment_index, item.location);
    }
    const compare = (left, right) => BigInt(left.offset) < BigInt(right.offset)
        ? -1
        : BigInt(left.offset) > BigInt(right.offset)
            ? 1
            : 0;
    let end = 0n;
    for (const range of all.sort(compare)) {
        const start = BigInt(range.offset);
        if (start < end)
            issues.push("Physical recorded note/padding ranges overlap or repeat.");
        if (start + BigInt(range.bytes) > end)
            end = start + BigInt(range.bytes);
    }
    for (const segment of segments) {
        if (segment.type !== "PT_NOTE")
            continue;
        let cursor = BigInt(segment.offset);
        for (const range of (bySegment.get(segment.index) ?? []).sort(compare)) {
            if (BigInt(range.offset) !== cursor)
                issues.push("Recorded note/padding ranges leave a gap or overlap in their segment.");
            cursor = BigInt(range.offset) + BigInt(range.bytes);
        }
        if (cursor !== BigInt(segment.offset) + BigInt(segment.file_size))
            issues.push("Recorded note/padding ranges do not completely cover their segment.");
    }
    return issues;
}
