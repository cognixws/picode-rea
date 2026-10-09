import { ParseError, ValidationError } from './Errors.js';
import { isRecord, toKebab } from './internal/helpers.js';
/** Parses raw argv tokens against Zod schemas for args and options. */
export function parse(argv, options = {}) {
    const { args: argsSchema, options: optionsSchema, alias, defaults } = options;
    const optionNames = createOptionNames(optionsSchema, alias);
    // First pass: split argv into positional tokens and raw option values
    const positionals = [];
    const rawArgvOptions = {};
    let i = 0;
    while (i < argv.length) {
        const token = argv[i];
        if (token.startsWith('--no-') && token.length > 5) {
            // --no-flag negation
            const name = normalizeOptionName(token.slice(5), optionNames);
            if (!name)
                throw new ParseError({ message: `Unknown flag: ${token}` });
            rawArgvOptions[name] = false;
            i++;
        }
        else if (token.startsWith('--')) {
            const eqIdx = token.indexOf('=');
            if (eqIdx !== -1) {
                // --flag=value
                const raw = token.slice(2, eqIdx);
                const name = normalizeOptionName(raw, optionNames);
                if (!name)
                    throw new ParseError({ message: `Unknown flag: --${raw}` });
                setOption(rawArgvOptions, name, token.slice(eqIdx + 1), optionsSchema);
                i++;
            }
            else {
                // --flag [value]
                const name = normalizeOptionName(token.slice(2), optionNames);
                if (!name)
                    throw new ParseError({ message: `Unknown flag: ${token}` });
                if (isCountOption(name, optionsSchema)) {
                    rawArgvOptions[name] = (rawArgvOptions[name] ?? 0) + 1;
                    i++;
                }
                else if (isBooleanOption(name, optionsSchema)) {
                    rawArgvOptions[name] = true;
                    i++;
                }
                else {
                    const value = argv[i + 1];
                    if (value === undefined)
                        throw new ParseError({ message: `Missing value for flag: ${token}` });
                    setOption(rawArgvOptions, name, value, optionsSchema);
                    i += 2;
                }
            }
        }
        else if (token.startsWith('-') && !token.startsWith('--') && token.length >= 2) {
            // -f or -abc (stacked short aliases)
            const chars = token.slice(1);
            for (let j = 0; j < chars.length; j++) {
                const short = chars[j];
                const name = optionNames.aliasToName.get(short);
                if (!name)
                    throw new ParseError({ message: `Unknown flag: -${short}` });
                const isLast = j === chars.length - 1;
                if (!isLast) {
                    if (isCountOption(name, optionsSchema)) {
                        rawArgvOptions[name] = (rawArgvOptions[name] ?? 0) + 1;
                    }
                    else if (isBooleanOption(name, optionsSchema)) {
                        rawArgvOptions[name] = true;
                    }
                    else {
                        throw new ParseError({
                            message: `Non-boolean flag -${short} must be last in a stacked alias`,
                        });
                    }
                }
                else if (isCountOption(name, optionsSchema)) {
                    rawArgvOptions[name] = (rawArgvOptions[name] ?? 0) + 1;
                }
                else if (isBooleanOption(name, optionsSchema)) {
                    rawArgvOptions[name] = true;
                }
                else {
                    const value = argv[i + 1];
                    if (value === undefined)
                        throw new ParseError({ message: `Missing value for flag: -${short}` });
                    setOption(rawArgvOptions, name, value, optionsSchema);
                    i++;
                }
            }
            i++;
        }
        else {
            positionals.push(token);
            i++;
        }
    }
    // Assign positionals to args schema keys in order; a final array key collects the rest
    const rawArgs = {};
    if (argsSchema) {
        const keys = Object.keys(argsSchema.shape);
        for (let j = 0; j < keys.length; j++) {
            const key = keys[j];
            if (isArrayField(key, argsSchema)) {
                if (j !== keys.length - 1)
                    throw new Error(`Variadic arg "${key}" must be the last key in the args schema`);
                const rest = positionals.slice(j);
                if (rest.length > 0)
                    rawArgs[key] = rest;
            }
            else if (positionals[j] !== undefined) {
                rawArgs[key] = positionals[j];
            }
        }
    }
    // Validate args through zod
    const args = argsSchema ? zodParse(argsSchema, rawArgs) : {};
    const rawDefaults = normalizeOptionDefaults(defaults, optionsSchema, optionNames);
    // Coerce raw option values before zod validation
    if (optionsSchema) {
        for (const [name, value] of Object.entries(rawArgvOptions)) {
            rawArgvOptions[name] = coerce(value, name, optionsSchema);
        }
    }
    const mergedOptions = { ...rawDefaults, ...rawArgvOptions };
    // Validate options through zod
    const parsedOptions = optionsSchema ? zodParse(optionsSchema, mergedOptions) : {};
    return { args, options: parsedOptions };
}
/** Builds lookup tables for option names and short aliases. */
function createOptionNames(schema, alias) {
    const aliasToName = new Map();
    if (alias)
        for (const [name, short] of Object.entries(alias))
            aliasToName.set(short, name);
    const knownOptions = new Set(schema ? Object.keys(schema.shape) : []);
    const kebabToCamel = new Map();
    for (const name of knownOptions) {
        const kebab = toKebab(name);
        if (kebab !== name)
            kebabToCamel.set(kebab, name);
    }
    return { aliasToName, kebabToCamel, knownOptions };
}
/** Normalizes a long option name, accepting kebab-case aliases for camelCase schema keys. */
function normalizeOptionName(raw, options) {
    const name = options.kebabToCamel.get(raw) ?? raw;
    return options.knownOptions.has(name) ? name : undefined;
}
/** Normalizes config-backed defaults and validates config structure/key names. */
function normalizeOptionDefaults(defaults, schema, optionNames) {
    if (defaults === undefined)
        return {};
    if (!isRecord(defaults))
        throw new ParseError({
            message: 'Invalid config section: expected an object of option defaults',
        });
    if (!schema) {
        const [first] = Object.keys(defaults);
        if (first)
            throw new ParseError({ message: `Unknown config option: ${first}` });
        return {};
    }
    const normalized = {};
    for (const [rawName, value] of Object.entries(defaults)) {
        const name = normalizeOptionName(rawName, optionNames);
        if (!name)
            throw new ParseError({ message: `Unknown config option: ${rawName}` });
        normalized[name] = value;
    }
    return normalized;
}
/** Unwraps ZodDefault/ZodOptional to get the inner type. */
function unwrap(schema) {
    let s = schema;
    while (s.def?.innerType)
        s = s.def.innerType;
    return s;
}
/** Checks if an option's inner type is boolean. */
function isBooleanOption(name, schema) {
    if (!schema)
        return false;
    const field = schema.shape[name];
    if (!field)
        return false;
    return unwrap(field).constructor.name === 'ZodBoolean';
}
/** Checks if an option is a count type (z.count()). */
function isCountOption(name, schema) {
    if (!schema)
        return false;
    const field = schema.shape[name];
    if (!field)
        return false;
    return typeof field.meta === 'function' && field.meta()?.count === true;
}
/** Checks if a field's inner type is an array. */
function isArrayField(name, schema) {
    if (!schema)
        return false;
    const field = schema.shape[name];
    if (!field)
        return false;
    return unwrap(field).constructor.name === 'ZodArray';
}
/** Sets an option value, collecting into arrays for array schemas. */
function setOption(raw, name, value, schema) {
    if (isArrayField(name, schema)) {
        const existing = raw[name];
        if (Array.isArray(existing)) {
            existing.push(value);
        }
        else {
            raw[name] = [value];
        }
    }
    else {
        raw[name] = value;
    }
}
/** Wraps zod schema.parse(), converting ZodError to ValidationError. */
export function zodParse(schema, data) {
    try {
        return schema.parse(data);
    }
    catch (err) {
        const issues = err?.issues ?? err?.error?.issues ?? [];
        const fieldErrors = issues.map((issue) => ({
            code: issue.code,
            missing: !hasPath(data, issue.path ?? []),
            path: (issue.path ?? []).join('.'),
            expected: issue.expected ?? '',
            received: issue.received ?? '',
            message: issue.message ?? '',
        }));
        throw new ValidationError({
            message: issues.map((i) => i.message).join('; ') || 'Validation failed',
            fieldErrors,
            cause: err instanceof Error ? err : undefined,
        });
    }
}
/** Checks whether the raw input contains the full issue path. */
function hasPath(data, path) {
    if (path.length === 0)
        return true;
    let current = data;
    for (const part of path) {
        if (!isRecord(current) && !Array.isArray(current))
            return false;
        if (!(part in current))
            return false;
        current = current[part];
    }
    return true;
}
/** Parses environment variables against a Zod schema. Falls back to `process.env` → `Deno.env` when no source is provided. */
export function parseEnv(schema, source = defaultEnvSource()) {
    const raw = {};
    for (const [key, field] of Object.entries(schema.shape)) {
        const value = source[key];
        if (value !== undefined)
            raw[key] = coerceEnv(value, field);
    }
    return zodParse(schema, raw);
}
/** Coerces an env var string to the type expected by the schema field. */
function coerceEnv(value, field) {
    const inner = unwrap(field);
    const typeName = inner.constructor.name;
    if (typeName === 'ZodNumber')
        return Number(value);
    if (typeName === 'ZodBoolean')
        return value === 'true' || value === '1';
    return value;
}
/** Coerces a raw string value to the type expected by the schema. */
function coerce(value, name, schema) {
    const field = schema.shape[name];
    if (!field)
        return value;
    const inner = unwrap(field);
    const typeName = inner.constructor.name;
    if (typeName === 'ZodNumber' && typeof value === 'string') {
        return Number(value);
    }
    if (typeName === 'ZodBoolean' && typeof value === 'string') {
        return value === 'true';
    }
    return value;
}
/** Parses known global options from argv, passing unknown flags and positionals through to `rest`. */
export function parseGlobals(argv, schema, alias, options = {}) {
    const optionNames = createOptionNames(schema, alias);
    const rest = [];
    const rawOptions = {};
    let i = 0;
    while (i < argv.length) {
        const token = argv[i];
        if (token === '--') {
            for (let j = i; j < argv.length; j++)
                rest.push(argv[j]);
            break;
        }
        if (token.startsWith('--no-') && token.length > 5) {
            const name = normalizeOptionName(token.slice(5), optionNames);
            if (!name) {
                rest.push(token);
            }
            else {
                rawOptions[name] = false;
            }
            i++;
        }
        else if (token.startsWith('--')) {
            const eqIdx = token.indexOf('=');
            if (eqIdx !== -1) {
                // --flag=value
                const raw = token.slice(2, eqIdx);
                const name = normalizeOptionName(raw, optionNames);
                if (!name) {
                    rest.push(token);
                }
                else {
                    setOption(rawOptions, name, token.slice(eqIdx + 1), schema);
                }
                i++;
            }
            else {
                // --flag [value]
                const name = normalizeOptionName(token.slice(2), optionNames);
                if (!name) {
                    // Unknown flag — pass through as-is
                    rest.push(token);
                    i++;
                }
                else if (isCountOption(name, schema)) {
                    rawOptions[name] = (rawOptions[name] ?? 0) + 1;
                    i++;
                }
                else if (isBooleanOption(name, schema)) {
                    rawOptions[name] = true;
                    i++;
                }
                else {
                    const value = argv[i + 1];
                    if (value === undefined)
                        throw new ParseError({ message: `Missing value for flag: ${token}` });
                    setOption(rawOptions, name, value, schema);
                    i += 2;
                }
            }
        }
        else if (token.startsWith('-') && !token.startsWith('--') && token.length >= 2) {
            // Short flag(s)
            const chars = token.slice(1);
            let allKnown = true;
            for (let j = 0; j < chars.length; j++) {
                if (!optionNames.aliasToName.has(chars[j])) {
                    allKnown = false;
                    break;
                }
            }
            if (!allKnown) {
                // Unknown short flag — pass through as-is
                rest.push(token);
                i++;
            }
            else {
                for (let j = 0; j < chars.length; j++) {
                    const short = chars[j];
                    const name = optionNames.aliasToName.get(short);
                    const isLast = j === chars.length - 1;
                    if (!isLast) {
                        if (isCountOption(name, schema)) {
                            rawOptions[name] = (rawOptions[name] ?? 0) + 1;
                        }
                        else if (isBooleanOption(name, schema)) {
                            rawOptions[name] = true;
                        }
                        else {
                            throw new ParseError({
                                message: `Non-boolean flag -${short} must be last in a stacked alias`,
                            });
                        }
                    }
                    else if (isCountOption(name, schema)) {
                        rawOptions[name] = (rawOptions[name] ?? 0) + 1;
                    }
                    else if (isBooleanOption(name, schema)) {
                        rawOptions[name] = true;
                    }
                    else {
                        const value = argv[i + 1];
                        if (value === undefined)
                            throw new ParseError({ message: `Missing value for flag: -${short}` });
                        setOption(rawOptions, name, value, schema);
                        i++;
                    }
                }
                i++;
            }
        }
        else {
            // Positional — pass through
            rest.push(token);
            i++;
        }
    }
    if (options.validate === false)
        return { parsed: rawOptions, rest };
    // Coerce raw option values before zod validation
    for (const [name, value] of Object.entries(rawOptions))
        rawOptions[name] = coerce(value, name, schema);
    const parsed = zodParse(schema, rawOptions);
    return { parsed, rest };
}
/** Returns the best available env source for the current runtime. */
export function defaultEnvSource() {
    if (typeof globalThis !== 'undefined') {
        const g = globalThis;
        if (g.process?.env)
            return g.process.env;
        if (g.Deno?.env)
            return new Proxy({}, { get: (_, key) => g.Deno.env.get(key) });
    }
    return {};
}
//# sourceMappingURL=Parser.js.map