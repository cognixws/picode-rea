import * as t from "@babel/types";
import { compareCodePoints } from "../canonicalOrdering.js";
import { stripQueryAndFragment } from "../artifactPathSyntax.js";
import { addLocatedFinding } from "./javascriptStaticAnalysisFindings.js";
import { argumentNode, calleeName, propertyName, range, semanticStaticPropertyName, stringValue, } from "./javascriptStaticAnalysisHelpers.js";
/** Inspect JavaScript-side imports and re-exports of native .node addons. */
export const inspectElectronNativeNode = (node, context) => {
    if (t.isImportDeclaration(node))
        inspectImport(node, context);
    else if (t.isExportNamedDeclaration(node))
        inspectNamedExport(node, context);
    else if (t.isExportAllDeclaration(node))
        inspectExportAll(node, context);
    else if (t.isVariableDeclarator(node))
        inspectRequireBinding(node, context);
    else if (t.isAssignmentExpression(node))
        inspectReExport(node, context);
};
const inspectImport = (node, context) => {
    if (!isNativeSpecifier(node.source.value, "import"))
        return;
    const members = node.specifiers.map((specifier) => {
        if (t.isImportDefaultSpecifier(specifier))
            return "default";
        if (t.isImportNamespaceSpecifier(specifier))
            return "*";
        return propertyName(specifier.imported) || "[dynamic-import]";
    });
    addBinding({
        context,
        node,
        specifier: node.source.value,
        kind: "import",
        moduleKind: "import",
        members,
    });
};
const inspectNamedExport = (node, context) => {
    if (node.source === null ||
        node.source === undefined ||
        !isNativeSpecifier(node.source.value, "import"))
        return;
    const members = node.specifiers.map((specifier) => {
        if (t.isExportSpecifier(specifier))
            return propertyName(specifier.local);
        return "*";
    });
    addBinding({
        context,
        node,
        specifier: node.source.value,
        kind: "re-export",
        moduleKind: "import",
        members,
    });
};
const inspectExportAll = (node, context) => {
    if (node.source === undefined ||
        !isNativeSpecifier(node.source.value, "import"))
        return;
    addBinding({
        context,
        node,
        specifier: node.source.value,
        kind: "re-export",
        moduleKind: "import",
        members: ["*"],
    });
};
const inspectRequireBinding = (node, context) => {
    const required = nativeRequire(node.init);
    if (required === undefined)
        return;
    addBinding({
        context,
        node,
        specifier: required.specifier,
        kind: "require",
        moduleKind: "require",
        members: required.member === null ? bindingMembers(node.id) : [required.member],
    });
};
const inspectReExport = (node, context) => {
    const required = nativeRequire(node.right);
    if (required === undefined || !isModuleExport(node.left))
        return;
    addBinding({
        context,
        node,
        specifier: required.specifier,
        kind: "re-export",
        moduleKind: "require",
        members: [required.member ?? exportedMember(node.left) ?? "*"],
    });
};
const addBinding = (input) => {
    const { context, node, specifier, kind } = input;
    const unique = [
        ...new Set(input.members.filter((member) => member !== "")),
    ].sort(compareCodePoints);
    const members = unique.length === 0 ? ["*"] : unique;
    addLocatedFinding(context, {
        collection: context.accumulator.nativeAddonBindings,
        key: `native-addon-binding\0${kind}\0${specifier}\0${members.join("\0")}`,
        node,
        value: {
            specifier,
            binding_kind: kind,
            module_kind: input.moduleKind,
            members,
            module_key: null,
            location: range(node),
        },
    });
};
const nativeRequire = (node) => {
    let member = null;
    while (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
        if (!t.isNode(node.object))
            return undefined;
        const property = semanticStaticPropertyName(node.property, node.computed);
        if (member === null && property !== "")
            member = property;
        node = node.object;
    }
    if (!t.isCallExpression(node))
        return undefined;
    const name = calleeName(node.callee);
    if (name !== "require" &&
        !name.endsWith(".require") &&
        !name.includes("__webpack_require__"))
        return undefined;
    const specifier = stringValue(argumentNode(node.arguments[0]));
    return specifier !== undefined && isNativeSpecifier(specifier, "require")
        ? { specifier, member }
        : undefined;
};
const bindingMembers = (pattern) => {
    if (t.isIdentifier(pattern))
        return ["*"];
    if (!t.isObjectPattern(pattern))
        return ["*"];
    return pattern.properties.map((property) => {
        if (t.isRestElement(property))
            return "*";
        return propertyName(property.key) || "[dynamic-import]";
    });
};
const isModuleExport = (node) => {
    const name = calleeName(node);
    return (name === "module.exports" ||
        name.startsWith("module.exports.") ||
        name.startsWith("exports."));
};
const exportedMember = (node) => {
    const name = calleeName(node);
    if (name.startsWith("module.exports."))
        return name.slice("module.exports.".length);
    if (name.startsWith("exports."))
        return name.slice("exports.".length);
    return undefined;
};
const isNativeSpecifier = (specifier, moduleKind) => {
    const path = moduleKind === "require" ? specifier : stripQueryAndFragment(specifier);
    return path.toLowerCase().endsWith(".node");
};
