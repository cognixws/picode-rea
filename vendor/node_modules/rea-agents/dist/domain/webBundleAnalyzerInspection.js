import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { sanitizeEndpointCandidate } from "./browserObservation.js";
import { traverseJavaScriptAst } from "./javascript/javascriptSemanticTraversal.js";
import { classifyParsedJavaScriptOpenReceivers } from "./javascript/javascriptSemanticAnalysis.js";
import { semanticStaticPropertyName } from "./javascript/javascriptAstValues.js";
import { calleeName, endpointArgument, stringValue, } from "./javascript/javascriptStaticAnalysisHelpers.js";
import { location, locationFields, objectString, objectValue, resolveSpecifier, isUrlLikeModuleSpecifier, } from "./webBundleAnalyzerAst.js";
export const analyzeScript = (script, accumulator) => {
    let file;
    try {
        file = parse(script.source.artifact.text, {
            sourceType: "unambiguous",
            errorRecovery: true,
            plugins: ["jsx", "typescript"],
        });
    }
    catch (cause) {
        // Unparseable scripts are counted; the failure needs no extra detail.
        void cause;
        accumulator.parseFailures += 1;
        return;
    }
    accumulator.parsedScripts += 1;
    detectVendorFingerprints(script, accumulator);
    const openReceiverFacts = classifyParsedJavaScriptOpenReceivers(file);
    traverseJavaScriptAst(file, {
        enter: (node) => {
            accumulator.visitedNodes += 1;
            inspectNode(script, node, accumulator, openReceiverFacts);
        },
    });
};
const inspectNode = (script, node, accumulator, openReceiverFacts) => {
    if ((t.isImportDeclaration(node) || t.isExportAllDeclaration(node)) &&
        node.source !== undefined)
        addEdge({
            script,
            specifier: node.source.value,
            kind: "static_import",
            node,
            accumulator,
        });
    else if (t.isExportNamedDeclaration(node) && node.source != null)
        addEdge({
            script,
            specifier: node.source.value,
            kind: "static_import",
            node,
            accumulator,
        });
    else if (t.isImportExpression(node) && t.isStringLiteral(node.source))
        addEdge({
            script,
            specifier: node.source.value,
            kind: "dynamic_import",
            node,
            accumulator,
        });
    if (t.isObjectProperty(node))
        inspectRouteProperty(script, node, accumulator);
    if (t.isCallExpression(node) ||
        t.isOptionalCallExpression(node) ||
        t.isNewExpression(node))
        inspectCall(script, node, accumulator, openReceiverFacts);
};
const inspectCall = (script, node, accumulator, openReceiverFacts) => {
    const name = calleeName(node.callee);
    const first = stringValue(node.arguments[0]);
    if ((name === "require" || name.endsWith(".require")) && first !== undefined)
        addEdge({
            script,
            specifier: first,
            kind: "require",
            node,
            accumulator,
        });
    if (name === "importScripts" || name.endsWith(".importScripts"))
        for (const argument of node.arguments) {
            const specifier = stringValue(argument);
            if (specifier === undefined)
                continue;
            addEdge({ script, specifier, kind: "worker_import", node, accumulator });
        }
    if (routeCallNames.some((candidate) => name === candidate || name.endsWith(`.${candidate}`))) {
        if (first !== undefined)
            addFinding({
                collection: accumulator.routes,
                script,
                rawValue: first,
                mechanism: `call:${name}`,
                node,
                accumulator,
            });
        addRouteFrameworkInference({
            script,
            name,
            node,
            accumulator,
        });
    }
    const endpoint = endpointArgument(name, node.arguments, node.callee, openReceiverFacts.get(node.start ?? -1));
    if (endpoint !== undefined)
        addFinding({
            collection: accumulator.endpoints,
            script,
            rawValue: endpoint,
            mechanism: `call:${name}`,
            node,
            accumulator,
        });
    if ((t.isCallExpression(node) || t.isNewExpression(node)) &&
        (name.endsWith("modelContext.registerTool") ||
            name === "modelContext.registerTool"))
        addWebMcpDeclaration(script, node, accumulator);
};
const inspectRouteProperty = (script, node, accumulator) => {
    const key = semanticStaticPropertyName(node.key, node.computed);
    if ((key === "path" || key === "route") && t.isStringLiteral(node.value))
        addFinding({
            collection: accumulator.routes,
            script,
            rawValue: node.value.value,
            mechanism: `property:${key}`,
            node,
            accumulator,
        });
};
const addEdge = (context) => {
    const key = `edge\0${context.script.script_key}\0${context.kind}\0${context.specifier}`;
    addUnique(context.accumulator, key, () => context.accumulator.edges.push({
        from_script_key: context.script.script_key,
        kind: context.kind,
        specifier: context.specifier,
        resolved_url: context.kind === "worker_import" ||
            isUrlLikeModuleSpecifier(context.specifier)
            ? resolveSpecifier(context.specifier, context.script.url)
            : null,
        location: location(context.script.script_key, context.node),
    }));
};
const addFinding = (context) => {
    const value = sanitizeEndpointCandidate(context.rawValue);
    const key = `finding\0${context.mechanism}\0${context.script.script_key}\0${value}`;
    addUnique(context.accumulator, key, () => context.collection.push({
        value,
        mechanism: context.mechanism,
        location: location(context.script.script_key, context.node),
    }));
};
const addWebMcpDeclaration = (script, node, accumulator) => {
    const declaration = node.arguments[0];
    if (!t.isObjectExpression(declaration))
        return;
    const name = objectString(declaration, "name");
    const description = objectString(declaration, "description");
    const schema = objectValue(declaration, "inputSchema") ??
        objectValue(declaration, "input_schema");
    const declaredProperties = t.isObjectExpression(schema)
        ? objectValue(schema, "properties")
        : undefined;
    const propertyObject = t.isObjectExpression(declaredProperties)
        ? declaredProperties
        : schema;
    const schemaPropertyNames = t.isObjectExpression(propertyObject)
        ? propertyObject.properties.flatMap((property) => t.isObjectProperty(property)
            ? [
                semanticStaticPropertyName(property.key, property.computed),
            ].filter(Boolean)
            : [])
        : [];
    const key = `webmcp\0${script.script_key}\0${name ?? ""}\0${schemaPropertyNames.join("\0")}`;
    addUnique(accumulator, key, () => accumulator.webMcp.push({
        name: name ?? null,
        description: description ?? null,
        schema_property_names: [...new Set(schemaPropertyNames)].sort(),
        trust: "page-declared-untrusted",
        location: location(script.script_key, node),
    }));
};
const detectVendorFingerprints = (script, accumulator) => {
    const text = script.source.artifact.text;
    for (const detector of vendorDetectors) {
        if (!detector.patterns.some((pattern) => text.includes(pattern)))
            continue;
        const key = `vendor\0${script.script_key}\0${detector.value}`;
        addUnique(accumulator, key, () => accumulator.inferences.push({
            kind: detector.kind,
            value: detector.value,
            confidence: detector.confidence,
            basis: [basis(script, detector.detector)],
        }));
    }
};
const addRouteFrameworkInference = (context) => {
    const value = context.name.endsWith("useRoutes") ||
        context.name.endsWith("createBrowserRouter")
        ? "React Router-compatible route API"
        : "Generic route registration API";
    const key = `route-framework\0${context.script.script_key}\0${value}`;
    addUnique(context.accumulator, key, () => context.accumulator.inferences.push({
        kind: "route_framework",
        value,
        confidence: "medium",
        basis: [
            {
                ...basis(context.script, `call:${context.name}`),
                ...locationFields(context.node),
            },
        ],
    }));
};
const addUnique = (accumulator, key, add) => {
    if (accumulator.seen.has(key))
        return;
    accumulator.seen.add(key);
    add();
};
const basis = (script, detector) => ({
    script_key: script.script_key,
    artifact_sha256: script.source.artifact.sha256,
    line: null,
    column: null,
    detector,
});
export const emptyAccumulator = () => ({
    edges: [],
    routes: [],
    endpoints: [],
    webMcp: [],
    inferences: [],
    seen: new Set(),
    visitedNodes: 0,
    parsedScripts: 0,
    parseFailures: 0,
});
export const isIncludedScript = (script) => script.source.included;
const routeCallNames = [
    "route",
    "addRoute",
    "useRoutes",
    "createBrowserRouter",
    "createHashRouter",
];
const vendorDetectors = [
    {
        value: "webpack",
        detector: "webpack-runtime",
        patterns: ["__webpack_require__"],
        confidence: "high",
        kind: "bundle_runtime",
    },
    {
        value: "Vite",
        detector: "vite-runtime",
        patterns: ["__vite__", "import.meta.hot"],
        confidence: "medium",
        kind: "bundle_runtime",
    },
    {
        value: "React",
        detector: "react-runtime",
        patterns: ["__REACT_DEVTOOLS_GLOBAL_HOOK__", "React.createElement"],
        confidence: "medium",
        kind: "vendor_fingerprint",
    },
    {
        value: "Vue",
        detector: "vue-runtime",
        patterns: ["__VUE__", "createApp("],
        confidence: "medium",
        kind: "vendor_fingerprint",
    },
    {
        value: "Next.js",
        detector: "next-runtime",
        patterns: ["__NEXT_DATA__", "/_next/"],
        confidence: "high",
        kind: "vendor_fingerprint",
    },
    {
        value: "Angular",
        detector: "angular-runtime",
        patterns: ["ɵɵdefineComponent"],
        confidence: "high",
        kind: "vendor_fingerprint",
    },
    {
        value: "Svelte",
        detector: "svelte-runtime",
        patterns: ["svelte/internal"],
        confidence: "medium",
        kind: "vendor_fingerprint",
    },
];
