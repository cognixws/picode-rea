import { parse } from "@babel/parser";
import { isCallExpression, isExportAllDeclaration, isExportNamedDeclaration, isIdentifier, isImport, isImportDeclaration, isImportExpression, isMemberExpression, isNode, isStringLiteral, isTSExternalModuleReference, isTSImportEqualsDeclaration, isTSModuleDeclaration, } from "@babel/types";
const codeSourceLanguages = new Set(["JavaScript", "TypeScript", "JSX", "TSX"]);
const safeModuleName = (node) => {
    if (isStringLiteral(node))
        return node.value;
    return undefined;
};
const resolveSpecifier = (specifier) => {
    if (specifier.startsWith(".") || specifier.startsWith("/"))
        return "internal";
    if (specifier.startsWith("node:") || specifier.startsWith("data:"))
        return "external";
    return "external";
};
const isModuleExpression = (expression) => isStringLiteral(expression) || isCallExpression(expression);
const moduleSpecifierFromExpression = (expression) => {
    if (isStringLiteral(expression))
        return { specifier: expression.value, parseState: "parsed" };
    if (isCallExpression(expression) &&
        isImport(expression.callee) &&
        expression.arguments.length > 0) {
        const first = expression.arguments[0];
        if (isStringLiteral(first)) {
            return { specifier: first.value, parseState: "parsed" };
        }
        return { specifier: "<dynamic-import>", parseState: "partial" };
    }
    return undefined;
};
const appendRelationship = (relationships, input) => {
    if (input.to === undefined)
        return;
    relationships.push({
        from_path: input.fromPath,
        to: input.to,
        kind: input.kind,
        resolution: input.resolution ?? resolveSpecifier(input.to),
        parse_state: input.parseState,
    });
};
const extractImportDeclarations = (body, from_path, relationships) => {
    for (const statement of body) {
        if (isImportDeclaration(statement)) {
            appendRelationship(relationships, {
                fromPath: from_path,
                to: safeModuleName(statement.source),
                kind: "imports",
                parseState: "parsed",
            });
            continue;
        }
        if (isExportNamedDeclaration(statement)) {
            if (statement.source !== null && statement.source !== undefined) {
                appendRelationship(relationships, {
                    fromPath: from_path,
                    to: safeModuleName(statement.source),
                    kind: "imports",
                    parseState: "parsed",
                });
            }
            continue;
        }
        if (isExportAllDeclaration(statement)) {
            appendRelationship(relationships, {
                fromPath: from_path,
                to: safeModuleName(statement.source),
                kind: "imports",
                parseState: "parsed",
            });
            continue;
        }
        if (isTSImportEqualsDeclaration(statement)) {
            const reference = statement.moduleReference;
            if (isTSExternalModuleReference(reference)) {
                appendRelationship(relationships, {
                    fromPath: from_path,
                    to: safeModuleName(reference.expression),
                    kind: "requires",
                    parseState: "parsed",
                });
            }
            continue;
        }
        if (isTSModuleDeclaration(statement)) {
            if (statement.declare === true && isStringLiteral(statement.id)) {
                appendRelationship(relationships, {
                    fromPath: from_path,
                    to: statement.id.value,
                    kind: "declares-module",
                    parseState: "parsed",
                    resolution: "unknown",
                });
            }
        }
    }
};
const isRequireCallee = (callee) => {
    if (isIdentifier(callee) && callee.name === "require")
        return true;
    if (isMemberExpression(callee) &&
        isIdentifier(callee.object) &&
        callee.object.name === "require" &&
        ((!callee.computed && isIdentifier(callee.property)) ||
            isStringLiteral(callee.property))) {
        const propertyName = isIdentifier(callee.property)
            ? callee.property.name
            : isStringLiteral(callee.property)
                ? callee.property.value
                : undefined;
        return propertyName === "resolve" || propertyName === "main";
    }
    return false;
};
const isImportCallee = (callee) => isImport(callee);
const collectModuleExpressions = (node, targets) => {
    if (node === null || node === undefined)
        return;
    if (typeof node !== "object")
        return;
    if (Array.isArray(node)) {
        for (const item of node)
            collectModuleExpressions(item, targets);
        return;
    }
    if (!isNode(node))
        return;
    if (isCallExpression(node) || isImportExpression(node)) {
        targets.push(node);
    }
    for (const value of Object.values(node)) {
        if (value !== null &&
            value !== undefined &&
            typeof value === "object" &&
            !isSourceLocation(value)) {
            collectModuleExpressions(value, targets);
        }
    }
};
const isSourceLocation = (value) => typeof value === "object" &&
    value !== null &&
    "start" in value &&
    "end" in value &&
    !("type" in value);
const extractRequireAndDynamicImports = (body, from_path, relationships) => {
    const expressions = [];
    for (const statement of body)
        collectModuleExpressions(statement, expressions);
    for (const call of expressions) {
        if (isImportExpression(call)) {
            const specifier = safeModuleName(call.source);
            appendRelationship(relationships, {
                fromPath: from_path,
                to: specifier ?? "<dynamic-import>",
                kind: "imports",
                parseState: specifier === undefined ? "partial" : "parsed",
                ...(specifier === undefined ? { resolution: "unknown" } : {}),
            });
            continue;
        }
        const first = call.arguments[0];
        if (isRequireCallee(call.callee) && isModuleExpression(first)) {
            const result = moduleSpecifierFromExpression(first);
            if (result !== undefined) {
                appendRelationship(relationships, {
                    fromPath: from_path,
                    to: result.specifier,
                    kind: "requires",
                    parseState: result.parseState,
                });
            }
            continue;
        }
        if (isImportCallee(call.callee) && isModuleExpression(first)) {
            const result = moduleSpecifierFromExpression(first);
            if (result !== undefined) {
                appendRelationship(relationships, {
                    fromPath: from_path,
                    to: result.specifier,
                    kind: "imports",
                    parseState: result.parseState,
                });
            }
        }
    }
};
const parseWithBabel = (path, source, language) => {
    const plugins = ["jsx"];
    if (language === "TypeScript" || language === "TSX") {
        plugins.push([
            "typescript",
            {
                dts: path.endsWith(".d.ts") ||
                    path.endsWith(".d.mts") ||
                    path.endsWith(".d.cts"),
            },
        ]);
    }
    try {
        const ast = parse(source, {
            sourceType: "unambiguous",
            allowImportExportEverywhere: false,
            allowReturnOutsideFunction: true,
            allowUndeclaredExports: true,
            errorRecovery: true,
            plugins,
        });
        return { ast, reasons: ast.errors.map((error) => error.message) };
    }
    catch (cause) {
        return {
            ast: undefined,
            reasons: [cause instanceof Error ? cause.message : "Parse failed"],
        };
    }
};
/** Parse ESM/CommonJS imports and dynamic imports from source bytes. */
export const parseReferenceSourceImports = (path, bytes, language) => {
    if (language !== null && !codeSourceLanguages.has(language))
        return { relationships: [], parse_failures: [] };
    const source = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const { ast, reasons } = parseWithBabel(path, source, language);
    const parseFailures = reasons.map((reason) => ({
        path,
        parser: "babel",
        reason,
    }));
    if (ast === undefined) {
        return {
            relationships: [],
            parse_failures: parseFailures,
        };
    }
    const relationships = [];
    extractImportDeclarations(ast.program.body, path, relationships);
    extractRequireAndDynamicImports(ast.program.body, path, relationships);
    return {
        relationships: relationships.map((relationship) => ({
            ...relationship,
            parse_state: parseFailures.length > 0 && relationship.parse_state === "parsed"
                ? "partial"
                : relationship.parse_state,
        })),
        parse_failures: parseFailures,
    };
};
