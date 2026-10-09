import { createHash } from "node:crypto";
import * as t from "@babel/types";
import { traverseJavaScriptAst } from "./javascriptSemanticTraversal.js";
import { compareCodePoints } from "../canonicalOrdering.js";
import { propertyName } from "./javascriptAstValues.js";
import { stringValue } from "./javascriptStaticAnalysisHelpers.js";
/** Derive a rename-resistant syntax fingerprint without code execution. */
export const fingerprintJavaScriptAst = (node) => {
    const tokens = [];
    traverseJavaScriptAst(node, {
        enter: (current) => {
            tokens.push(...semanticTokens(current));
            return undefined;
        },
    });
    return createHash("sha256").update(JSON.stringify(tokens)).digest("hex");
};
/** Collect statically declared CommonJS/bundler export names from one factory. */
export const collectJavaScriptExports = (node) => {
    const exports = new Set();
    traverseJavaScriptAst(node, {
        enter: (current) => {
            if (t.isAssignmentExpression(current))
                collectAssignmentExports(current.left, current.right, exports);
            if (t.isCallExpression(current))
                collectCallExports(current, exports);
            return undefined;
        },
    });
    return {
        values: [...exports].sort(compareCodePoints),
    };
};
const semanticTokens = (node) => {
    const tokens = [`node:${node.type}`];
    if (t.isStringLiteral(node))
        tokens.push(`string:${node.value}`);
    else if (t.isNumericLiteral(node))
        tokens.push(`number:${String(node.value)}`);
    else if (t.isBooleanLiteral(node))
        tokens.push(`boolean:${String(node.value)}`);
    else if (t.isRegExpLiteral(node))
        tokens.push(`regexp:${node.pattern}/${node.flags}`);
    else if (t.isBinaryExpression(node) || t.isLogicalExpression(node))
        tokens.push(`operator:${node.operator}`);
    else if (t.isUnaryExpression(node) || t.isUpdateExpression(node))
        tokens.push(`operator:${node.operator}`);
    if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
        const property = propertyName(node.property);
        if (property !== "")
            tokens.push(`property:${property}`);
    }
    if ((t.isObjectProperty(node) || t.isObjectMethod(node)) && !node.computed) {
        const key = propertyName(node.key);
        if (key !== "")
            tokens.push(`key:${key}`);
    }
    return tokens;
};
const collectAssignmentExports = (left, right, output) => {
    const path = memberPath(left);
    if (path === "exports" || path === "module.exports") {
        if (t.isObjectExpression(right))
            collectObjectKeys(right, output);
        else
            addExport(output, "default");
        return;
    }
    if (path.startsWith("exports."))
        addExport(output, path.slice("exports.".length));
    if (path.startsWith("module.exports."))
        addExport(output, path.slice("module.exports.".length));
};
const collectCallExports = (call, output) => {
    const callee = memberPath(call.callee);
    if (callee === "Object.defineProperty") {
        const target = memberPath(call.arguments[0]);
        const name = stringValue(call.arguments[1]);
        if ((target === "exports" || target === "module.exports") && name)
            addExport(output, name);
    }
    if (!callee.endsWith(".d"))
        return;
    const target = memberPath(call.arguments[0]);
    const declarations = call.arguments[1];
    if ((target === "exports" || target === "module.exports") &&
        t.isObjectExpression(declarations))
        collectObjectKeys(declarations, output);
};
const collectObjectKeys = (object, output) => {
    for (const property of object.properties) {
        if (!t.isObjectProperty(property) && !t.isObjectMethod(property))
            continue;
        const name = propertyName(property.key);
        if (name !== "")
            addExport(output, name);
    }
};
const addExport = (output, name) => {
    output.add(name);
};
const memberPath = (node) => {
    const properties = [];
    let current = node;
    while (current !== undefined &&
        current !== null &&
        (t.isMemberExpression(current) || t.isOptionalMemberExpression(current))) {
        properties.push(propertyName(current.property));
        current = t.isNode(current.object) ? current.object : undefined;
    }
    const root = current !== undefined && t.isIdentifier(current)
        ? current.name
        : current !== undefined && t.isThisExpression(current)
            ? "this"
            : "";
    if (properties.length === 0)
        return root;
    properties.reverse();
    const path = root === "" ? [] : [root];
    for (const property of properties) {
        if (path.length === 0 && property === "")
            continue;
        path.push(property);
    }
    return path.join(".");
};
