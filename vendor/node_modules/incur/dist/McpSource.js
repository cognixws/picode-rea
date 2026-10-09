import { z } from 'zod';
import * as Openapi from './Openapi.js';
const protocolVersion = '2025-06-18';
/** Resolves a remote MCP server by initializing it and listing its tools. */
export async function resolve(source, options = {}) {
    const session = sourceSession(source);
    await request(session, 'initialize', {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: 'incur', version: options.version ?? '1.0.0' },
    });
    session.initialized = true;
    await request(session, 'notifications/initialized');
    const result = await request(session, 'tools/list');
    const listed = (result.tools ?? []);
    if (isProgressiveCatalog(listed))
        return { discovery: 'progressive', tools: await discoverTools(session), session };
    return { tools: listed, session };
}
/** Generates incur command entries from remote MCP tools. */
export function generateCommands(resolved) {
    const commands = new Map();
    for (const tool of resolved.tools) {
        const options = tool.inputSchema ? inputOptions(tool.inputSchema) : undefined;
        const output = outputSchema(tool.outputSchema);
        commands.set(tool.name, {
            description: tool.description,
            ...(tool.annotations ? { mcp: { annotations: tool.annotations } } : undefined),
            ...(options ? { options } : undefined),
            ...(output ? { output } : undefined),
            async run(context) {
                const parameters = { name: tool.name, arguments: { ...context.args, ...context.options } };
                const result = await request(resolved.session, 'tools/call', resolved.discovery === 'progressive'
                    ? {
                        name: tool.annotations?.readOnlyHint === true ? 'call_read_tool' : 'call_write_tool',
                        arguments: parameters,
                    }
                    : parameters);
                if (result.isError)
                    return context.error({ code: 'MCP_TOOL_ERROR', message: resultText(result) });
                return resultValue(result);
            },
        });
    }
    return commands;
}
function isProgressiveCatalog(tools) {
    if (tools.length !== 4)
        return false;
    const names = new Set(tools.map((tool) => tool.name));
    return (names.has('search_tools') &&
        names.has('get_tool_details') &&
        names.has('call_read_tool') &&
        names.has('call_write_tool'));
}
async function discoverTools(session) {
    const tools = [];
    let offset = 0;
    while (offset !== undefined) {
        const search = (await callRemoteTool(session, 'search_tools', {
            query: '',
            limit: 20,
            offset,
        }));
        for (const match of search.tools ?? []) {
            if (!match.name)
                continue;
            const tool = (await callRemoteTool(session, 'get_tool_details', {
                name: match.name,
            }));
            if (tool.name)
                tools.push(tool);
        }
        if (search.nextOffset !== undefined && search.nextOffset <= offset)
            throw new Error('MCP tool catalog returned a non-advancing offset');
        offset = search.nextOffset;
    }
    return tools;
}
async function callRemoteTool(session, name, arguments_) {
    const result = await request(session, 'tools/call', { name, arguments: arguments_ });
    if (result.isError)
        throw new Error(resultText(result) || `MCP tool failed: ${name}`);
    return resultValue(result);
}
function sourceSession(source) {
    if (typeof source === 'string' || source instanceof URL)
        return { url: new URL(source), fetch: globalThis.fetch.bind(globalThis) };
    return {
        url: new URL(source.url),
        fetch: source.fetch ?? globalThis.fetch.bind(globalThis),
        ...(source.headers ? { headers: source.headers } : undefined),
    };
}
async function request(session, method, params) {
    const notification = method.startsWith('notifications/');
    const id = notification ? undefined : crypto.randomUUID();
    const headers = new Headers(session.headers);
    headers.set('content-type', 'application/json');
    headers.set('accept', 'application/json, text/event-stream');
    if (session.id)
        headers.set('mcp-session-id', session.id);
    if (session.initialized)
        headers.set('MCP-Protocol-Version', protocolVersion);
    const body = JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : undefined), method, params });
    const response = await session.fetch(new Request(session.url, { method: 'POST', headers, body }));
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId)
        session.id = sessionId;
    if (!response.ok)
        throw new Error(`MCP HTTP ${response.status}`);
    if (notification && response.status === 202)
        return {};
    const text = await response.text();
    if (!text)
        return {};
    const contentType = response.headers.get('content-type') ?? '';
    const message = contentType.includes('text/event-stream')
        ? parseSse(text, id)
        : JSON.parse(text);
    if (message.error)
        throw new Error(message.error.message ?? 'MCP request failed');
    return message.result ?? {};
}
function parseSse(text, id) {
    for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
        if (!data)
            continue;
        const message = JSON.parse(data);
        if (id === undefined || message.id === id)
            return message;
    }
    throw new Error('MCP SSE response did not include the matching JSON-RPC message');
}
function inputOptions(schema) {
    const properties = (schema.properties ?? {});
    const required = new Set(schema.required ?? []);
    const shape = {};
    for (const [key, property] of Object.entries(properties)) {
        let zodType = Openapi.toZod(property);
        if (!required.has(key))
            zodType = zodType.optional();
        if (typeof property.description === 'string')
            zodType = zodType.describe(property.description);
        shape[key] = Openapi.coerceIfNeeded(zodType);
    }
    return Object.keys(shape).length > 0 ? z.object(shape) : undefined;
}
function outputSchema(schema) {
    if (!schema || schema.type !== 'object')
        return undefined;
    try {
        return z.fromJSONSchema(schema);
    }
    catch {
        return undefined;
    }
}
function resultText(result) {
    const content = Array.isArray(result.content) ? result.content : [];
    return content
        .map((item) => (item.type === 'text' ? item.text : ''))
        .filter(Boolean)
        .join('\n');
}
function resultValue(result) {
    if (result.structuredContent !== undefined)
        return result.structuredContent;
    const content = Array.isArray(result.content) ? result.content : [];
    const textItems = content
        .filter((item) => item.type === 'text')
        .map((item) => item.text);
    if (textItems.length === 1) {
        try {
            return JSON.parse(textItems[0]);
        }
        catch {
            return textItems[0];
        }
    }
    return textItems;
}
//# sourceMappingURL=McpSource.js.map