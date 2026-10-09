import { z } from "zod";
import { analysisSearchInput } from "../contracts/analysisSearchContract.js";
import { AnalysisInputError, AnalysisProtocolError, } from "../domain/analysisErrorCore.js";
import { functionDossierSchema, functionInstructionWindowSchema, } from "../domain/hopperValues.js";
import { IDA_LIMITATIONS } from "./IdaProviderCapabilities.js";
import { disassemblySchema, idaAddressSchema, idaFunctionSchema, legacyCalleesSchema, legacyPageSchema, legacyStringSchema, legacyXrefsSchema, modernCalleesSchema, modernDecompileSchema, modernDisassemblySchema, modernLookupSchema, modernPageSchema, modernStringsSchema, modernXrefsSchema, nextOffset, } from "./IdaProtocolValues.js";
const unknownBody = {
    available: false,
    reason: "IDA MCP does not report complete function body ranges.",
};
const identity = (fn) => ({
    address: fn.address,
    name: fn.name,
    classification: null,
    body: unknownBody,
});
const lines = (asm) => asm.lines.map(({ address, instruction }) => `${address}: ${instruction}`);
/** Translate explicit analyst questions into a closed set of read-only upstream requests. */
export class IdaOperationRunner {
    connection;
    protocol;
    database;
    raw = [];
    locations = [];
    limitations = [];
    constructor(connection, protocol, database) {
        this.connection = connection;
        this.protocol = protocol;
        this.database = database;
    }
    async call(tool, args) {
        const scoped = this.database === undefined ? args : { ...args, database: this.database };
        const result = await this.connection.call(tool, scoped);
        this.raw.push({ tool, arguments: scoped, result });
        return result;
    }
    async functions() {
        const result = [];
        let offset = 0;
        while (offset !== null) {
            const current = offset;
            const value = this.protocol === "legacy"
                ? legacyPageSchema.parse(await this.call("list_functions", { offset, count: 100 }))
                : modernPageSchema.parse(await this.call("list_funcs", {
                    queries: { offset, count: 100 },
                }))[0];
            if (value === undefined)
                throw new AnalysisProtocolError("IDA MCP omitted its function page.");
            result.push(...value.data.map((fn) => idaFunctionSchema.parse(fn)));
            offset = value.next_offset;
            if (offset !== null && offset <= current)
                throw new AnalysisProtocolError("IDA MCP function pagination did not advance.");
        }
        return result;
    }
    async resolve(query) {
        if (this.protocol === "modern") {
            const item = modernLookupSchema.parse(await this.call("lookup_funcs", { queries: [query] }))[0];
            if (item?.fn == null || item.error !== null)
                throw new AnalysisProtocolError(`IDA function lookup failed for ${query}: ${item?.error ?? "missing function"}`);
            return item.fn;
        }
        const address = idaAddressSchema.safeParse(/^0x/iu.test(query) ? query : undefined);
        const found = idaFunctionSchema.parse(await this.call(address.success ? "get_function_by_address" : "get_function_by_name", address.success ? { address: address.data } : { name: query }));
        // Legacy producers may echo an interior query or call site in address.
        // Resolve the reported symbol again to obtain its actual entry, never infer from size.
        const entry = idaFunctionSchema.parse(await this.call("get_function_by_name", { name: found.name }));
        if (entry.name !== found.name)
            throw new AnalysisProtocolError("IDA function identity changed during lookup.");
        return entry;
    }
    async strings() {
        const result = [];
        let offset = 0;
        while (offset !== null) {
            const current = offset;
            if (this.protocol === "legacy") {
                const page = legacyPageSchema.parse(await this.call("list_strings", { offset, count: 100 }));
                result.push(...page.data.map((item) => {
                    const s = legacyStringSchema.parse(item);
                    return { address: s.address, value: s.string };
                }));
                offset = page.next_offset;
            }
            else {
                const page = modernStringsSchema.parse(await this.call("find_regex", {
                    pattern: "(?s).*",
                    offset,
                    limit: 100,
                }));
                result.push(...page.matches.map((s) => ({ address: s.addr, value: s.string })));
                offset = nextOffset(page.cursor, current);
            }
            if (offset !== null && offset <= current)
                throw new AnalysisProtocolError("IDA MCP string pagination did not advance.");
        }
        return result;
    }
    async assembly(fn) {
        if (this.protocol === "legacy") {
            const result = disassemblySchema.parse(await this.call("disassemble_function", { start_address: fn.address }));
            this.verifyAssembly(fn, result);
            return result;
        }
        let result;
        let offset = 0;
        while (offset !== null) {
            const page = modernDisassemblySchema.parse(await this.call("disasm", {
                addr: fn.address,
                offset,
                max_instructions: 100,
            }));
            if (page.asm === null || page.error !== undefined)
                throw new AnalysisProtocolError(`IDA disassembly failed: ${page.error ?? "missing assembly"}`);
            this.verifyAssembly(fn, page.asm);
            if (result === undefined)
                result = page.asm;
            else
                result.lines.push(...page.asm.lines);
            offset = nextOffset(page.cursor, offset);
        }
        if (result === undefined)
            throw new AnalysisProtocolError("IDA omitted assembly.");
        return result;
    }
    verifyAssembly(fn, asm) {
        if (asm.start_ea !== fn.address || asm.name !== fn.name)
            throw new AnalysisProtocolError("IDA disassembly identifies a different function than the resolved entry.");
    }
    async pseudocode(fn) {
        if (this.protocol === "legacy")
            return z
                .string()
                .nullable()
                .parse(await this.call("decompile_function", { address: fn.address }));
        const result = [];
        let offset = 0;
        while (offset !== null) {
            const page = modernDecompileSchema.parse(await this.call("decompile", {
                addr: fn.address,
                offset,
                max_lines: 100,
            }));
            if (page.code === null)
                throw new AnalysisProtocolError(`IDA decompilation failed: ${page.error ?? "missing code"}`);
            result.push(page.code);
            offset = nextOffset(page.cursor, offset);
        }
        return result.join("\n");
    }
    async xrefs(address) {
        if (this.protocol === "legacy")
            return legacyXrefsSchema.parse(await this.call("get_xrefs_to", { address }));
        const page = modernXrefsSchema.parse(await this.call("xrefs_to", { addrs: [address], limit: 1000 }))[0];
        if (page?.xrefs == null)
            throw new AnalysisProtocolError(`IDA xrefs failed: ${page?.error ?? "missing references"}`);
        if (page.more === true)
            this.limitations.push("Upstream xrefs_to capped results at 1000 references; additional references remain unknown.");
        return page.xrefs.map((xref) => ({
            address: xref.addr,
            type: xref.type,
            function: xref.fn,
        }));
    }
    async relationships(fn, direction) {
        const queries = [];
        const result = new Map();
        if (this.protocol === "legacy") {
            const value = await this.call(direction === "callers" ? "get_callers" : "get_callees", { function_address: fn.address });
            const items = direction === "callers"
                ? z.array(idaFunctionSchema).parse(value)
                : legacyCalleesSchema.parse(value);
            for (const item of items) {
                if ("type" in item && item.type === "external")
                    result.set(item.address, identity({ ...item, size: "unknown" }));
                else
                    queries.push(item.name);
            }
        }
        else if (direction === "callers") {
            this.limitations.push("Modern upstream xrefs classify references as code or data, without proving call edges. Direct callers are unavailable in this profile.");
            return [];
        }
        else {
            const page = modernCalleesSchema.parse(await this.call("callees", { addrs: [fn.address], limit: 500 }))[0];
            if (page?.callees == null)
                throw new AnalysisProtocolError(`IDA callees failed: ${page?.error ?? "missing callees"}`);
            if (page.more === true)
                this.limitations.push("Upstream callees capped results at 500; additional callees remain unknown.");
            for (const item of page.callees) {
                if ("type" in item && item.type === "external")
                    result.set(item.addr, identity({ address: item.addr, name: item.name, size: "unknown" }));
                else
                    queries.push(item.addr);
            }
        }
        for (const query of new Set(queries)) {
            const resolved = identity(await this.resolve(query));
            result.set(resolved.address, resolved);
        }
        return [...result.values()];
    }
    async run(operation, parameters) {
        if (operation === "list_procedures" || operation === "search_procedures") {
            const items = (await this.functions()).map((fn) => ({
                address: fn.address,
                value: fn.name,
            }));
            return operation === "list_procedures"
                ? items
                : this.search(items, parameters);
        }
        if (operation === "list_strings" || operation === "search_strings") {
            const items = await this.strings();
            return operation === "search_strings"
                ? this.search(items, parameters)
                : parameters.address === undefined
                    ? items
                    : items.filter(({ address }) => address === idaAddressSchema.parse(parameters.address));
        }
        if (operation === "xrefs") {
            const inspectedAddress = idaAddressSchema.parse(parameters.address);
            this.locations.push({ kind: "address", address: inspectedAddress });
            return (await this.xrefs(inspectedAddress)).map(({ address }) => address);
        }
        const fn = await this.resolve(z.string().min(1).parse(parameters.procedure));
        this.locations.push({ kind: "address", address: fn.address });
        switch (operation) {
            case "procedure_address":
                return fn.address;
            case "procedure_pseudo_code":
                return this.pseudocode(fn);
            case "procedure_assembly":
                return lines(await this.assembly(fn)).join("\n");
            case "procedure_callers":
                if (this.protocol === "modern")
                    throw new AnalysisProtocolError("This IDA MCP profile cannot distinguish direct callers from other code references.");
                return (await this.relationships(fn, "callers")).map(({ address }) => address);
            case "procedure_callees":
                return (await this.relationships(fn, "callees")).map(({ address }) => address);
            case "read_function_instructions":
                return functionInstructionWindowSchema.parse({
                    procedure: identity(fn),
                    instructions: lines(await this.assembly(fn)),
                    limitations: IDA_LIMITATIONS,
                });
            case "analyze_function":
                return this.dossier(fn);
        }
    }
    search(items, input) {
        const query = z.object(analysisSearchInput).parse(input);
        let matches;
        if (query.mode === "regex") {
            try {
                const regex = new RegExp(query.pattern, query.case_sensitive ? "u" : "iu");
                matches = (value) => regex.test(value);
            }
            catch (cause) {
                throw new AnalysisInputError("search", { cause });
            }
        }
        else {
            const needle = query.case_sensitive
                ? query.pattern
                : query.pattern.toLowerCase();
            matches = (value) => (query.case_sensitive ? value : value.toLowerCase()).includes(needle);
        }
        return items.filter(({ value }) => matches(value));
    }
    async dossier(fn) {
        const asm = await this.assembly(fn);
        const pseudocode = await this.pseudocode(fn);
        const callers = await this.relationships(fn, "callers");
        const callees = await this.relationships(fn, "callees");
        const signature = asm.return_type == null || asm.arguments == null
            ? null
            : `${asm.return_type} ${fn.name}(${asm.arguments.map((arg) => `${arg.type} ${arg.name}`).join(", ")})`;
        return functionDossierSchema.parse({
            procedure: { ...identity(fn), signature, locals: [] },
            pseudocode: pseudocode ?? "",
            assembly: lines(asm),
            comments: [],
            callers,
            callees,
            incoming_references: [],
            outgoing_references: [],
            referenced_strings: [],
            referenced_names: [],
            basic_blocks: [],
            limitations: [
                ...IDA_LIMITATIONS,
                ...this.limitations,
                "Stack frame records are not evidence of source locals. Rendered comments do not identify regular versus inline origin.",
                ...(pseudocode === null ? ["Pseudocode is unavailable."] : []),
            ],
        });
    }
}
