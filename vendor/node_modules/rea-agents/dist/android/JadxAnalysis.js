import { androidResultSchemas } from "../domain/android/androidAnalysis.js";
import { AnalysisCapabilityUnavailableError, AnalysisInputError, AnalysisOutputError, } from "../domain/analysisErrorCore.js";
import { jadxAppSchema, jadxClassPageSchema, jadxClassSchema, jadxLoadSchema, jadxMethodSchema, jadxXrefsSchema, normalizeJadxText, } from "./JadxProtocol.js";
import { JADX_RELEASE } from "./JadxRelease.js";
const methodsOf = (summary) => {
    const seen = new Map();
    return summary.methods.map((method) => {
        const index = seen.get(method.name) ?? 0;
        seen.set(method.name, index + 1);
        return {
            name: method.name,
            reported_signature: method.signature,
            overload_index: index,
            is_constructor: method.is_constructor,
            dex_descriptor: null,
        };
    });
};
const inputFailure = (request, field, message) => {
    throw new AnalysisInputError(request.operation, undefined, [
        { path: [field], reason: "invalid_value", message },
    ]);
};
const classSummary = async (tools, request) => {
    const raw = await tools.json("get_class_summary", {
        class_name: request.input.class_name,
    });
    if (raw !== null &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        typeof raw.error === "string")
        throw new AnalysisOutputError(request.operation, `JADX class summary failed: ${raw.error}`);
    const summary = jadxClassSchema.safeParse(raw);
    if (!summary.success)
        throw new AnalysisOutputError(request.operation, "JADX class summary failed or was malformed; negative counts are not an empty class", { cause: summary.error });
    const value = summary.data;
    if (value.full_name !== request.input.class_name)
        inputFailure(request, "class_name", `Exact class ${request.input.class_name} resolved to ${value.full_name}; use the fully qualified class name from search_android_classes.`);
    if (value.method_count !== value.methods.length ||
        value.field_count !== value.fields.length ||
        value.inner_class_count !== value.inner_classes.length)
        throw new AnalysisOutputError(request.operation, "JADX class member counts do not match the returned inventory");
    return value;
};
const inspectPackage = async (tools, loaded, engine) => {
    const app = jadxAppSchema.parse(await tools.json("get_app_info", {}));
    const manifest = normalizeJadxText(await tools.text("get_android_manifest", {}));
    return androidResultSchemas.inspect_android_package.parse({
        engine,
        package_name: app.package || null,
        version_name: app.version_name || null,
        version_code: app.version_code || null,
        min_sdk: app.min_sdk || null,
        target_sdk: app.target_sdk || null,
        permissions: app.permissions,
        manifest,
        class_count: loaded.class_count,
        resource_count: loaded.resource_count,
        signature_verification: "not_performed",
    });
};
const searchClasses = async (tools, request, loaded, engine) => {
    const classes = [];
    const pageSize = 4096;
    let total;
    do {
        const page = jadxClassPageSchema.parse(await tools.json("list_classes", {
            offset: classes.length,
            limit: pageSize,
        }));
        if ((total !== undefined && total !== page.total) ||
            page.offset !== classes.length ||
            page.limit !== pageSize ||
            page.items.length > pageSize)
            throw new AnalysisOutputError(request.operation, "JADX class pagination changed identity or counts");
        total = page.total;
        classes.push(...page.items);
        if (classes.length > total ||
            (page.items.length === 0 && classes.length < total))
            throw new AnalysisOutputError(request.operation, "JADX class pagination is incomplete");
    } while (classes.length < total);
    if (new Set(classes).size !== classes.length || total !== loaded.class_count)
        throw new AnalysisOutputError(request.operation, "JADX class inventory is duplicated or differs from the loaded class count");
    return androidResultSchemas.search_android_classes.parse({
        engine,
        query: request.input.query,
        total_classes: total,
        matches: classes.filter((name) => name.includes(request.input.query)),
        coverage: "complete",
    });
};
const matchingMethods = (summary, request) => {
    const candidates = methodsOf(summary).filter((method) => method.name === request.input.method_name);
    if (request.input.method_name !== undefined && candidates.length === 0)
        inputFailure(request, "method_name", `Method ${summary.full_name}.${request.input.method_name} was not found; inspect_android_class lists available methods.`);
    return candidates;
};
const inspectMethod = async (tools, request, summary, engine) => {
    const candidates = matchingMethods(summary, request);
    if (candidates.length > 1 && request.input.overload_index === undefined)
        inputFailure(request, "overload_index", `Select one of ${candidates.length} overloads: ${candidates.map((method) => `${method.overload_index}: ${method.reported_signature}`).join("; ")}`);
    const index = request.input.overload_index ?? 0;
    const selected = candidates[index];
    if (selected === undefined)
        inputFailure(request, "overload_index", `Index ${index} is outside the ${candidates.length} matching overloads.`);
    const body = jadxMethodSchema.parse(await tools.json("get_method_body", {
        class_name: summary.full_name,
        method_name: request.input.method_name,
        overload_index: index,
        smali_fallback: true,
    }));
    if (body.class_name !== summary.full_name ||
        body.method_name !== request.input.method_name ||
        body.overload_index !== index ||
        body.overload_count !== candidates.length)
        throw new AnalysisOutputError(request.operation, "JADX returned a different method or overload inventory");
    if (body.body.startsWith("// ERROR:"))
        throw new AnalysisOutputError(request.operation, `JADX did not produce method source: ${body.body}`);
    if (body.mode === "smali" && candidates.length > 1)
        throw new AnalysisCapabilityUnavailableError("jadx", request.operation, `JADX ${JADX_RELEASE.version} smali fallback joins all same-name overloads for ${summary.full_name}.${request.input.method_name}; it cannot establish source for only overload ${index}.`);
    return androidResultSchemas.inspect_android_method.parse({
        engine,
        class_name: summary.full_name,
        method: selected,
        overload_count: candidates.length,
        representation: body.mode,
        body_status: body.body.length === 0 ||
            body.body ===
                "// method exists but has no decompiled body (native/abstract)"
            ? "not_available"
            : "available",
        fell_back: body.fell_back,
        markers: body.markers,
        source: normalizeJadxText(body.body),
    });
};
/** Normalize only the selected analyst outcome and reject ambiguous engine selectors. */
export const analyzeJadxRequest = async (tools, request, loaded, engine) => {
    if (request.operation === "inspect_android_package")
        return inspectPackage(tools, loaded, engine);
    if (request.operation === "search_android_classes")
        return searchClasses(tools, request, loaded, engine);
    const summary = await classSummary(tools, request);
    if (request.operation === "inspect_android_class")
        return androidResultSchemas.inspect_android_class.parse({
            engine,
            class_name: summary.full_name,
            methods: methodsOf(summary),
            fields: summary.fields.map((field) => ({
                name: field.name,
                reported_type: field.type,
            })),
            inner_classes: summary.inner_classes,
        });
    if (request.operation === "inspect_android_method")
        return inspectMethod(tools, request, summary, engine);
    return traceReferences(tools, request, summary, engine);
};
const traceReferences = async (tools, request, summary, engine) => {
    const methodName = request.input.method_name;
    const candidates = matchingMethods(summary, request);
    if (candidates.length > 1)
        throw new AnalysisCapabilityUnavailableError("jadx", request.operation, `References require a unique method name; ${summary.full_name}.${methodName} has ${candidates.length} overloads. No unambiguous reference result is available.`);
    const expectedTarget = methodName === undefined
        ? summary.full_name
        : `${summary.full_name}.${methodName}`;
    const xrefs = jadxXrefsSchema.parse(await tools.json(methodName === undefined ? "get_xrefs_to_class" : "get_xrefs_to_method", {
        class_name: summary.full_name,
        ...(methodName === undefined ? {} : { method_name: methodName }),
        limit: 2_147_483_647,
        resolve_line: false,
    }));
    if (xrefs.target !== expectedTarget ||
        xrefs.total !== xrefs.count ||
        xrefs.count !== xrefs.items.length)
        throw new AnalysisOutputError(request.operation, "JADX references are incomplete or refer to another target");
    return androidResultSchemas.trace_android_references.parse({
        engine,
        class_name: summary.full_name,
        method_name: methodName ?? null,
        total: xrefs.total,
        references: xrefs.items.map((reference) => ({
            kind: reference.kind,
            name: reference.name,
            reported_full_name: reference.full_name,
            containing_class: reference.containing_class,
            top_class: reference.top_class,
            source_line: null,
            dex_offset: null,
        })),
        coverage: "complete",
    });
};
