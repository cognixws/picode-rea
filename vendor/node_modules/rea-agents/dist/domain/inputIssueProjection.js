import { AnalysisInputError, } from "./analysisErrorCore.js";
/** Build the standard application input error while retaining schema causes and extra semantic issues. */
export const analysisInputErrorFromIssues = (operation, issues, input, options = {}) => new AnalysisInputError(operation, options.cause === undefined ? undefined : { cause: options.cause }, [...projectInputIssues(issues, input), ...(options.additionalIssues ?? [])]);
/** Project Zod failures to secret-safe caller correction metadata. */
export const projectInputIssues = (issues, input) => issues.flatMap((issue) => projectIssue(issue, input));
const projectIssue = (issue, input) => {
    const path = issue.path.flatMap((part) => typeof part === "string" || typeof part === "number" ? [part] : []);
    // Branch issue paths are relative to the union; branches often agree.
    if (issue.code === "invalid_union")
        return uniqueIssues(issue.errors.flatMap((branch) => branch.flatMap((branchIssue) => projectIssue({ ...branchIssue, path: [...issue.path, ...branchIssue.path] }, input))));
    if (issue.code === "invalid_key")
        return issue.issues.flatMap((keyIssue) => projectIssue({ ...keyIssue, path: [...issue.path, ...keyIssue.path] }, input));
    if (issue.code === "unrecognized_keys")
        return issue.keys.map((key) => ({
            path: [...path, key],
            reason: "unknown_argument",
        }));
    if (issue.code === "invalid_type")
        return [
            {
                path,
                reason: valueAtPath(input, path) === undefined
                    ? "missing_argument"
                    : "invalid_type",
                expected: safeExpected(issue.expected),
            },
        ];
    if (issue.code === "too_small")
        return [boundedIssue(path, "minimum", numericBound(issue.minimum))];
    if (issue.code === "too_big")
        return [boundedIssue(path, "maximum", numericBound(issue.maximum))];
    if (issue.code === "invalid_format")
        return [
            {
                path,
                reason: "invalid_format",
                expected: issue.format,
                ...(issue.format === "regex" && issue.message.length > 0
                    ? { message: issue.message }
                    : {}),
            },
        ];
    if (issue.code === "invalid_value")
        return [
            {
                path,
                reason: "invalid_value",
                expected: issue.values.filter(isSafeExpected),
            },
        ];
    return [
        {
            path,
            reason: "invalid_value",
            ...(issue.message.length > 0 ? { message: issue.message } : {}),
        },
    ];
};
const uniqueIssues = (issues) => [
    ...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values(),
];
const valueAtPath = (input, path) => {
    let current = input;
    for (const part of path) {
        if (typeof current !== "object" || current === null)
            return undefined;
        const next = Reflect.get(current, part);
        current = next;
    }
    return current;
};
const numericBound = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const isSafeExpected = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
const safeExpected = (value) => isSafeExpected(value) ? value : "schema-defined value";
const boundedIssue = (path, key, value) => ({
    path,
    reason: "out_of_range",
    ...(value === undefined ? {} : { [key]: value }),
});
