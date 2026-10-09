import { createHash } from 'node:crypto';
import * as Yaml from './internal/yaml.js';
import * as Schema from './Schema.js';
/** Generates a compact Markdown command index for `--llms`. */
export function index(name, commands, description) {
    const lines = [`# ${name}`];
    if (description)
        lines.push('', description);
    lines.push('');
    lines.push('| Command | Description |');
    lines.push('|---------|-------------|');
    for (const cmd of commands) {
        const signature = buildSignature(name, cmd);
        const desc = cmd.description ?? '';
        lines.push(`| \`${signature}\` | ${desc} |`);
    }
    lines.push('', `Run \`${name} --llms-full\` for full manifest. Run \`${name} <command> --schema\` for argument details.`);
    return lines.join('\n');
}
/** @internal Builds a command signature with arg placeholders. */
function buildSignature(cli, cmd) {
    const base = !cmd.name ? cli : `${cli} ${cmd.name}`;
    if (!cmd.args)
        return base;
    const shape = cmd.args.shape;
    const json = Schema.toJsonSchema(cmd.args);
    const required = new Set(json.required ?? []);
    const properties = json.properties;
    const argNames = Object.keys(shape).map((k) => {
        const label = properties?.[k]?.type === 'array' ? `${k}...` : k;
        return required.has(k) ? `<${label}>` : `[${label}]`;
    });
    return `${base} ${argNames.join(' ')}`;
}
/** Generates a Markdown skill file from a CLI name and collected command data. */
export function generate(name, commands, groups = new Map()) {
    const hasGroups = groups.size > 0;
    if (!hasGroups)
        return commands.map((cmd) => renderCommandBody(name, cmd)).join('\n\n');
    const sections = [`# ${name}`];
    let lastGroup;
    for (const cmd of commands) {
        const segment = !cmd.name ? '' : cmd.name.split(' ')[0];
        if (segment !== lastGroup) {
            lastGroup = segment;
            if (segment) {
                const desc = groups.get(segment);
                const heading = desc ? `## ${name} ${segment}\n\n${desc}` : `## ${name} ${segment}`;
                sections.push(heading);
            }
        }
        sections.push(renderCommandBody(name, cmd, segment ? 3 : 2));
    }
    return sections.join('\n\n');
}
/** Splits commands into skill files grouped by depth. */
export function split(name, commands, depth, groups = new Map()) {
    if (depth === 0)
        return [{ dir: '', content: renderGroup(name, name, commands, groups, name) }];
    const buckets = new Map();
    for (const cmd of commands) {
        if (!cmd.name) {
            const key = slugify(name);
            const bucket = buckets.get(key) ?? [];
            bucket.push(cmd);
            buckets.set(key, bucket);
            continue;
        }
        const segments = cmd.name.split(' ');
        const key = segments.slice(0, depth).join('-');
        const bucket = buckets.get(key) ?? [];
        bucket.push(cmd);
        buckets.set(key, bucket);
    }
    return [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dir, cmds]) => {
        const first = cmds[0];
        const prefix = !first.name ? '' : first.name.split(' ').slice(0, depth).join(' ');
        const title = prefix ? `${name} ${prefix}` : name;
        return { dir, content: renderGroup(name, title, cmds, groups, prefix || undefined) };
    });
}
/** @internal Renders a group-level frontmatter + command bodies. */
function renderGroup(cli, title, cmds, groups, prefix) {
    const groupDesc = prefix ? groups.get(prefix) : undefined;
    const fallbackDesc = cmds.length === 1 && cmds[0].description ? cmds[0].description : undefined;
    const desc = groupDesc ?? fallbackDesc;
    const description = desc
        ? `${desc.replace(/\.$/, '')}. Run \`${title} --help\` for usage details.`
        : `Run \`${title} --help\` for usage details.`;
    const fm = Yaml.loadSync()
        .stringify({ name: slugify(title), description, requires_bin: cli, command: title }, { lineWidth: 0 })
        .trimEnd();
    const fmBlock = `---\n${fm}\n---`;
    const body = cmds.map((cmd) => renderCommandBody(cli, cmd)).join('\n\n---\n\n');
    return `${fmBlock}\n\n${body}`;
}
/** @internal Renders a command's heading and sections without frontmatter. */
function renderCommandBody(cli, cmd, level = 1) {
    const fullName = !cmd.name ? cli : `${cli} ${cmd.name}`;
    const sections = [];
    const h = (n) => '#'.repeat(n);
    let heading = `${h(level)} ${fullName}`;
    if (cmd.description)
        heading += `\n\n${cmd.description}`;
    sections.push(heading);
    const sub = h(level + 1);
    // Arguments table
    if (cmd.args) {
        const shape = cmd.args.shape;
        const json = Schema.toJsonSchema(cmd.args);
        const required = new Set(json.required ?? []);
        const properties = json.properties;
        const rows = Object.entries(shape).map(([key, field]) => {
            const prop = properties?.[key];
            const type = resolveTypeName(prop);
            const req = required.has(key) ? 'yes' : 'no';
            const desc = field.description ?? '';
            return `| \`${key}\` | \`${type}\` | ${req} | ${desc} |`;
        });
        sections.push(`${sub} Arguments\n\n| Name | Type | Required | Description |\n|------|------|----------|-------------|\n${rows.join('\n')}`);
    }
    // Environment Variables table
    if (cmd.env) {
        const shape = cmd.env.shape;
        const json = Schema.toJsonSchema(cmd.env);
        const required = new Set(json.required ?? []);
        const properties = json.properties;
        const rows = Object.entries(shape).map(([key, field]) => {
            const prop = properties?.[key];
            const type = resolveTypeName(prop);
            const def = prop?.default !== undefined ? String(prop.default) : '';
            const req = required.has(key) ? 'yes' : 'no';
            const desc = field.description ?? '';
            return `| \`${key}\` | \`${type}\` | ${req} | ${def ? `\`${def}\`` : ''} | ${desc} |`;
        });
        sections.push(`${sub} Environment Variables\n\n| Name | Type | Required | Default | Description |\n|------|------|----------|---------|-------------|\n${rows.join('\n')}`);
    }
    // Options table
    if (cmd.options) {
        const shape = cmd.options.shape;
        const json = Schema.toJsonSchema(cmd.options);
        const properties = json.properties;
        const rows = Object.entries(shape).map(([key, field]) => {
            const prop = properties?.[key];
            const type = resolveTypeName(prop);
            const def = prop?.default !== undefined ? String(prop.default) : '';
            const rawDesc = field.description ?? '';
            const desc = prop?.deprecated ? `**Deprecated.** ${rawDesc}` : rawDesc;
            return `| \`--${key}\` | \`${type}\` | ${def ? `\`${def}\`` : ''} | ${desc} |`;
        });
        sections.push(`${sub} Options\n\n| Flag | Type | Default | Description |\n|------|------|---------|-------------|\n${rows.join('\n')}`);
    }
    // Output table
    if (cmd.output) {
        const outputSchema = Schema.toJsonSchema(cmd.output);
        const table = schemaToTable(outputSchema);
        if (table)
            sections.push(`${sub} Output\n\n${table}`);
        else {
            const type = resolveTypeName(outputSchema);
            sections.push(`${sub} Output\n\nType: \`${type}\``);
        }
    }
    // Examples
    if (cmd.examples && cmd.examples.length > 0) {
        const lines = cmd.examples.map((ex) => {
            const comment = ex.description ? `# ${ex.description}\n` : '';
            return `${comment}${cli} ${ex.command}`;
        });
        sections.push(`${sub} Examples\n\n\`\`\`sh\n${lines.join('\n\n')}\n\`\`\``);
    }
    // Hint
    if (cmd.hint)
        sections.push(`> ${cmd.hint}`);
    return sections.join('\n\n');
}
/** Computes a deterministic hash of command structure for staleness detection. */
export function hash(commands) {
    const data = commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        hint: cmd.hint,
        args: cmd.args ? Schema.toJsonSchema(cmd.args) : undefined,
        env: cmd.env ? Schema.toJsonSchema(cmd.env) : undefined,
        options: cmd.options ? Schema.toJsonSchema(cmd.options) : undefined,
        output: cmd.output ? Schema.toJsonSchema(cmd.output) : undefined,
    }));
    return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}
/** @internal Renders a JSON Schema object as a Markdown table. Returns `undefined` for non-object schemas. */
function schemaToTable(schema, prefix = '') {
    if (schema.type !== 'object')
        return undefined;
    const properties = schema.properties;
    if (!properties || Object.keys(properties).length === 0)
        return undefined;
    const required = new Set(schema.required ?? []);
    const rows = [];
    for (const [key, prop] of Object.entries(properties)) {
        const name = prefix ? `${prefix}.${key}` : key;
        const type = resolveTypeName(prop);
        const req = required.has(key) ? 'yes' : 'no';
        const desc = prop.description ?? '';
        rows.push(`| \`${name}\` | \`${type}\` | ${req} | ${desc} |`);
        // Expand nested objects inline
        if (prop.type === 'object' && prop.properties) {
            const nested = schemaToTable(prop, name);
            if (nested) {
                const lines = nested.split('\n');
                rows.push(...lines.slice(2)); // skip header + separator
            }
        }
        // Expand array item objects inline
        if (prop.type === 'array' && prop.items) {
            const items = prop.items;
            if (items.type === 'object' && items.properties) {
                const nested = schemaToTable(items, `${name}[]`);
                if (nested) {
                    const lines = nested.split('\n');
                    rows.push(...lines.slice(2));
                }
            }
        }
    }
    return `| Field | Type | Required | Description |\n|-------|------|----------|-------------|\n${rows.join('\n')}`;
}
/** @internal Converts a string to a lowercase slug (e.g. `"my-cli"` → `"my-cli"`, `"My Tool"` → `"my-tool"`). */
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');
}
/** @internal Resolves a simple type name from a JSON Schema property. */
function resolveTypeName(prop) {
    if (!prop)
        return 'unknown';
    const type = prop.type;
    if (type)
        return type === 'integer' ? 'number' : type;
    return 'unknown';
}
//# sourceMappingURL=Skill.js.map