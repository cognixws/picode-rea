/** Bucket one elapsed process-capture timestamp under scenario normalization. */
export const normalizeProcessElapsedTime = (elapsedMs, timeBucketMs) => Math.floor(elapsedMs / timeBucketMs) * timeBucketMs;
/** Normalize one terminal/protocol payload under explicitly selected scenario rules. */
export const normalizeProcessText = (value, scenario, temporaryRoot, pid) => {
    let normalized = value;
    if (scenario.normalization.paths) {
        normalized = normalized.replaceAll(temporaryRoot, "<temporary-root>");
        normalized = normalized.replaceAll(scenario.working_directory, "<working-directory>");
        normalized = normalized.replaceAll(scenario.executable, "<executable>");
        for (const [index, root] of scenario.filesystem_observation_paths.entries())
            normalized = normalized.replaceAll(root, `<filesystem-root-${String(index)}>`);
    }
    if (scenario.normalization.pids)
        normalized = normalizePidTokens(normalized, [pid]);
    if (scenario.normalization.ports)
        normalized = normalized.replaceAll(/(?<=[:=])\d{2,5}\b/g, "<port>");
    for (const pattern of scenario.normalization.patterns)
        normalized = normalized.replaceAll(pattern.pattern, pattern.replacement);
    return normalized;
};
/** Project sampled observations under the caller-selected normalization rules. */
export const normalizeProcessSamples = (samples, scenario, rootPid) => {
    const identifiers = [
        rootPid,
        ...samples.flatMap((sample) => [
            sample.pid,
            sample.parent_pid,
            sample.process_group_id ?? 0,
            sample.session_id ?? 0,
        ]),
    ];
    const mapping = new Map();
    for (const identifier of identifiers)
        if (identifier > 0 && !mapping.has(identifier))
            mapping.set(identifier, mapping.size + 1);
    const normalizeCommand = (command) => {
        const normalized = normalizeProcessText(command, scenario, "<no-temporary-root>", rootPid);
        const withNormalizedPids = scenario.normalization.pids
            ? normalizePidTokens(normalized, identifiers)
            : normalized;
        return withNormalizedPids.trim();
    };
    return samples.map((sample) => ({
        at_ms: normalizeProcessElapsedTime(sample.at_ms, scenario.normalization.time_bucket_ms),
        pid: scenario.normalization.pids
            ? (mapping.get(sample.pid) ?? 1)
            : sample.pid,
        parent_pid: scenario.normalization.pids
            ? (mapping.get(sample.parent_pid) ?? 0)
            : sample.parent_pid,
        process_group_id: !scenario.normalization.pids || sample.process_group_id === null
            ? sample.process_group_id
            : (mapping.get(sample.process_group_id) ?? 0),
        session_id: !scenario.normalization.pids || sample.session_id === null
            ? sample.session_id
            : (mapping.get(sample.session_id) ?? 0),
        command: normalizeCommand(sample.command),
    }));
};
const normalizePidTokens = (value, identifiers) => {
    const tokens = [...new Set(identifiers)]
        .filter((identifier) => Number.isSafeInteger(identifier) && identifier > 0)
        .sort((left, right) => right - left)
        .map(String);
    if (tokens.length === 0)
        return value;
    return value.replace(new RegExp(`(?<!\\d)(?:${tokens.join("|")})(?!\\d)`, "gu"), "<pid>");
};
