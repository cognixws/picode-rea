import { canonicalExportShapeValue, digestExportShapeValue, } from "./javascriptExportShapeComparisonIdentity.js";
import { compareCodePoints, uniqueSorted } from "../canonicalOrdering.js";
/** Pair variants only through reciprocal unique exact literal discriminants. */
export const pairJavaScriptExportShapeVariants = (left, right) => {
    const leftKeys = discriminantOccurrences(left);
    const rightKeys = discriminantOccurrences(right);
    const edges = new Map();
    const leftTargets = new Map();
    const rightTargets = new Map();
    for (const [key, leftOccurrence] of leftKeys) {
        const rightOccurrence = rightKeys.get(key);
        if (leftOccurrence.indexes.length !== 1 ||
            rightOccurrence?.indexes.length !== 1)
            continue;
        const leftIndex = leftOccurrence.indexes[0];
        const rightIndex = rightOccurrence.indexes[0];
        if (leftIndex === undefined || rightIndex === undefined)
            continue;
        const edgeKey = `${String(leftIndex)}:${String(rightIndex)}`;
        edges.set(edgeKey, [
            ...(edges.get(edgeKey) ?? []),
            leftOccurrence.discriminant,
        ]);
        addTarget(leftTargets, leftIndex, rightIndex);
        addTarget(rightTargets, rightIndex, leftIndex);
    }
    const pairs = reciprocalPairs(leftTargets, rightTargets, edges);
    const pairedLeft = new Set(pairs.map(({ leftIndex }) => leftIndex));
    const pairedRight = new Set(pairs.map(({ rightIndex }) => rightIndex));
    return {
        pairs,
        unpairedLeft: indexesNotIn(left, pairedLeft),
        unpairedRight: indexesNotIn(right, pairedRight),
    };
};
/** Build bounded-ready field and unpaired-variant changes before caller slicing. */
export const buildJavaScriptExportShapeChanges = (input) => {
    if (input.leftSelection.selection.status !== "selected" ||
        input.rightSelection.selection.status !== "selected")
        return [selectionUnknownChange(input)];
    if (input.leftShapes.length === 0 || input.rightShapes.length === 0)
        return [emptyShapeUnknownChange(input)];
    const paired = input.pairing.pairs.flatMap((pair) => {
        const left = input.leftShapes[pair.leftIndex];
        const right = input.rightShapes[pair.rightIndex];
        return left === undefined || right === undefined
            ? []
            : diffPair(left, right, pair.discriminant, input.evidenceLinks);
    });
    const unpairedLeft = input.pairing.unpairedLeft.flatMap((index) => {
        const shape = input.leftShapes[index];
        return shape === undefined
            ? []
            : [unpairedChange("left", shape, input.evidenceLinks)];
    });
    const unpairedRight = input.pairing.unpairedRight.flatMap((index) => {
        const shape = input.rightShapes[index];
        return shape === undefined
            ? []
            : [unpairedChange("right", shape, input.evidenceLinks)];
    });
    return [...paired, ...unpairedLeft, ...unpairedRight];
};
/** Report whether any retained shape lacks complete property coverage. */
export const hasPartialJavaScriptExportPropertyCoverage = (shapes) => shapes.some((shape) => shape.property_coverage.some(({ status }) => status === "partial"));
const discriminantOccurrences = (shapes) => {
    const output = new Map();
    shapes.forEach((shape, index) => {
        for (const field of shape.fields) {
            const value = literalValue(field);
            if (!value.found)
                continue;
            const discriminant = { path: field.path, value: value.value };
            const key = canonicalExportShapeValue(discriminant);
            const current = output.get(key);
            output.set(key, {
                discriminant,
                indexes: [...(current?.indexes ?? []), index],
            });
        }
    });
    return output;
};
const reciprocalPairs = (leftTargets, rightTargets, edges) => {
    const pairs = [];
    for (const [leftIndex, targets] of leftTargets) {
        if (targets.size !== 1)
            continue;
        const rightIndex = [...targets][0];
        if (rightIndex === undefined ||
            rightTargets.get(rightIndex)?.size !== 1 ||
            !rightTargets.get(rightIndex)?.has(leftIndex))
            continue;
        const discriminants = edges
            .get(`${String(leftIndex)}:${String(rightIndex)}`)
            ?.toSorted(compareDiscriminants);
        const discriminant = discriminants?.[0];
        if (discriminant !== undefined)
            pairs.push({ leftIndex, rightIndex, discriminant });
    }
    return pairs.sort((first, second) => compareDiscriminants(first.discriminant, second.discriminant));
};
const addTarget = (map, source, target) => {
    const values = map.get(source) ?? new Set();
    values.add(target);
    map.set(source, values);
};
const indexesNotIn = (shapes, paired) => shapes.map((_, index) => index).filter((index) => !paired.has(index));
const compareDiscriminants = (left, right) => compareCodePoints(canonicalExportShapeValue(left), canonicalExportShapeValue(right));
const selectionUnknownChange = (input) => changeWithId({
    status: "unknown",
    path: "",
    discriminant: null,
    left: selectionAvailability(input.leftSelection.selection, "left"),
    right: selectionAvailability(input.rightSelection.selection, "right"),
    left_source_range: null,
    right_source_range: null,
    evidence_links: input.evidenceLinks,
    limitations: [
        "Both selectors must resolve one exact export with trusted static return shapes before comparison.",
    ],
});
const emptyShapeUnknownChange = (input) => changeWithId({
    status: "unknown",
    path: "",
    discriminant: null,
    left: emptyShapeAvailability(input.leftShapes, "left"),
    right: emptyShapeAvailability(input.rightShapes, "right"),
    left_source_range: null,
    right_source_range: null,
    evidence_links: input.evidenceLinks,
    limitations: [
        "At least one selected export has no retained direct return shape.",
    ],
});
const diffPair = (left, right, discriminant, evidenceLinks) => {
    const leftFields = new Map(left.fields.map((field) => [field.path, field]));
    const rightFields = new Map(right.fields.map((field) => [field.path, field]));
    const paths = uniqueSorted([
        ...leftFields.keys(),
        ...rightFields.keys(),
        ...left.property_coverage.map(({ path }) => path),
        ...right.property_coverage.map(({ path }) => path),
    ]);
    return paths.flatMap((path) => {
        const leftField = fieldAtPath(left, leftFields, path);
        const rightField = fieldAtPath(right, rightFields, path);
        const status = fieldChangeStatus({
            leftShape: left,
            rightShape: right,
            path,
            leftField,
            rightField,
        });
        if (status === null)
            return [];
        return [
            changeWithId({
                status,
                path,
                discriminant,
                left: fieldAvailability(leftField),
                right: fieldAvailability(rightField),
                left_source_range: left.source_range,
                right_source_range: right.source_range,
                evidence_links: evidenceLinks,
                limitations: status === "unknown"
                    ? [
                        "The static value or relevant parent-property coverage is incomplete.",
                    ]
                    : [],
            }),
        ];
    });
};
const fieldAtPath = (shape, fields, path) => {
    const field = fields.get(path);
    if (field !== undefined)
        return field;
    if (!shape.property_coverage.some((coverage) => coverage.path === path))
        return undefined;
    return {
        path,
        state: "unknown",
        value: null,
        reason: "A static container is retained at this path, but no primitive field value is projected.",
    };
};
const fieldChangeStatus = ({ leftShape, rightShape, path, leftField, rightField, }) => {
    if (leftField !== undefined && rightField !== undefined) {
        if (canonicalExportShapeValue(leftField) ===
            canonicalExportShapeValue(rightField))
            return null;
        return leftField.state === "unknown" || rightField.state === "unknown"
            ? "unknown"
            : "changed";
    }
    const present = leftField ?? rightField;
    if (present === undefined)
        return null;
    const parent = parentPointer(path);
    const parentsComplete = propertyCoverageComplete(leftShape, parent) &&
        propertyCoverageComplete(rightShape, parent);
    if (present.state === "unknown" || !parentsComplete)
        return "unknown";
    return leftField === undefined ? "added" : "removed";
};
const propertyCoverageComplete = (shape, path) => path !== null &&
    shape.property_coverage.some((coverage) => coverage.path === path && coverage.status === "complete");
const parentPointer = (path) => {
    if (path === "")
        return null;
    const separator = path.lastIndexOf("/");
    return separator < 0 ? null : path.slice(0, separator);
};
const fieldAvailability = (field) => {
    if (field === undefined)
        return { availability: "absent" };
    if (field.state === "unknown")
        return {
            availability: "unknown",
            reason: field.reason ?? "Static field value is unknown.",
        };
    if (field.state === "union")
        return { availability: "union", values: primitiveArray(field.value) };
    const literal = literalValue(field);
    return literal.found
        ? { availability: "literal", value: literal.value }
        : {
            availability: "unknown",
            reason: "Static literal field failed its projection boundary.",
        };
};
const selectionAvailability = (selection, side) => ({
    availability: "unknown",
    reason: `${capitalize(side)} export selection is ${selection.status}.`,
});
const emptyShapeAvailability = (shapes, side) => ({
    availability: "unknown",
    reason: shapes.length === 0
        ? `${capitalize(side)} export has no retained direct return shape.`
        : `${capitalize(side)} export return shape cannot be paired without an opposite variant.`,
});
const unpairedChange = (side, shape, evidenceLinks) => changeWithId({
    status: "unknown",
    path: "",
    discriminant: null,
    left: {
        availability: "unknown",
        reason: side === "left"
            ? "Left return variant has no unique exact cross-version pairing."
            : "No left return variant was uniquely paired with this right variant.",
    },
    right: {
        availability: "unknown",
        reason: side === "right"
            ? "Right return variant has no unique exact cross-version pairing."
            : "No right return variant was uniquely paired with this left variant.",
    },
    left_source_range: side === "left" ? shape.source_range : null,
    right_source_range: side === "right" ? shape.source_range : null,
    evidence_links: evidenceLinks,
    limitations: [
        "The return variant was not paired because no reciprocal unique literal discriminant exists.",
    ],
});
const changeWithId = (semantic) => ({
    ...semantic,
    change_id: `jesc_change_${digestExportShapeValue(semantic)}`,
});
const literalValue = (field) => field.state === "literal" && isPrimitive(field.value)
    ? { found: true, value: field.value }
    : { found: false };
const primitiveArray = (value) => Array.isArray(value) ? value.filter(isPrimitive) : [];
const isPrimitive = (value) => value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
const capitalize = (value) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
