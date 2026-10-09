import { z } from 'zod';
import * as Command from './internal/command.js';
import { formatCtaBlock, renderCtaText } from './internal/cta.js';
import * as Json from './internal/json.js';
import * as Schema from './Schema.js';
/** Starts a stdio MCP server that exposes commands as tools. */
export async function serve(name, version, commands, options = {}) {
    // Lazy: only runs when actually serving MCP, so plain command runs don't pay for the SDK import.
    const stdio = importStdioModule();
    const mcp = await import('@modelcontextprotocol/server');
    const { fromJsonSchema, McpServer } = mcp;
    const StdioServerTransport = await importStdioServerTransport(mcp, stdio);
    const server = new McpServer({ name, ...(options.title ? { title: options.title } : undefined), version }, options.instructions ? { instructions: options.instructions } : undefined);
    registerTools(server, commands, {
        env: options.env,
        fromJsonSchema,
        middlewares: options.middlewares,
        name,
        sendNotification: (notification) => server.server.notification(notification),
        tools: options.tools,
        vars: options.vars,
        version,
    });
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const transport = new StdioServerTransport(input, output);
    await server.connect(transport);
}
async function importStdioServerTransport(mcp, stdio) {
    const transport = mcp.StdioServerTransport;
    if (transport)
        return transport;
    const result = await stdio;
    if (result.error)
        throw result.error;
    return result.module.StdioServerTransport;
}
function importStdioModule() {
    return importModule('@modelcontextprotocol/server/stdio')
        .then((module) => ({ module }))
        .catch((error) => ({ error }));
}
const importModule = (specifier) => import(specifier);
/** @internal Executes a tool call and returns a CallToolResult. */
export async function callTool(tool, params, options = {}) {
    const allMiddleware = [
        ...(options.middlewares ?? []),
        ...(tool.middlewares ?? []),
        ...(tool.command.middleware ?? []),
    ];
    const result = await Command.execute(tool.command, {
        agent: true,
        argv: [],
        env: options.env,
        format: 'json',
        formatExplicit: true,
        inputOptions: params,
        middlewares: allMiddleware,
        name: options.name ?? tool.name,
        parseMode: 'flat',
        path: tool.name,
        request: options.request,
        vars: options.vars,
        version: options.version,
    });
    if ('stream' in result) {
        // Streaming: send progress notifications per chunk, then return buffered result
        const chunks = [];
        const progressToken = options.extra?.mcpReq?._meta?.progressToken;
        let i = 0;
        try {
            for await (const chunk of result.stream) {
                chunks.push(chunk);
                if (progressToken !== undefined && options.sendNotification)
                    await options.sendNotification({
                        method: 'notifications/progress',
                        params: { progressToken, progress: ++i, message: Json.stringify(chunk) },
                    });
            }
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
                isError: true,
            };
        }
        return { content: [{ type: 'text', text: Json.stringify(chunks) }] };
    }
    if (!result.ok) {
        const cta = formatCtaBlock(options.name ?? tool.name, result.cta);
        const text = result.error.fieldErrors
            ? JSON.stringify(result.error)
            : (result.error.message ?? 'Command failed');
        return {
            content: [{ type: 'text', text: cta ? `${text}\n\n${renderCtaText(cta)}` : text }],
            ...(cta ? { _meta: { cta } } : undefined),
            isError: true,
        };
    }
    const data = result.data ?? null;
    const jsonData = Json.normalize(data);
    const cta = formatCtaBlock(options.name ?? tool.name, result.cta);
    const text = Json.stringify(jsonData);
    return {
        // Append rendered suggestions to the text so models see them (most clients drop _meta).
        content: [{ type: 'text', text: cta ? `${text}\n\n${renderCtaText(cta)}` : text }],
        ...(data !== null && tool.outputSchema
            ? { structuredContent: jsonData }
            : undefined),
        ...(cta ? { _meta: { cta } } : undefined),
    };
}
/** @internal Registers direct or progressively discovered MCP tools. */
export function registerTools(server, commands, options) {
    const tools = collectTools(commands, [], [], options.tools);
    if (tools.length === 0)
        return;
    if ((options.tools?.discovery ?? 'progressive') === 'direct') {
        for (const tool of tools)
            registerDirectTool(server, tool, options);
        return;
    }
    registerDiscoveryTools(server, tools, options);
}
function registerDirectTool(server, tool, options) {
    const mergedShape = {
        ...tool.command.args?.shape,
        ...tool.command.options?.shape,
    };
    const hasInput = Object.keys(mergedShape).length > 0;
    server.registerTool(tool.name, {
        ...(tool.description ? { description: tool.description } : undefined),
        ...(hasInput ? { inputSchema: z.object(mergedShape) } : undefined),
        ...(tool.outputSchema
            ? { outputSchema: options.fromJsonSchema(tool.outputSchema) }
            : undefined),
        ...(tool.annotations ? { annotations: tool.annotations } : undefined),
        ...(tool.instructions ? { _meta: { instructions: tool.instructions } } : undefined),
    }, async (...callArgs) => {
        // registerTool passes (args, extra) when inputSchema is set, (extra) when not.
        const params = hasInput ? callArgs[0] : {};
        const extra = hasInput ? callArgs[1] : callArgs[0];
        return callTool(tool, params, callOptions(options, extra));
    });
}
function registerDiscoveryTools(server, tools, options) {
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    server.registerTool('search_tools', {
        description: 'Search or page through available tools by capability. Returns names and descriptions without loading their schemas. Inspect a result before calling it.',
        inputSchema: z.object({
            limit: z.number().int().min(1).max(20).default(5).describe('Maximum matches.'),
            offset: z.number().int().min(0).default(0).describe('Matches to skip.'),
            query: z.string().default('').describe('Capability to find. Empty lists all tools.'),
        }),
        annotations: catalogAnnotations,
    }, async (params) => {
        const matches = searchTools(tools, params.query);
        const page = matches.slice(params.offset, params.offset + params.limit);
        return toolResult({
            tools: page.map((tool) => ({
                name: tool.name,
                ...(tool.description ? { description: tool.description } : undefined),
                ...(tool.annotations ? { annotations: tool.annotations } : undefined),
            })),
            ...(params.offset + page.length < matches.length
                ? { nextOffset: params.offset + page.length }
                : undefined),
        });
    });
    server.registerTool('get_tool_details', {
        description: 'Inspect one tool returned by search_tools. Returns its complete input schema and metadata.',
        inputSchema: z.object({ name: z.string().min(1).describe('Exact tool name.') }),
        annotations: catalogAnnotations,
    }, async (params) => {
        const tool = byName.get(params.name);
        if (!tool)
            return toolError(`Unknown tool: ${params.name}`);
        return toolResult({
            name: tool.name,
            ...(tool.description ? { description: tool.description } : undefined),
            inputSchema: tool.inputSchema,
            ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : undefined),
            ...(tool.annotations ? { annotations: tool.annotations } : undefined),
            ...(tool.instructions ? { instructions: tool.instructions } : undefined),
        });
    });
    server.registerTool('call_read_tool', {
        description: 'Execute a tool marked read-only after inspecting its schema with get_tool_details.',
        inputSchema: callSchema,
        annotations: readAnnotations,
    }, async (params, extra) => {
        const tool = byName.get(params.name);
        if (!tool)
            return toolError(`Unknown tool: ${params.name}`);
        if (tool.annotations?.readOnlyHint !== true)
            return toolError(`Tool is not read-only: ${params.name}`);
        return callTool(tool, params.arguments, callOptions(options, extra));
    });
    server.registerTool('call_write_tool', {
        description: 'Execute a writable or unclassified tool after inspecting its schema with get_tool_details.',
        inputSchema: callSchema,
        annotations: writeAnnotations,
    }, async (params, extra) => {
        const tool = byName.get(params.name);
        if (!tool)
            return toolError(`Unknown tool: ${params.name}`);
        if (tool.annotations?.readOnlyHint === true)
            return toolError(`Tool is read-only: ${params.name}`);
        return callTool(tool, params.arguments, callOptions(options, extra));
    });
}
const callSchema = z.object({
    name: z.string().min(1).describe('Exact tool name.'),
    arguments: z.record(z.string(), z.unknown()).default({}).describe('Arguments from its schema.'),
});
const catalogAnnotations = {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
};
const readAnnotations = {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
};
const writeAnnotations = {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
};
function callOptions(options, extra) {
    return {
        env: options.env,
        extra,
        middlewares: options.middlewares,
        name: options.name,
        request: options.request?.(extra),
        ...(options.sendNotification ? { sendNotification: options.sendNotification } : undefined),
        vars: options.vars,
        version: options.version,
    };
}
function searchTools(tools, query) {
    const normalized = normalizeSearch(query);
    const terms = normalized.split(' ').filter(Boolean);
    return tools
        .map((tool) => ({ tool, score: toolScore(tool, normalized, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
        .map(({ tool }) => tool);
}
function toolScore(tool, query, terms) {
    const name = normalizeSearch(tool.name);
    const description = normalizeSearch(tool.description ?? '');
    if (name === query)
        return 1_000;
    let score = name.startsWith(query) ? 100 : name.includes(query) ? 50 : 0;
    for (const term of terms) {
        if (name.split(' ').includes(term))
            score += 20;
        else if (name.includes(term))
            score += 10;
        if (description.includes(term))
            score += 2;
    }
    return score;
}
function normalizeSearch(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function toolResult(value) {
    return { content: [{ type: 'text', text: Json.stringify(value) }] };
}
function toolError(message) {
    return { ...toolResult({ error: message }), isError: true };
}
/** @internal Recursively collects leaf commands as tool entries. */
export function collectTools(commands, prefix, parentMiddlewares = [], filter) {
    const tools = filterTools(collectToolEntries(commands, prefix, parentMiddlewares), filter);
    assertUniqueToolNames(tools);
    return tools.sort((a, b) => a.name.localeCompare(b.name));
}
function collectToolEntries(commands, prefix, parentMiddlewares = []) {
    const result = [];
    for (const [name, entry] of commands) {
        if ('_alias' in entry)
            continue;
        if (entry.mcp === false)
            continue;
        const path = [...prefix, name];
        if ('_group' in entry && entry._group) {
            const groupMw = [
                ...parentMiddlewares,
                ...(entry.middlewares ?? []),
            ];
            if (entry.root && entry.root.mcp !== false)
                result.push(toToolEntry(entry.root, path, groupMw));
            result.push(...collectToolEntries(entry.commands, path, groupMw));
        }
        else
            result.push(toToolEntry(entry, path, parentMiddlewares));
    }
    return result;
}
function toToolEntry(entry, path, middlewares) {
    const mcp = entry.mcp === false ? undefined : entry.mcp;
    const outputSchema = entry.output ? mcpOutputSchema(entry.output) : undefined;
    return {
        name: mcp?.name ?? path.join('_'),
        description: mcp?.description ?? entry.description,
        inputSchema: buildToolSchema(entry.args, entry.options),
        ...(outputSchema ? { outputSchema } : undefined),
        ...(mcp?.annotations ? { annotations: mcp.annotations } : undefined),
        ...(mcp?.instructions ? { instructions: mcp.instructions } : undefined),
        command: entry,
        ...(middlewares.length > 0 ? { middlewares } : undefined),
    };
}
/** Filters MCP tools by include and exclude patterns. */
export function filterTools(tools, filter) {
    if (!filter)
        return tools;
    const includes = filter.include?.map(patternToRegExp);
    const excludes = filter.exclude?.map(patternToRegExp) ?? [];
    return tools.filter((tool) => {
        if (excludes.some((pattern) => pattern.test(tool.name)))
            return false;
        if (!includes || includes.length === 0)
            return true;
        return includes.some((pattern) => pattern.test(tool.name));
    });
}
function patternToRegExp(pattern) {
    const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}
function assertUniqueToolNames(tools) {
    const seen = new Set();
    for (const tool of tools) {
        if (seen.has(tool.name))
            throw new Error(`Duplicate MCP tool name: ${tool.name}`);
        seen.add(tool.name);
    }
}
function mcpOutputSchema(output) {
    const schema = Schema.toJsonSchema(output);
    if (schema.type === 'object')
        return schema;
    return undefined;
}
/** @internal Builds a merged JSON Schema from args and options Zod schemas. */
function buildToolSchema(args, options) {
    const properties = {};
    const required = [];
    for (const schema of [args, options]) {
        if (!schema)
            continue;
        const json = Schema.toJsonSchema(schema);
        Object.assign(properties, json.properties ?? {});
        required.push(...(json.required ?? []));
    }
    if (required.length > 0)
        return { type: 'object', properties, required };
    return { type: 'object', properties };
}
//# sourceMappingURL=Mcp.js.map