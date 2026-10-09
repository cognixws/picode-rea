import * as t from "@babel/types";
import { compareCodePoints } from "../canonicalOrdering.js";
import { readExactJavaScriptLiteral, semanticStaticPropertyName, } from "./javascriptAstValues.js";
import { sourceSlice } from "./javascriptStaticAnalysisHelpers.js";
/** Preserve one literal value or the exact inert expression. */
export const electronStaticValue = (source, node) => {
    const literal = literalValue(node);
    return literal.found
        ? { status: "literal", value: literal.value, expression: null }
        : {
            status: "dynamic",
            value: null,
            expression: boundedExpression(source, node),
        };
};
/** Return an actionable expression without evaluating it. */
export const boundedExpression = (source, node) => {
    if (node === null || node === undefined)
        return "[missing-expression]";
    const expression = sourceSlice(source, node).trim();
    return expression === "" ? `[${node.type}]` : expression;
};
/** Find the effective explicit property, preserving unresolved overrides. */
export const objectProperty = (object, name) => {
    if (object === undefined)
        return { status: "missing" };
    if (!t.isObjectExpression(object))
        return { status: "dynamic" };
    for (const property of object.properties.toReversed()) {
        if (t.isSpreadElement(property))
            return { status: "dynamic" };
        const key = semanticStaticPropertyName(property.key, property.computed);
        if (key === "" && !t.isStringLiteral(property.key))
            return { status: "dynamic" };
        if (key !== name)
            continue;
        return t.isObjectProperty(property)
            ? { status: "explicit", property }
            : { status: "dynamic" };
    }
    return { status: "missing" };
};
export function handlerKind(node) {
    if (node === null || node === undefined)
        return "missing";
    if (t.isArrowFunctionExpression(node) ||
        t.isFunctionExpression(node) ||
        t.isFunctionDeclaration(node))
        return "inline-function";
    if (t.isIdentifier(node))
        return "identifier";
    if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node))
        return "member-expression";
    return "dynamic-expression";
}
/** Collect statically visible dotted keys from one literal contextBridge API object. */
export const collectContextBridgeMembers = (node) => {
    if (node === null || node === undefined)
        return {
            status: "missing",
            members: [],
            unknown: 0,
        };
    if (!t.isObjectExpression(node))
        return {
            status: "dynamic",
            members: [],
            unknown: 1,
        };
    const state = {
        members: [],
        unknown: 0,
    };
    collectMembersAt(node, "", 0, state);
    const members = [...new Set(state.members)].sort(compareCodePoints);
    return {
        status: "object-literal",
        members,
        unknown: state.unknown,
    };
};
const collectMembersAt = (object, prefix, depth, state) => {
    if (depth >= 8) {
        state.unknown += 1;
        return;
    }
    for (const property of object.properties) {
        if (t.isSpreadElement(property)) {
            state.unknown += 1;
            continue;
        }
        const name = semanticStaticPropertyName(property.key, property.computed);
        if (name === "" || property.computed) {
            state.unknown += 1;
            continue;
        }
        const path = prefix === "" ? name : `${prefix}.${name}`;
        state.members.push(path);
        if (t.isObjectProperty(property) && t.isObjectExpression(property.value))
            collectMembersAt(property.value, path, depth + 1, state);
    }
};
const literalValue = (node) => {
    if (node === null || node === undefined)
        return { found: false };
    const literal = readExactJavaScriptLiteral(node);
    if (literal.found)
        return literal;
    if (t.isUnaryExpression(node, { operator: "-" }) &&
        t.isNumericLiteral(node.argument))
        return { found: true, value: -node.argument.value };
    return { found: false };
};
