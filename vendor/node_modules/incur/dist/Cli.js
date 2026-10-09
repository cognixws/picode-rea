import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { estimateTokenCount, sliceByTokens } from 'tokenx';
import { z } from 'zod';
import * as Binary from './Binary.js';
import * as Completions from './Completions.js';
import { IncurError, ParseError, ValidationError } from './Errors.js';
import * as Fetch from './Fetch.js';
import * as Filter from './Filter.js';
import * as Formatter from './Formatter.js';
import * as Help from './Help.js';
import { builtinCommands, findBuiltin, findBuiltinSubcommand, shells, } from './internal/command.js';
import * as Command from './internal/command.js';
import { formatCtaBlock } from './internal/cta.js';
import * as FsCommands from './internal/fsCommands.js';
import { isRecord, suggest, toKebab } from './internal/helpers.js';
import * as Json from './internal/json.js';
import { detectRunner } from './internal/pm.js';
import * as Update from './internal/update.js';
import * as Yaml from './internal/yaml.js';
import * as Mcp from './Mcp.js';
import * as McpSource from './McpSource.js';
import * as Openapi from './Openapi.js';
import * as Parser from './Parser.js';
import * as Schema from './Schema.js';
import * as Skill from './Skill.js';
import * as SyncMcp from './SyncMcp.js';
import * as SyncSkills from './SyncSkills.js';
const destructiveCommandHint = 'Confirm with the user before executing this destructive command.';
const fileCommandSymbol = Symbol.for('incur.fileCommand');
/** Defines a command whose route is inferred from its module path by `fs()`. */
export function command(definition) {
    const result = { ...definition };
    Object.defineProperty(result, fileCommandSymbol, { value: true });
    return result;
}
export function create(nameOrDefinition, definition) {
    const name = typeof nameOrDefinition === 'string' ? nameOrDefinition : nameOrDefinition.name;
    const def = typeof nameOrDefinition === 'string' ? (definition ?? {}) : nameOrDefinition;
    const version = def.version ?? Binary.version;
    const rootDef = 'run' in def ? def : undefined;
    const rootFetchSource = 'fetch' in def && def.fetch !== undefined ? def.fetch : undefined;
    const rootFetch = rootFetchSource === undefined ? undefined : resolveFetch(rootFetchSource);
    const rootFetchBaseUrl = rootFetchSource === undefined ? undefined : fetchBaseUrl(rootFetchSource);
    const commands = new Map();
    const middlewares = [];
    const pending = [];
    const mcpHandler = createMcpHttpHandler(def.mcp?.name ?? name, version ?? '0.0.0', {
        instructions: def.mcp?.instructions,
        stateless: def.mcp?.stateless,
        title: def.mcp?.title,
        tools: def.mcp?.tools,
    });
    if (def.openapi && rootFetch) {
        pending.push((async () => {
            const spec = await Openapi.resolve(def.openapi, { baseUrl: rootFetchBaseUrl });
            const generated = await Openapi.generateCommands(spec, rootFetch, {
                config: def.openapiConfig,
            });
            for (const [name, command] of generated)
                commands.set(name, command);
        })());
    }
    const cli = {
        name,
        description: def.description,
        env: def.env,
        vars: def.vars,
        command(nameOrCli, def) {
            if (typeof nameOrCli === 'string') {
                if (isMcpSourceDefinition(def)) {
                    pending.push((async () => {
                        const resolved = await McpSource.resolve(def.mcp);
                        const generated = McpSource.generateCommands(resolved);
                        const entry = {
                            _group: true,
                            description: def.description,
                            commands: generated,
                            ...(def.outputPolicy ? { outputPolicy: def.outputPolicy } : undefined),
                        };
                        assertNoGlobalOptionConflicts(nameOrCli, entry, toGlobals.get(cli));
                        commands.set(nameOrCli, entry);
                    })());
                    return cli;
                }
                if (def && 'fetch' in def && isFetchSource(def.fetch)) {
                    const fetch = resolveFetch(def.fetch);
                    // OpenAPI + fetch → generate typed command group (async, resolved before serve)
                    if (def.openapi) {
                        pending.push((async () => {
                            const spec = await Openapi.resolve(def.openapi, {
                                baseUrl: fetchBaseUrl(def.fetch),
                            });
                            const generated = await Openapi.generateCommands(spec, fetch, {
                                basePath: def.basePath,
                                config: def.openapiConfig,
                            });
                            const entry = {
                                _group: true,
                                description: def.description,
                                commands: generated,
                                ...(def.outputPolicy ? { outputPolicy: def.outputPolicy } : undefined),
                                ...(def.mcp === false ? { mcp: false } : undefined),
                            };
                            assertNoGlobalOptionConflicts(nameOrCli, entry, toGlobals.get(cli));
                            commands.set(nameOrCli, entry);
                        })());
                        return cli;
                    }
                    commands.set(nameOrCli, {
                        _fetch: true,
                        basePath: def.basePath,
                        description: def.description,
                        fetch,
                        ...(def.outputPolicy ? { outputPolicy: def.outputPolicy } : undefined),
                    });
                    return cli;
                }
                assertNoGlobalOptionConflicts(nameOrCli, def, toGlobals.get(cli));
                commands.set(nameOrCli, def);
                if (def.aliases)
                    for (const a of def.aliases)
                        commands.set(a, { _alias: true, target: nameOrCli });
                return cli;
            }
            const mountedRootDef = toRootDefinition.get(nameOrCli);
            const sub = nameOrCli;
            const subCommands = toCommands.get(sub);
            const subOutputPolicy = toOutputPolicy.get(sub);
            const subMiddlewares = toMiddlewares.get(sub);
            const subPending = toPending.get(sub);
            const entry = mountedRootDef && subCommands.size === 0
                ? mountedRootDef
                : {
                    _group: true,
                    description: sub.description,
                    commands: subCommands,
                    ...(mountedRootDef ? { root: mountedRootDef } : undefined),
                    ...(subOutputPolicy ? { outputPolicy: subOutputPolicy } : undefined),
                    ...(subMiddlewares?.length ? { middlewares: subMiddlewares } : undefined),
                };
            if (subPending?.length)
                pending.push(Promise.all(subPending).then(() => {
                    assertNoGlobalOptionConflicts(sub.name, entry, toGlobals.get(cli));
                }));
            else
                assertNoGlobalOptionConflicts(sub.name, entry, toGlobals.get(cli));
            commands.set(sub.name, entry);
            if (mountedRootDef) {
                const rootAliases = toRootAliases.get(nameOrCli);
                if (rootAliases)
                    for (const alias of rootAliases)
                        commands.set(alias, { _alias: true, target: nameOrCli.name });
            }
            return cli;
        },
        async fetch(req) {
            if (pending.length > 0)
                await Promise.all(pending);
            const globalsDesc = toGlobals.get(cli);
            return fetchImpl(name, commands, req, {
                description: def.description,
                envSchema: def.env,
                globals: globalsDesc,
                mcpHandler,
                middlewares,
                name,
                rootCommand: rootDef,
                vars: def.vars,
                version,
            });
        },
        fs(directory) {
            const manifest = FsCommands.consumeManifest();
            pending.push((async () => {
                const routes = manifest
                    ? await FsCommands.loadManifest(manifest)
                    : await loadFsCommandRoutes(await resolveFsCommandsRoot(directory));
                for (const route of routes) {
                    if (!isFileCommand(route.command))
                        throw new Error(`Expected the default export from '${route.file}' to be created with \`Cli.command()\`.`);
                    mountFsCommand(commands, route.segments, route.command, route.file, toGlobals.get(cli));
                }
            })());
            return cli;
        },
        async serve(argv = process.argv.slice(2), serveOptions = {}) {
            if (await Binary.handleArgv(argv))
                return;
            if (pending.length > 0)
                await Promise.all(pending);
            const globalsDesc = toGlobals.get(cli);
            return serveImpl(name, commands, argv, {
                ...serveOptions,
                aliases: def.aliases,
                banner: def.banner,
                config: def.config,
                description: def.description,
                envSchema: def.env,
                format: def.format,
                globals: globalsDesc,
                mcp: def.mcp,
                middlewares,
                outputPolicy: def.outputPolicy,
                package: def.package,
                rootCommand: rootDef,
                rootFetch,
                sync: def.sync,
                update: def.update,
                vars: def.vars,
                version,
            });
        },
        use(handler) {
            middlewares.push(handler);
            return cli;
        },
    };
    if (rootDef)
        toRootDefinition.set(cli, rootDef);
    if (rootDef && def.aliases)
        toRootAliases.set(cli, def.aliases);
    if (def.options)
        toRootOptions.set(cli, def.options);
    if (def.config !== undefined)
        toConfigEnabled.set(cli, true);
    if (def.outputPolicy)
        toOutputPolicy.set(cli, def.outputPolicy);
    if (def.globals) {
        toGlobals.set(cli, { schema: def.globals, alias: def.globalAlias });
        const builtinNames = [
            'verbose',
            'format',
            'json',
            'llms',
            'llmsFull',
            'mcp',
            'help',
            'incurBinaryApply',
            'incurUpdateCheck',
            'update',
            'version',
            'schema',
            'filterOutput',
            'tokenLimit',
            'tokenOffset',
            'tokenCount',
            ...(def.config?.flag
                ? [def.config.flag, `no${def.config.flag[0].toUpperCase()}${def.config.flag.slice(1)}`]
                : []),
        ];
        const globalKeys = Object.keys(def.globals.shape);
        for (const key of globalKeys) {
            if (builtinNames.includes(key))
                throw new Error(`Global option '${key}' conflicts with a built-in flag. Choose a different name.`);
        }
        // Check globalAlias values against reserved short aliases
        const reservedShorts = new Set(['h']);
        if (def.globalAlias) {
            for (const [name, short] of Object.entries(def.globalAlias)) {
                if (reservedShorts.has(short))
                    throw new Error(`Global alias '-${short}' for '${name}' conflicts with a built-in short flag. Choose a different alias.`);
            }
        }
    }
    toMiddlewares.set(cli, middlewares);
    toCommands.set(cli, commands);
    toPending.set(cli, pending);
    return cli;
}
/** @internal Shared serve implementation for both router and leaf CLIs. */
// biome-ignore lint/correctness/noUnusedVariables: _
async function serveImpl(name, commands, argv, options = {}) {
    const stdout = options.stdout ?? ((s) => process.stdout.write(s));
    const exit = options.exit ?? ((code) => process.exit(code));
    const tty = process.stdout.isTTY === true;
    let human = tty;
    const configEnabled = options.config !== undefined;
    const configFlag = options.config?.flag;
    const displayName = resolveDisplayName(name, options.aliases);
    const skillsEnabled = options.sync !== false;
    const sync = options.sync === false ? undefined : options.sync;
    const builtins = skillsEnabled
        ? builtinCommands
        : builtinCommands.filter((command) => command.name !== 'skills');
    function writeln(s) {
        stdout(s.endsWith('\n') ? s : `${s}\n`);
    }
    async function writeBanner() {
        if (!options.banner || help)
            return;
        const banner = typeof options.banner === 'function'
            ? { render: options.banner, mode: 'all' }
            : options.banner;
        const mode = banner.mode ?? 'all';
        if (mode !== 'all' && mode !== (human ? 'human' : 'agent'))
            return;
        try {
            const text = await banner.render();
            if (text)
                writeln(text);
        }
        catch { }
    }
    let builtinFlags;
    try {
        builtinFlags = extractBuiltinFlags(argv, { configFlag });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (human)
            writeln(formatHumanError({ code: 'UNKNOWN', message }));
        else
            writeln(Formatter.format({ code: 'UNKNOWN', message }, 'toon'));
        exit(1);
        return;
    }
    const { fullOutput, format: formatFlag, formatExplicit, filterOutput, tokenLimit, tokenOffset, tokenCount, llms, llmsFull, mcp: mcpFlag, help, update, updateCheck, version, schema, configPath, configDisabled, rest, } = builtinFlags;
    human = tty && !formatExplicit;
    const updateOptions = {
        ...(typeof options.update === 'object' ? options.update : undefined),
        binary: Binary.target !== undefined,
        version: options.version,
    };
    let globals = {};
    let filtered = rest;
    function parseGlobalOptions(validate) {
        if (!options.globals)
            return true;
        try {
            const result = Parser.parseGlobals(rest, options.globals.schema, options.globals.alias, {
                validate,
            });
            if (validate)
                globals = result.parsed;
            filtered = result.rest;
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (human)
                writeln(formatHumanError({ code: 'UNKNOWN', message }));
            else
                writeln(Formatter.format({ code: 'UNKNOWN', message }, 'toon'));
            exit(1);
            return false;
        }
    }
    if (!parseGlobalOptions(false))
        return;
    // Pre-load yaml for the sync formatting paths below (yaml is loaded lazily -- see internal/yaml.ts).
    if (formatFlag === 'yaml')
        await Yaml.load();
    if (updateCheck) {
        if (options.update !== false)
            try {
                await Update.refresh(name, updateOptions);
            }
            catch { }
        return;
    }
    // --help takes precedence over --update.
    if (update && !help) {
        try {
            const result = await Update.install(name, updateOptions);
            if (human) {
                const lines = [
                    result.deferred ? `✓ Update staged for ${result.name}` : `✓ Updated ${result.name}`,
                ];
                if (result.command)
                    lines.push(`  ${result.command}`);
                if (result.deferred)
                    lines.push('  Installation will finish after this process exits.');
                writeln(lines.join('\n'));
            }
            else
                writeln(Formatter.format(result, formatFlag));
        }
        catch (error) {
            const output = {
                code: 'UPDATE_FAILED',
                message: error instanceof Error ? error.message : String(error),
            };
            if (human)
                writeln(formatHumanError(output));
            else
                writeln(Formatter.format(output, formatFlag));
            exit(1);
        }
        return;
    }
    // --mcp: start as MCP stdio server
    if (mcpFlag) {
        await Mcp.serve(options.mcp?.name ?? name, options.version ?? '0.0.0', commands, {
            middlewares: options.middlewares,
            env: options.envSchema,
            vars: options.vars,
            version: options.version,
            ...(options.mcp?.instructions ? { instructions: options.mcp.instructions } : undefined),
            ...(options.mcp?.title ? { title: options.mcp.title } : undefined),
            ...(options.mcp?.tools ? { tools: options.mcp.tools } : undefined),
        });
        return;
    }
    // COMPLETE: dynamic shell completions (called by shell hook at tab-press)
    const completeShell = process.env.COMPLETE;
    if (completeShell) {
        // Remove separator `--` from argv
        const sepIdx = argv.indexOf('--');
        const words = sepIdx !== -1 ? argv.slice(sepIdx + 1) : argv;
        if (words.length === 0) {
            // Registration mode: print shell hook script for primary name + aliases
            const names = [name, ...(options.aliases ?? [])];
            stdout(names.map((n) => Completions.register(completeShell, n)).join('\n'));
        }
        else {
            const index = Number(process.env._COMPLETE_INDEX ?? words.length - 1);
            const candidates = Completions.complete(commands, options.rootCommand, words, index, options.globals
                ? { schema: options.globals.schema, alias: options.globals.alias }
                : undefined);
            // Add built-in commands (completions, mcp, skills) to completions
            const current = words[index] ?? '';
            const nonFlags = words.slice(0, index).filter((w) => !w.startsWith('-'));
            if (nonFlags.length <= 1) {
                for (const b of builtins) {
                    if (b.name.startsWith(current) && !candidates.some((c) => c.value === b.name))
                        candidates.push({
                            value: b.name,
                            description: b.description,
                            ...(b.subcommands ? { noSpace: true } : undefined),
                        });
                }
            }
            else if (nonFlags.length === 2) {
                const parent = nonFlags[nonFlags.length - 1];
                const builtin = findBuiltin(parent);
                if (builtin?.subcommands && builtins.includes(builtin))
                    for (const sub of builtin.subcommands)
                        for (const value of [sub.name, ...(sub.aliases ?? [])])
                            if (value.startsWith(current) && !candidates.some((c) => c.value === value))
                                candidates.push({ value, description: sub.description });
            }
            const out = Completions.format(completeShell, candidates);
            if (out)
                stdout(out);
        }
        return;
    }
    // Skills staleness check (skip for built-in commands)
    let skillsCta;
    if (skillsEnabled &&
        !llms &&
        !llmsFull &&
        !schema &&
        !help &&
        !update &&
        !updateCheck &&
        !version) {
        const isSkillsAdd = builtinIdx(filtered, name, 'skills') !== -1;
        const isMcpAdd = builtinIdx(filtered, name, 'mcp') !== -1;
        if (!isSkillsAdd && !isMcpAdd) {
            const stored = SyncSkills.readHash(name);
            if (stored && SyncSkills.hasInstalledSkills(name, { cwd: sync?.cwd })) {
                const groups = new Map();
                const entries = collectSkillCommands(commands, [], groups, options.rootCommand);
                if (Skill.hash(entries) !== stored) {
                    const command = process.env.npm_config_user_agent || process.env.npm_execpath
                        ? `${detectRunner()} ${SyncMcp.detectPackageSpecifier(name, options.package, options.version)} skills add`
                        : `${displayName} skills add`;
                    skillsCta = {
                        description: 'Skills are out of date:',
                        commands: [{ command, description: 'sync outdated skills' }],
                    };
                }
            }
        }
    }
    if (llms || llmsFull) {
        // Scope to a subtree if command tokens are provided
        let scopedCommands = commands;
        const prefix = [];
        let scopedDescription = options.description;
        let scopedRoot = options.rootCommand;
        for (const token of filtered) {
            const rawEntry = scopedCommands.get(token);
            if (!rawEntry)
                break;
            const entry = resolveAlias(scopedCommands, rawEntry);
            if (isGroup(entry)) {
                scopedCommands = entry.commands;
                scopedDescription = entry.description;
                scopedRoot = entry.root;
                prefix.push(token);
            }
            else {
                // Leaf command — scope to just this command
                scopedCommands = new Map([[token, entry]]);
                scopedRoot = undefined;
                break;
            }
        }
        if (prefix.length === 0)
            scopedRoot = options.rootCommand;
        // Markdown skill output renders scopedName separately. Passing prefix again
        // to those collect helpers would double the group segment in command names
        // (e.g. "cli auth auth login" instead of "cli auth login").
        const collectPrefix = prefix.length > 0 ? [] : prefix;
        if (llmsFull) {
            if (!formatExplicit || formatFlag === 'md') {
                const groups = new Map();
                const cmds = collectSkillCommands(scopedCommands, collectPrefix, groups, scopedRoot);
                const scopedName = prefix.length > 0 ? `${name} ${prefix.join(' ')}` : name;
                writeln(Skill.generate(scopedName, cmds, groups));
                return;
            }
            writeln(Formatter.format(buildManifest(scopedCommands, prefix, options.globals?.schema, scopedRoot), formatFlag));
            return;
        }
        if (!formatExplicit || formatFlag === 'md') {
            const groups = new Map();
            const cmds = collectSkillCommands(scopedCommands, collectPrefix, groups, scopedRoot);
            const scopedName = prefix.length > 0 ? `${name} ${prefix.join(' ')}` : name;
            writeln(Skill.index(scopedName, cmds, scopedDescription));
            return;
        }
        writeln(Formatter.format(buildIndexManifest(scopedCommands, prefix, options.globals?.schema, scopedRoot), formatFlag));
        return;
    }
    // completions <shell>: print shell hook script to stdout
    const completionsIdx = builtinIdx(filtered, name, 'completions');
    if (completionsIdx !== -1) {
        const shell = filtered[completionsIdx + 1];
        if (help || !shell) {
            const b = findBuiltin('completions');
            writeln(Help.formatCommand(`${name} completions`, {
                args: b.args,
                description: b.description,
                hideGlobalOptions: true,
                hint: b.hint?.(name),
            }));
            return;
        }
        if (!shells.includes(shell)) {
            writeln(formatHumanError({
                code: 'INVALID_SHELL',
                message: `Unknown shell '${shell}'. Supported: ${shells.join(', ')}`,
            }));
            exit(1);
            return;
        }
        const names = [name, ...(options.aliases ?? [])];
        writeln(names.map((n) => Completions.register(shell, n)).join('\n'));
        return;
    }
    // skills add: generate skill files and install via `<pm>x skills add` (only when sync is configured)
    const skillsIdx = skillsEnabled ? builtinIdx(filtered, name, 'skills') : -1;
    if (skillsIdx !== -1) {
        const builtin = findBuiltin('skills');
        const skillsSub = filtered[skillsIdx + 1];
        const sub = skillsSub ? findBuiltinSubcommand(builtin, skillsSub) : undefined;
        if (skillsSub && !sub) {
            const candidates = builtin.subcommands?.flatMap((sub) => [sub.name, ...(sub.aliases ?? [])]) ?? [];
            const suggestion = suggest(skillsSub, candidates);
            const didYouMean = suggestion ? ` Did you mean '${suggestion}'?` : '';
            const message = `'${skillsSub}' is not a command for '${name} skills'.${didYouMean}`;
            const ctaCommands = [];
            if (suggestion) {
                const corrected = argv.map((t) => (t === skillsSub ? suggestion : t));
                ctaCommands.push({ command: `${name} ${corrected.join(' ')}` });
            }
            ctaCommands.push({
                command: `${name} skills --help`,
                description: 'see all available commands',
            });
            const cta = {
                description: ctaCommands.length === 1 ? 'Suggested command:' : 'Suggested commands:',
                commands: ctaCommands,
            };
            if (human) {
                writeln(formatHumanError({ code: 'COMMAND_NOT_FOUND', message }));
                writeln(formatHumanCta(cta));
            }
            else
                writeln(Formatter.format({ code: 'COMMAND_NOT_FOUND', message, cta }, 'toon'));
            exit(1);
            return;
        }
        if (!skillsSub) {
            writeln(formatBuiltinHelp(name, builtin));
            return;
        }
        if (sub?.name === 'list') {
            if (help) {
                writeln(formatBuiltinSubcommandHelp(name, builtin, 'list'));
                return;
            }
            try {
                const result = await SyncSkills.list(name, commands, {
                    cwd: sync?.cwd,
                    depth: sync?.depth ?? 1,
                    description: options.description,
                    include: sync?.include,
                    rootCommand: options.rootCommand,
                });
                if (result.length === 0) {
                    writeln('No skills found.');
                    return;
                }
                const lines = [];
                const maxLen = Math.max(...result.map((s) => s.name.length));
                for (const s of result) {
                    const icon = s.installed ? '✓' : '✗';
                    const padding = s.description
                        ? `${' '.repeat(maxLen - s.name.length)}  ${s.description}`
                        : '';
                    lines.push(`  ${icon} ${s.name}${padding}`);
                }
                const installedCount = result.filter((s) => s.installed).length;
                lines.push('');
                lines.push(`${result.length} skill${result.length === 1 ? '' : 's'} (${installedCount} installed)`);
                writeln(lines.join('\n'));
            }
            catch (err) {
                writeln(Formatter.format({
                    code: 'LIST_SKILLS_FAILED',
                    message: err instanceof Error ? err.message : String(err),
                }, formatExplicit ? formatFlag : 'toon'));
                exit(1);
            }
            return;
        }
        if (help) {
            writeln(formatBuiltinSubcommandHelp(name, builtin, 'add'));
            return;
        }
        const rest = filtered.slice(skillsIdx + 2);
        const depthArg = rest.indexOf('--depth');
        const depthEq = rest.find((t) => t.startsWith('--depth='));
        const depth = depthArg !== -1
            ? Number(rest[depthArg + 1])
            : depthEq
                ? Number(depthEq.split('=')[1])
                : (sync?.depth ?? 1);
        const global = rest.includes('--no-global') ? false : undefined;
        try {
            stdout('Syncing...');
            const result = await SyncSkills.sync(name, commands, {
                cwd: sync?.cwd,
                depth,
                description: options.description,
                global,
                include: sync?.include,
                rootCommand: options.rootCommand,
            });
            stdout('\r\x1b[K');
            const lines = [];
            const skillLabel = (s) => s.name;
            const maxLen = Math.max(...result.skills.map((s) => skillLabel(s).length));
            for (const s of result.skills) {
                const label = skillLabel(s);
                const padding = s.description
                    ? `${' '.repeat(maxLen - label.length)}  ${s.description}`
                    : '';
                lines.push(`  ✓ ${label}${padding}`);
            }
            lines.push('');
            lines.push(`${result.skills.length} skill${result.skills.length === 1 ? '' : 's'} synced`);
            // Before the suggestions: whatever is left to do is what makes the suggestions work.
            const body = sync?.body;
            if (body) {
                lines.push('');
                lines.push(body);
            }
            const suggestions = sync?.suggestions;
            if (suggestions && suggestions.length > 0) {
                lines.push('');
                lines.push(`Your agent can now use ${name}. Try asking:`);
                for (const s of suggestions)
                    lines.push(`  "${s}"`);
            }
            lines.push('');
            lines.push(`Run \`${name} --help\` to see the full command reference.`);
            writeln(lines.join('\n'));
            if (fullOutput || formatExplicit) {
                const output = { skills: result.paths };
                if (body)
                    output.body = body;
                if (fullOutput && result.agents.length > 0)
                    output.agents = result.agents;
                writeln(Formatter.format(output, formatExplicit ? formatFlag : 'toon'));
            }
        }
        catch (err) {
            writeln(Formatter.format({ code: 'SYNC_SKILLS_FAILED', message: err instanceof Error ? err.message : String(err) }, formatExplicit ? formatFlag : 'toon'));
            exit(1);
        }
        return;
    }
    // mcp add/doctor: register or smoke-test CLI MCP server integration.
    const mcpIdx = builtinIdx(filtered, name, 'mcp');
    if (mcpIdx !== -1) {
        const builtin = findBuiltin('mcp');
        const mcpSub = filtered[mcpIdx + 1];
        const sub = mcpSub ? findBuiltinSubcommand(builtin, mcpSub) : undefined;
        if (mcpSub && !sub) {
            const candidates = builtin.subcommands?.flatMap((sub) => [sub.name, ...(sub.aliases ?? [])]) ?? [];
            const suggestion = suggest(mcpSub, candidates);
            const didYouMean = suggestion ? ` Did you mean '${suggestion}'?` : '';
            const message = `'${mcpSub}' is not a command for '${name} mcp'.${didYouMean}`;
            const ctaCommands = [];
            if (suggestion) {
                const corrected = argv.map((t) => (t === mcpSub ? suggestion : t));
                ctaCommands.push({ command: `${name} ${corrected.join(' ')}` });
            }
            ctaCommands.push({ command: `${name} mcp --help`, description: 'see all available commands' });
            const cta = {
                description: ctaCommands.length === 1 ? 'Suggested command:' : 'Suggested commands:',
                commands: ctaCommands,
            };
            if (human) {
                writeln(formatHumanError({ code: 'COMMAND_NOT_FOUND', message }));
                writeln(formatHumanCta(cta));
            }
            else
                writeln(Formatter.format({ code: 'COMMAND_NOT_FOUND', message, cta }, 'toon'));
            exit(1);
            return;
        }
        if (!mcpSub) {
            writeln(formatBuiltinHelp(name, builtin));
            return;
        }
        if (help) {
            writeln(formatBuiltinSubcommandHelp(name, builtin, sub.name));
            return;
        }
        if (sub.name === 'doctor') {
            const result = await runMcpDoctor(name, commands, options);
            writeln(Formatter.format(result, formatExplicit ? formatFlag : 'toon'));
            if (!result.ok)
                exit(1);
            return;
        }
        const rest = filtered.slice(mcpIdx + 2);
        const global = rest.includes('--no-global') ? false : true;
        // Parse --command / -c and --agent flags from argv
        let command = options.mcp?.command;
        const agents = [...(options.mcp?.agents ?? [])];
        for (let i = 0; i < rest.length; i++) {
            if ((rest[i] === '--command' || rest[i] === '-c') && rest[i + 1])
                command = rest[++i];
            else if (rest[i] === '--agent' && rest[i + 1])
                agents.push(rest[++i]);
        }
        try {
            const mcpName = options.mcp?.name ?? name;
            stdout('Registering MCP server...');
            const result = await SyncMcp.register(mcpName, {
                ...(mcpName === name ? undefined : { cli: name }),
                command,
                global,
                agents,
                ...(options.package !== undefined
                    ? { package: options.package, version: options.version }
                    : undefined),
            });
            stdout('\r\x1b[K');
            const lines = [];
            lines.push(`✓ Registered ${mcpName} as MCP server`);
            if (result.agents.length > 0)
                lines.push(`  Agents: ${result.agents.join(', ')}`);
            lines.push('');
            lines.push(`Agents can now use ${mcpName} tools.`);
            const suggestions = sync?.suggestions;
            if (suggestions && suggestions.length > 0) {
                lines.push('');
                lines.push('Try asking:');
                for (const s of suggestions)
                    lines.push(`  "${s}"`);
            }
            writeln(lines.join('\n'));
            if (fullOutput || formatExplicit)
                writeln(Formatter.format({ name: mcpName, command: result.command, agents: result.agents }, formatExplicit ? formatFlag : 'toon'));
        }
        catch (err) {
            writeln(Formatter.format({ code: 'MCP_ADD_FAILED', message: err instanceof Error ? err.message : String(err) }, formatExplicit ? formatFlag : 'toon'));
            exit(1);
        }
        return;
    }
    // --help takes precedence over --version.
    if (version && !help && options.version) {
        writeln(options.version);
        return;
    }
    if (filtered.length === 0) {
        if (options.rootCommand &&
            human &&
            options.rootCommand.args &&
            hasRequiredArgs(options.rootCommand.args)) {
            // Root command with args but none provided (human mode) — show help
            const cmd = options.rootCommand;
            await writeBanner();
            writeln(Help.formatCommand(name, {
                alias: cmd.alias,
                aliases: options.aliases,
                configFlag,
                description: cmd.description ?? options.description,
                globals: options.globals,
                version: options.version,
                args: cmd.args,
                env: cmd.env,
                envSource: options.env,
                hint: cmd.hint,
                options: cmd.options,
                examples: formatExamples(cmd.examples),
                usage: cmd.usage,
                commands: commands.size > 0 ? collectHelpCommands(commands) : undefined,
                hideSkills: !skillsEnabled,
                root: true,
            }));
            return;
        }
        if (options.rootCommand || options.rootFetch) {
            // Root command/fetch with no args — treat as root invocation
        }
        else {
            await writeBanner();
            writeln(Help.formatRoot(name, {
                aliases: options.aliases,
                configFlag,
                description: options.description,
                globals: options.globals,
                version: options.version,
                commands: collectHelpCommands(commands),
                hideSkills: !skillsEnabled,
                root: true,
            }));
            return;
        }
    }
    const resolved = filtered.length === 0 && options.rootCommand
        ? { command: options.rootCommand, path: name, rest: [] }
        : filtered.length === 0 && options.rootFetch
            ? {
                fetchGateway: {
                    _fetch: true,
                    fetch: options.rootFetch,
                    description: options.description,
                },
                middlewares: [],
                path: name,
                rest: [],
            }
            : resolveCommand(commands, filtered);
    // --help on a fetch gateway → show fetch-specific help
    if (help && 'fetchGateway' in resolved) {
        const commandName = resolved.path === name ? name : `${name} ${resolved.path}`;
        if (resolved.path === name && commands.size > 0)
            writeln(Help.formatRoot(name, {
                aliases: options.aliases,
                configFlag,
                description: options.description,
                version: options.version,
                commands: collectHelpCommands(commands),
                hideSkills: !skillsEnabled,
                root: true,
            }));
        else
            writeln(formatFetchHelp(commandName, resolved.fetchGateway.description));
        return;
    }
    // --help after a command → show help for that command
    if (help) {
        if ('help' in resolved || 'error' in resolved) {
            // group or unknown → show root help for that path
            const helpName = 'help' in resolved ? `${name} ${resolved.path}` : name;
            const helpDesc = 'help' in resolved ? resolved.description : options.description;
            const helpCmds = 'help' in resolved ? resolved.commands : commands;
            const isRoot = helpName === name;
            // Root with both a handler and subcommands → show command help with subcommands
            if (isRoot && options.rootCommand && helpCmds.size > 0) {
                const cmd = options.rootCommand;
                writeln(Help.formatCommand(name, {
                    alias: cmd.alias,
                    aliases: options.aliases,
                    configFlag,
                    description: cmd.description ?? options.description,
                    globals: options.globals,
                    version: options.version,
                    args: cmd.args,
                    env: cmd.env,
                    envSource: options.env,
                    hint: cmd.hint,
                    options: cmd.options,
                    examples: formatExamples(cmd.examples),
                    usage: cmd.usage,
                    commands: collectHelpCommands(helpCmds),
                    hideSkills: !skillsEnabled,
                    root: true,
                }));
            }
            else {
                writeln(Help.formatRoot(helpName, {
                    aliases: isRoot ? options.aliases : undefined,
                    configFlag,
                    description: helpDesc,
                    globals: options.globals,
                    version: isRoot ? options.version : undefined,
                    commands: collectHelpCommands(helpCmds),
                    hideSkills: !skillsEnabled,
                    root: isRoot,
                }));
            }
        }
        else if ('command' in resolved) {
            const cmd = resolved.command;
            const isRootCmd = resolved.path === name;
            const commandName = isRootCmd ? name : `${name} ${resolved.path}`;
            const helpSubcommands = 'commands' in resolved && resolved.commands && resolved.commands.size > 0
                ? collectHelpCommands(resolved.commands)
                : isRootCmd && options.rootCommand && commands.size > 0
                    ? collectHelpCommands(commands)
                    : undefined;
            writeln(Help.formatCommand(commandName, {
                alias: cmd.alias,
                aliases: isRootCmd ? options.aliases : cmd.aliases,
                configFlag,
                description: cmd.description,
                globals: options.globals,
                version: isRootCmd ? options.version : undefined,
                args: cmd.args,
                env: cmd.env,
                envSource: options.env,
                hint: cmd.hint,
                options: cmd.options,
                examples: formatExamples(cmd.examples),
                usage: cmd.usage,
                commands: helpSubcommands,
                hideSkills: !skillsEnabled,
                root: isRootCmd,
            }));
        }
        return;
    }
    // --schema: output JSON Schema for a command's args, env, options, output
    if (schema) {
        if ('help' in resolved) {
            writeln(Help.formatRoot(`${name} ${resolved.path}`, {
                configFlag,
                description: resolved.description,
                globals: options.globals,
                commands: collectHelpCommands(resolved.commands),
            }));
            return;
        }
        if ('error' in resolved) {
            const parent = resolved.path ? `${name} ${resolved.path}` : name;
            const suggestion = suggest(resolved.error, resolved.commands.keys());
            const didYouMean = suggestion ? ` Did you mean '${suggestion}'?` : '';
            writeln(`Error: '${resolved.error}' is not a command for '${parent}'.${didYouMean}`);
            exit(1);
            return;
        }
        if ('fetchGateway' in resolved) {
            writeln('--schema is not supported for fetch commands.');
            exit(1);
            return;
        }
        const cmd = resolved.command;
        const format = formatExplicit ? formatFlag : 'toon';
        const result = {};
        if (cmd.args)
            result.args = Schema.toJsonSchema(cmd.args);
        if (cmd.env)
            result.env = Schema.toJsonSchema(cmd.env);
        if (cmd.options)
            result.options = Schema.toJsonSchema(cmd.options);
        if (cmd.output)
            result.output = Schema.toJsonSchema(cmd.output);
        if (options.globals?.schema)
            result.globals = Schema.toJsonSchema(options.globals.schema);
        writeln(Formatter.format(result, format));
        return;
    }
    if ('help' in resolved) {
        writeln(Help.formatRoot(`${name} ${resolved.path}`, {
            configFlag,
            description: resolved.description,
            globals: options.globals,
            commands: collectHelpCommands(resolved.commands),
        }));
        return;
    }
    let updateCta;
    if (human && options.update !== false) {
        const update = Update.check(name, updateOptions);
        if (update)
            updateCta = {
                description: `Update available for ${update.name}:`,
                commands: [
                    {
                        command: `${displayName} --update`,
                        description: `upgrade from ${update.current} to ${update.latest}`,
                    },
                ],
            };
    }
    const noticeCta = mergeFormattedCtas(skillsCta, updateCta);
    const start = performance.now();
    // Resolve effective format: explicit --format/--json → command default → CLI default → toon
    const resolvedFormat = 'command' in resolved && resolved.command.format;
    const format = formatExplicit ? formatFlag : resolvedFormat || options.format || 'toon';
    if (format === 'yaml')
        await Yaml.load();
    // Fall back to root fetch/command when no subcommand matches,
    // but only if the token doesn't look like a typo of a known command.
    const rootFallbackBlocked = 'error' in resolved &&
        !resolved.path &&
        (() => {
            const candidates = [...resolved.commands.keys()];
            for (const b of builtins)
                candidates.push(b.name);
            return suggest(resolved.error, candidates) !== undefined;
        })();
    const effective = 'error' in resolved && options.rootFetch && !resolved.path && !rootFallbackBlocked
        ? {
            fetchGateway: {
                _fetch: true,
                fetch: options.rootFetch,
                description: options.description,
            },
            middlewares: [],
            path: name,
            rest: filtered,
        }
        : 'error' in resolved && options.rootCommand && !resolved.path && !rootFallbackBlocked
            ? { command: options.rootCommand, path: name, rest: filtered }
            : resolved;
    // Resolve outputPolicy: command/group → CLI-level → default ('all')
    const effectiveOutputPolicy = ('outputPolicy' in resolved && resolved.outputPolicy) || options.outputPolicy;
    const renderOutput = !(human && !formatExplicit && effectiveOutputPolicy === 'agent-only');
    const filterPaths = filterOutput ? Filter.parse(filterOutput) : undefined;
    function truncate(s) {
        if (tokenLimit == null && tokenOffset == null)
            return { text: s, truncated: false };
        const total = estimateTokenCount(s);
        const offset = tokenOffset ?? 0;
        const end = tokenLimit != null ? offset + tokenLimit : total;
        if (offset === 0 && end >= total)
            return { text: s, truncated: false };
        const sliced = sliceByTokens(s, offset, end);
        const actualEnd = Math.min(end, total);
        const nextOffset = actualEnd < total ? actualEnd : undefined;
        return {
            text: `${sliced}\n[truncated: showing tokens ${offset}–${actualEnd} of ${total}]`,
            truncated: true,
            nextOffset,
        };
    }
    function write(output) {
        if (filterPaths && output.ok && output.data != null)
            output = { ...output, data: Filter.apply(output.data, filterPaths) };
        if (noticeCta) {
            const existing = output.meta.cta;
            output = {
                ...output,
                meta: {
                    ...output.meta,
                    cta: existing
                        ? {
                            description: existing.description,
                            commands: [...existing.commands, ...noticeCta.commands],
                        }
                        : noticeCta,
                },
            };
        }
        if (tokenCount) {
            const base = output.ok ? output.data : output.error;
            const formatted = base != null ? Formatter.format(base, format) : '';
            return writeln(String(estimateTokenCount(formatted)));
        }
        const cta = output.meta.cta;
        if (human && !fullOutput) {
            if (output.ok && output.data != null && renderOutput) {
                const t = truncate(Formatter.format(output.data, format));
                writeln(t.text);
            }
            else if (!output.ok)
                writeln(formatHumanError(output.error));
            if (cta)
                writeln(formatHumanCta(cta));
            return;
        }
        if (fullOutput) {
            if (tokenLimit != null || tokenOffset != null) {
                // Truncate data separately so meta (including nextOffset) is always visible
                const dataFormatted = output.ok && output.data != null
                    ? Formatter.format(output.data, format)
                    : !output.ok
                        ? Formatter.format(output.error, format)
                        : '';
                const t = truncate(dataFormatted);
                if (t.truncated) {
                    const envelope = output.ok
                        ? { ok: true, data: t.text }
                        : { ok: false, error: t.text };
                    const meta = { ...output.meta };
                    if (t.nextOffset != null)
                        meta.nextOffset = t.nextOffset;
                    envelope.meta = meta;
                    return writeln(Formatter.format(envelope, format));
                }
            }
            return writeln(Formatter.format(output, format));
        }
        const base = output.ok ? output.data : output.error;
        const formatted = Formatter.format(base, format);
        if (!cta) {
            if (formatted)
                writeln(truncate(formatted).text);
            return;
        }
        const payload = typeof base === 'object' && base !== null ? { ...base, cta } : { data: base, cta };
        writeln(truncate(Formatter.format(payload, format)).text);
    }
    if ('error' in effective) {
        const helpCmd = effective.path ? `${name} ${effective.path} --help` : `${name} --help`;
        const parent = effective.path ? `${name} ${effective.path}` : name;
        const candidates = 'commands' in effective ? [...effective.commands.keys()] : [];
        if (!effective.path)
            for (const b of builtins)
                candidates.push(b.name);
        const suggestion = suggest(effective.error, candidates);
        const didYouMean = suggestion ? ` Did you mean '${suggestion}'?` : '';
        const message = `'${effective.error}' is not a command for '${parent}'.${didYouMean}`;
        const ctaCommands = [];
        if (suggestion) {
            const corrected = argv.map((t) => (t === effective.error ? suggestion : t));
            ctaCommands.push({ command: `${name} ${corrected.join(' ')}` });
        }
        ctaCommands.push({ command: helpCmd, description: 'see all available commands' });
        const cta = {
            description: ctaCommands.length === 1 ? 'Suggested command:' : 'Suggested commands:',
            commands: ctaCommands,
        };
        if (human && !fullOutput) {
            writeln(formatHumanError({ code: 'COMMAND_NOT_FOUND', message }));
            const mergedCta = noticeCta
                ? { ...cta, commands: [...cta.commands, ...noticeCta.commands] }
                : cta;
            writeln(formatHumanCta(mergedCta));
            exit(1);
            return;
        }
        write({
            ok: false,
            error: { code: 'COMMAND_NOT_FOUND', message },
            meta: {
                command: effective.error,
                cta,
                duration: `${Math.round(performance.now() - start)}ms`,
            },
        });
        exit(1);
        return;
    }
    // Fetch gateway execution path
    if ('fetchGateway' in effective) {
        if (!parseGlobalOptions(true))
            return;
        const { fetchGateway, path, rest: fetchRest } = effective;
        const fetchMiddleware = [
            ...(options.middlewares ?? []),
            ...(effective.middlewares ?? []),
        ];
        const runFetch = async () => {
            const input = Fetch.parseArgv(fetchRest);
            if (fetchGateway.basePath)
                input.path = fetchGateway.basePath + input.path;
            const request = Fetch.buildRequest(input);
            const response = await fetchGateway.fetch(request);
            // Streaming path — NDJSON responses pipe through handleStreaming
            if (Fetch.isStreamingResponse(response)) {
                const generator = Fetch.parseStreamingResponse(response);
                await handleStreaming(generator, {
                    name,
                    path,
                    start,
                    format,
                    formatExplicit,
                    human,
                    renderOutput,
                    fullOutput,
                    truncate,
                    write,
                    writeln,
                    exit,
                });
                return;
            }
            const output = await Fetch.parseResponse(response);
            if (output.ok) {
                write({
                    ok: true,
                    data: output.data,
                    meta: {
                        command: path,
                        duration: `${Math.round(performance.now() - start)}ms`,
                    },
                });
            }
            else {
                write({
                    ok: false,
                    error: Fetch.parseError(output),
                    meta: {
                        command: path,
                        duration: `${Math.round(performance.now() - start)}ms`,
                    },
                });
                exit(1);
            }
        };
        try {
            const cliEnv = options.envSchema
                ? Parser.parseEnv(options.envSchema, options.env ?? process.env)
                : {};
            if (fetchMiddleware.length > 0) {
                const varsMap = options.vars ? options.vars.parse({}) : {};
                const errorFn = (opts) => ({ [sentinel]: 'error', ...opts });
                const mwCtx = {
                    agent: !human,
                    command: path,
                    displayName,
                    env: cliEnv,
                    error: errorFn,
                    format,
                    formatExplicit,
                    globals,
                    name,
                    set(key, value) {
                        varsMap[key] = value;
                    },
                    var: varsMap,
                    version: options.version,
                };
                const handleMwSentinel = (result) => {
                    if (!isSentinel(result) || result[sentinel] !== 'error')
                        return;
                    const err = result;
                    const cta = formatCtaBlock(displayName, err.cta);
                    write({
                        ok: false,
                        error: {
                            code: err.code,
                            message: err.message,
                            ...(err.retryable !== undefined ? { retryable: err.retryable } : undefined),
                        },
                        meta: {
                            command: path,
                            duration: `${Math.round(performance.now() - start)}ms`,
                            ...(cta ? { cta } : undefined),
                        },
                    });
                    exit(err.exitCode ?? 1);
                };
                const composed = fetchMiddleware.reduceRight((next, mw) => async () => {
                    handleMwSentinel(await mw(mwCtx, next));
                }, runFetch);
                await composed();
            }
            else {
                await runFetch();
            }
        }
        catch (error) {
            write({
                ok: false,
                error: {
                    code: error instanceof IncurError ? error.code : 'UNKNOWN',
                    message: error instanceof Error ? error.message : String(error),
                },
                meta: { command: path, duration: `${Math.round(performance.now() - start)}ms` },
            });
            exit(error instanceof IncurError ? (error.exitCode ?? 1) : 1);
        }
        return;
    }
    const { command, path, rest: commandRest } = effective;
    if (!parseGlobalOptions(true))
        return;
    // Collect middleware: root CLI + groups traversed + per-command
    const allMiddleware = [
        ...(options.middlewares ?? []),
        ...('middlewares' in resolved
            ? (resolved.middlewares ?? [])
            : []),
        ...(command.middleware ?? []),
    ];
    if (human)
        emitDeprecationWarnings(commandRest, command.options, command.alias);
    let defaults;
    if (configEnabled) {
        try {
            defaults = await loadCommandOptionDefaults(name, path, {
                configDisabled,
                configPath,
                files: options.config?.files,
                loader: options.config?.loader,
            });
        }
        catch (error) {
            write({
                ok: false,
                error: {
                    code: error instanceof IncurError ? error.code : 'UNKNOWN',
                    message: error instanceof Error ? error.message : String(error),
                },
                meta: { command: path, duration: `${Math.round(performance.now() - start)}ms` },
            });
            exit(error instanceof IncurError ? (error.exitCode ?? 1) : 1);
            return;
        }
    }
    const result = await Command.execute(command, {
        agent: !human,
        argv: commandRest,
        defaults,
        displayName,
        env: options.envSchema,
        envSource: options.env,
        format,
        formatExplicit,
        globals,
        inputOptions: {},
        middlewares: allMiddleware,
        name,
        path,
        vars: options.vars,
        version: options.version,
    });
    const duration = `${Math.round(performance.now() - start)}ms`;
    // Streaming path — async generator
    if ('stream' in result) {
        await handleStreaming(result.stream, {
            name: displayName,
            path,
            start,
            format,
            formatExplicit,
            human,
            renderOutput,
            fullOutput,
            truncate,
            write,
            writeln,
            exit,
        });
        return;
    }
    if (result.ok) {
        const cta = formatCtaBlock(displayName, result.cta);
        write({
            ok: true,
            data: result.data,
            meta: {
                command: path,
                duration,
                ...(cta ? { cta } : undefined),
            },
        });
    }
    else {
        const cta = formatCtaBlock(displayName, result.cta);
        if (human && !formatExplicit && result.error.fieldErrors) {
            writeln(formatHumanValidationError(displayName, path, command, new ValidationError({
                message: result.error.message,
                fieldErrors: result.error.fieldErrors,
            }), options.env, configFlag));
            exit(1);
            return;
        }
        write({
            ok: false,
            error: {
                code: result.error.code,
                message: result.error.message,
                ...(result.error.retryable !== undefined
                    ? { retryable: result.error.retryable }
                    : undefined),
                ...(result.error.fieldErrors ? { fieldErrors: result.error.fieldErrors } : undefined),
            },
            meta: {
                command: path,
                duration,
                ...(cta ? { cta } : undefined),
            },
        });
        exit(result.exitCode ?? 1);
    }
}
/** @internal Creates a lazy MCP HTTP handler scoped to a CLI instance. */
function createMcpHttpHandler(name, version, options = {}) {
    let session;
    async function createServer(commands, mcpOptions, stateless) {
        const { fromJsonSchema, McpServer, WebStandardStreamableHTTPServerTransport } = await import('@modelcontextprotocol/server');
        const server = new McpServer({ name, ...(options.title ? { title: options.title } : undefined), version }, options.instructions ? { instructions: options.instructions } : undefined);
        Mcp.registerTools(server, commands, {
            env: mcpOptions?.env,
            fromJsonSchema,
            middlewares: mcpOptions?.middlewares,
            name,
            request: (extra) => extra?.http?.req,
            sendNotification: (notification) => server.server.notification(notification),
            tools: options.tools,
            vars: mcpOptions?.vars,
            version,
        });
        const transport = new WebStandardStreamableHTTPServerTransport(stateless
            ? { enableJsonResponse: true }
            : {
                sessionIdGenerator: () => crypto.randomUUID(),
                enableJsonResponse: true,
            });
        await server.connect(transport);
        return { server, transport };
    }
    return async (req, commands, mcpOptions) => {
        const stateless = options.stateless ?? true;
        if (stateless && req.method !== 'POST')
            return new Response(null, { status: 405, headers: { Allow: 'POST' } });
        if (!stateless) {
            session ??= createServer(commands, mcpOptions, false).catch((error) => {
                session = undefined;
                throw error;
            });
            return (await session).transport.handleRequest(req);
        }
        const abortReason = () => req.signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
        if (req.signal.aborted)
            throw abortReason();
        const { server, transport } = await createServer(commands, mcpOptions, true);
        let closing;
        const close = () => (closing ??= server.close());
        // Transport closure does not settle `handleRequest`; reject the public fetch separately.
        let rejectAbort;
        const aborted = new Promise((_resolve, reject) => {
            rejectAbort = reject;
        });
        let didAbort = false;
        const abort = () => {
            if (didAbort)
                return;
            didAbort = true;
            rejectAbort(abortReason());
            void close();
        };
        req.signal.addEventListener('abort', abort, { once: true });
        // Catch aborts that happened during asynchronous server creation.
        if (req.signal.aborted)
            abort();
        try {
            if (req.signal.aborted)
                return await aborted;
            return await Promise.race([transport.handleRequest(req), aborted]);
        }
        finally {
            req.signal.removeEventListener('abort', abort);
            await close();
        }
    };
}
function isOpenapiRoute(segments) {
    if (segments.length === 1)
        return (segments[0] === 'openapi.json' ||
            segments[0] === 'openapi.yml' ||
            segments[0] === 'openapi.yaml');
    return segments[0] === '.well-known' && segments[1] === 'openapi.json' && segments.length === 2;
}
function generatedOpenapi(name, commands, options) {
    const openapiCli = { name, description: options.description };
    toCommands.set(openapiCli, commands);
    if (options.rootCommand)
        toRootDefinition.set(openapiCli, options.rootCommand);
    return Openapi.fromCli(openapiCli, {
        title: name,
        ...(options.version ? { version: options.version } : undefined),
        ...(options.description ? { description: options.description } : undefined),
    });
}
/** @internal Handles an HTTP request by resolving a command and returning a JSON Response. */
async function fetchImpl(name, commands, req, options = {}) {
    const start = performance.now();
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    // OpenAPI discovery: route /openapi.json, /openapi.yml, /openapi.yaml, and /.well-known/openapi.json
    if (req.method === 'GET' && isOpenapiRoute(segments)) {
        const spec = generatedOpenapi(name, commands, options);
        const yaml = segments[0] === 'openapi.yml' || segments[0] === 'openapi.yaml';
        return new Response(yaml ? (await Yaml.load()).stringify(spec) : JSON.stringify(spec), {
            status: 200,
            headers: {
                'content-type': yaml ? 'application/yaml' : 'application/json',
                'cache-control': 'public, max-age=300',
            },
        });
    }
    // MCP over HTTP: route /mcp to the MCP transport
    if (segments[0] === 'mcp' && segments.length === 1 && options.mcpHandler)
        return options.mcpHandler(req, commands, {
            middlewares: options.middlewares,
            env: options.envSchema,
            vars: options.vars,
        });
    // .well-known/skills/ — Agent Skills Discovery (RFC)
    if (segments[0] === '.well-known' &&
        segments[1] === 'skills' &&
        segments.length >= 3 &&
        req.method === 'GET') {
        // Pre-load yaml for the sync call paths below (`Skill.split`, frontmatter parsing).
        await Yaml.load();
        const groups = new Map();
        const cmds = collectSkillCommands(commands, [], groups, options.rootCommand);
        // GET /.well-known/skills/index.json
        if (segments[2] === 'index.json' && segments.length === 3) {
            const files = Skill.split(name, cmds, 1, groups);
            const skills = files.map((f) => {
                const fmMatch = f.content.match(/^---\n([\s\S]*?)\n---/);
                const meta = fmMatch ? Yaml.loadSync().parse(fmMatch[1]) : {};
                return {
                    name: f.dir || name,
                    description: meta.description ?? '',
                    files: ['SKILL.md'],
                };
            });
            return new Response(JSON.stringify({ skills }), {
                status: 200,
                headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
            });
        }
        // GET /.well-known/skills/{skill-name}/SKILL.md
        if (segments.length === 4 && segments[3] === 'SKILL.md') {
            const skillName = segments[2];
            const files = Skill.split(name, cmds, 1, groups);
            const file = files.find((f) => (f.dir || name) === skillName);
            if (file)
                return new Response(file.content, {
                    status: 200,
                    headers: { 'content-type': 'text/markdown', 'cache-control': 'public, max-age=300' },
                });
            return new Response('Not Found', { status: 404 });
        }
        return new Response('Not Found', { status: 404 });
    }
    // Parse options from search params (GET) or body (non-GET)
    let inputOptions = {};
    if (req.method === 'GET')
        for (const [key, value] of url.searchParams)
            inputOptions[key] = value;
    else {
        try {
            const contentType = req.headers.get('content-type') ?? '';
            if (contentType.includes('application/json'))
                inputOptions = (await req.json());
        }
        catch { }
    }
    function jsonResponse(body, status) {
        return new Response(Json.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        });
    }
    // Resolve command from path segments
    if (segments.length === 0) {
        // Root path
        if (options.rootCommand)
            return executeCommand(name, options.rootCommand, [], inputOptions, req, start, options);
        return jsonResponse({
            ok: false,
            error: { code: 'COMMAND_NOT_FOUND', message: 'No root command defined.' },
            meta: { command: '/', duration: `${Math.round(performance.now() - start)}ms` },
        }, 404);
    }
    const resolved = resolveCommand(commands, segments);
    if ('error' in resolved) {
        const parent = resolved.path ? `${name} ${resolved.path}` : name;
        const suggestion = suggest(resolved.error, resolved.commands.keys());
        const didYouMean = suggestion ? ` Did you mean '${suggestion}'?` : '';
        return jsonResponse({
            ok: false,
            error: {
                code: 'COMMAND_NOT_FOUND',
                message: `'${resolved.error}' is not a command for '${parent}'.${didYouMean}`,
            },
            meta: { command: resolved.error, duration: `${Math.round(performance.now() - start)}ms` },
        }, 404);
    }
    if ('help' in resolved)
        return jsonResponse({
            ok: false,
            error: {
                code: 'COMMAND_NOT_FOUND',
                message: `'${resolved.path}' is a command group. Specify a subcommand.`,
            },
            meta: { command: resolved.path, duration: `${Math.round(performance.now() - start)}ms` },
        }, 404);
    if ('fetchGateway' in resolved)
        return resolved.fetchGateway.fetch(req);
    const { command, path, rest } = resolved;
    const groupMiddlewares = 'middlewares' in resolved ? resolved.middlewares : [];
    return executeCommand(path, command, rest, inputOptions, req, start, {
        ...options,
        groupMiddlewares,
    });
}
/** @internal Executes a resolved command for the fetch handler and returns a JSON Response. */
async function executeCommand(path, command, rest, inputOptions, request, start, options) {
    function jsonResponse(body, status) {
        return new Response(Json.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        });
    }
    const allMiddleware = [
        ...(options.middlewares ?? []),
        ...(options.groupMiddlewares ?? []),
        ...(command.middleware ?? []),
    ];
    let globals = {};
    let commandInputOptions = inputOptions;
    if (options.globals) {
        const globalKeys = new Set(Object.keys(options.globals.schema.shape));
        const rawGlobals = {};
        commandInputOptions = {};
        for (const [key, value] of Object.entries(inputOptions)) {
            if (globalKeys.has(key))
                rawGlobals[key] = value;
            else
                commandInputOptions[key] = value;
        }
        try {
            globals = options.globals.schema.parse(rawGlobals);
        }
        catch (error) {
            const issues = error?.issues ?? error?.error?.issues ?? [];
            const message = issues.map((i) => i.message).join('; ') || 'Validation failed';
            return jsonResponse({
                ok: false,
                error: { code: 'VALIDATION_ERROR', message },
                meta: { command: path, duration: `${Math.round(performance.now() - start)}ms` },
            }, 400);
        }
    }
    const result = await Command.execute(command, {
        agent: true,
        argv: rest,
        env: options.envSchema,
        format: 'json',
        formatExplicit: true,
        globals,
        inputOptions: commandInputOptions,
        middlewares: allMiddleware,
        name: options.name ?? path,
        parseMode: 'split',
        path,
        request,
        vars: options.vars,
        version: options.version,
    });
    const duration = `${Math.round(performance.now() - start)}ms`;
    // Streaming path — async generator → NDJSON response
    if ('stream' in result) {
        const iterator = result.stream;
        const encoder = new TextEncoder();
        const meta = (cta) => ({
            command: path,
            duration: `${Math.round(performance.now() - start)}ms`,
            ...(cta ? { cta } : undefined),
        });
        const errorRecord = (err) => ({
            type: 'error',
            ok: false,
            error: {
                code: err.code,
                message: err.message,
                ...(err.retryable !== undefined ? { retryable: err.retryable } : undefined),
            },
            meta: meta(formatCtaBlock(options.name ?? path, err.cta)),
        });
        const stream = new ReadableStream({
            async cancel() {
                await iterator.return(undefined);
            },
            async pull(controller) {
                try {
                    const { value, done } = await iterator.next();
                    if (done) {
                        if (isSentinel(value) && value[sentinel] === 'error') {
                            controller.enqueue(encoder.encode(Json.stringify(errorRecord(value)) + '\n'));
                            controller.close();
                            return;
                        }
                        const cta = isSentinel(value) && value[sentinel] === 'ok'
                            ? formatCtaBlock(options.name ?? path, value.cta)
                            : undefined;
                        controller.enqueue(encoder.encode(Json.stringify({
                            type: 'done',
                            ok: true,
                            meta: meta(cta),
                        }) + '\n'));
                        controller.close();
                        return;
                    }
                    if (isSentinel(value) && value[sentinel] === 'error') {
                        controller.enqueue(encoder.encode(Json.stringify(errorRecord(value)) + '\n'));
                        await iterator.return(undefined);
                        controller.close();
                        return;
                    }
                    controller.enqueue(encoder.encode(Json.stringify({ type: 'chunk', data: value }) + '\n'));
                }
                catch (error) {
                    controller.enqueue(encoder.encode(Json.stringify({
                        type: 'error',
                        ok: false,
                        error: {
                            code: error instanceof IncurError ? error.code : 'UNKNOWN',
                            message: error instanceof Error ? error.message : String(error),
                            ...(error instanceof IncurError ? { retryable: error.retryable } : undefined),
                        },
                        meta: meta(),
                    }) + '\n'));
                    controller.close();
                }
            },
        });
        return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
        });
    }
    if (!result.ok) {
        const cta = formatCtaBlock(options.name ?? path, result.cta);
        return jsonResponse({
            ok: false,
            error: {
                code: result.error.code,
                message: result.error.message,
                ...(result.error.retryable !== undefined
                    ? { retryable: result.error.retryable }
                    : undefined),
                ...(result.error.fieldErrors ? { fieldErrors: result.error.fieldErrors } : undefined),
            },
            meta: {
                command: path,
                duration,
                ...(cta ? { cta } : undefined),
            },
        }, result.error.code === 'VALIDATION_ERROR' ? 400 : 500);
    }
    const cta = formatCtaBlock(options.name ?? path, result.cta);
    return jsonResponse({
        ok: true,
        data: result.data,
        meta: {
            command: path,
            duration,
            ...(cta ? { cta } : undefined),
        },
    }, 200);
}
/** @internal Formats a validation error for TTY with usage hint. */
function formatHumanValidationError(cli, path, command, error, envSource, configFlag) {
    const lines = [];
    for (const fe of error.fieldErrors) {
        const line = (() => {
            const target = formatValidationTarget(command, fe.path);
            if (fe.missing)
                return `Error: missing required ${target.kind} ${target.label}`;
            if (target.kind === 'environment variable')
                return `Error: invalid value for environment variable ${target.label}: ${fe.message}`;
            return `Error: invalid value for ${target.label}: ${fe.message}`;
        })();
        lines.push(line);
    }
    lines.push('See below for usage.');
    lines.push('');
    lines.push(Help.formatCommand(path === cli ? cli : `${cli} ${path}`, {
        alias: command.alias,
        configFlag,
        description: command.description,
        args: command.args,
        env: command.env,
        envSource,
        hint: command.hint,
        options: command.options,
        examples: formatExamples(command.examples),
        usage: command.usage,
    }));
    return lines.join('\n');
}
/** @internal Formats a field path as an option flag, env name, or positional placeholder. */
function formatValidationTarget(command, path) {
    const [head, ...tail] = path.split('.');
    if (!head)
        return { kind: 'argument', label: 'input' };
    if (command.options?.shape[head]) {
        const suffix = tail.length > 0 ? `.${tail.join('.')}` : '';
        return { kind: 'option', label: `--${toKebab(head)}${suffix}` };
    }
    if (command.env?.shape[head]) {
        const suffix = tail.length > 0 ? `.${tail.join('.')}` : '';
        return { kind: 'environment variable', label: `${head}${suffix}` };
    }
    return { kind: 'argument', label: `<${path}>` };
}
/** @internal Resolves a command from the tree by walking tokens until a leaf is found. */
function resolveCommand(commands, tokens) {
    const [first, ...rest] = tokens;
    if (!first || !commands.has(first))
        return { error: first ?? '(none)', path: '', commands, rest };
    let entry = resolveAlias(commands, commands.get(first));
    const path = [first];
    let remaining = rest;
    let inheritedOutputPolicy;
    const collectedMiddlewares = [];
    // Fetch gateway — all remaining tokens go to the fetch handler
    if (isFetchGateway(entry)) {
        const outputPolicy = entry.outputPolicy ?? inheritedOutputPolicy;
        return {
            fetchGateway: entry,
            middlewares: collectedMiddlewares,
            path: path.join(' '),
            rest: remaining,
            ...(outputPolicy ? { outputPolicy } : undefined),
        };
    }
    while (isGroup(entry)) {
        if (entry.outputPolicy)
            inheritedOutputPolicy = entry.outputPolicy;
        if (entry.middlewares)
            collectedMiddlewares.push(...entry.middlewares);
        const next = remaining[0];
        if (!next && entry.root) {
            const outputPolicy = entry.root.outputPolicy ?? inheritedOutputPolicy;
            return {
                command: entry.root,
                commands: entry.commands,
                middlewares: collectedMiddlewares,
                path: path.join(' '),
                rest: remaining,
                ...(outputPolicy ? { outputPolicy } : undefined),
            };
        }
        if (!next)
            return {
                help: true,
                path: path.join(' '),
                description: entry.description,
                commands: entry.commands,
            };
        const rawChild = entry.commands.get(next);
        if (!rawChild) {
            if (entry.root && !suggest(next, entry.commands.keys())) {
                const outputPolicy = entry.root.outputPolicy ?? inheritedOutputPolicy;
                return {
                    command: entry.root,
                    commands: entry.commands,
                    middlewares: collectedMiddlewares,
                    path: path.join(' '),
                    rest: remaining,
                    ...(outputPolicy ? { outputPolicy } : undefined),
                };
            }
            return {
                error: next,
                path: path.join(' '),
                commands: entry.commands,
                rest: remaining.slice(1),
            };
        }
        let child = resolveAlias(entry.commands, rawChild);
        path.push(next);
        remaining = remaining.slice(1);
        entry = child;
        if (isFetchGateway(entry)) {
            const outputPolicy = entry.outputPolicy ?? inheritedOutputPolicy;
            return {
                fetchGateway: entry,
                middlewares: collectedMiddlewares,
                path: path.join(' '),
                rest: remaining,
                ...(outputPolicy ? { outputPolicy } : undefined),
            };
        }
    }
    const outputPolicy = entry.outputPolicy ?? inheritedOutputPolicy;
    return {
        command: entry,
        middlewares: collectedMiddlewares,
        path: path.join(' '),
        rest: remaining,
        ...(outputPolicy ? { outputPolicy } : undefined),
    };
}
/** @internal Extracts built-in flags from argv. */
const validFormats = new Set(['toon', 'json', 'yaml', 'md', 'jsonl']);
function extractBuiltinFlags(argv, options = {}) {
    let fullOutput = false;
    let llms = false;
    let llmsFull = false;
    let mcp = false;
    let help = false;
    let update = false;
    let updateCheck = false;
    let version = false;
    let schema = false;
    let format = 'toon';
    let formatExplicit = false;
    let configPath;
    let configDisabled = false;
    let filterOutput;
    let tokenLimit;
    let tokenOffset;
    let tokenCount = false;
    const rest = [];
    const cfgFlag = options.configFlag ? `--${options.configFlag}` : undefined;
    const cfgFlagEq = options.configFlag ? `--${options.configFlag}=` : undefined;
    const noCfgFlag = options.configFlag ? `--no-${options.configFlag}` : undefined;
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--full-output')
            fullOutput = true;
        else if (token === '--llms')
            llms = true;
        else if (token === '--llms-full')
            llmsFull = true;
        else if (token === '--mcp')
            mcp = true;
        else if (token === '--help' || token === '-h')
            help = true;
        else if (token === '--update')
            update = true;
        else if (token === Update.checkFlag)
            updateCheck = true;
        // A following value belongs to a command-local `--version` option.
        else if (token === '--version' && (argv[i + 1] === undefined || argv[i + 1].startsWith('-')))
            version = true;
        else if (token === '--schema')
            schema = true;
        else if (token === '--json') {
            format = 'json';
            formatExplicit = true;
        }
        else if (token === '--format' && argv[i + 1]) {
            if (!validFormats.has(argv[i + 1]))
                throw new ParseError({
                    message: `Invalid format: "${argv[i + 1]}". Expected one of: ${[...validFormats].join(', ')}`,
                });
            format = argv[i + 1];
            formatExplicit = true;
            i++;
        }
        else if (cfgFlag && token === cfgFlag) {
            const value = argv[i + 1];
            if (value === undefined)
                throw new ParseError({ message: `Missing value for flag: ${cfgFlag}` });
            configPath = value;
            configDisabled = false;
            i++;
        }
        else if (cfgFlagEq && token.startsWith(cfgFlagEq)) {
            const value = token.slice(cfgFlagEq.length);
            if (value.length === 0)
                throw new ParseError({ message: `Missing value for flag: ${cfgFlag}` });
            configPath = value;
            configDisabled = false;
        }
        else if (noCfgFlag && token === noCfgFlag) {
            configPath = undefined;
            configDisabled = true;
        }
        else if (token === '--filter-output' && argv[i + 1]) {
            filterOutput = argv[i + 1];
            i++;
        }
        else if (token === '--token-limit' && argv[i + 1]) {
            const n = Number(argv[i + 1]);
            if (!Number.isFinite(n) || argv[i + 1].trim() === '')
                throw new ParseError({ message: `Invalid value for --token-limit: "${argv[i + 1]}"` });
            tokenLimit = n;
            i++;
        }
        else if (token === '--token-offset' && argv[i + 1]) {
            const n = Number(argv[i + 1]);
            if (!Number.isFinite(n) || argv[i + 1].trim() === '')
                throw new ParseError({ message: `Invalid value for --token-offset: "${argv[i + 1]}"` });
            tokenOffset = n;
            i++;
        }
        else if (token === '--token-count')
            tokenCount = true;
        else
            rest.push(token);
    }
    return {
        fullOutput,
        format,
        formatExplicit,
        configPath,
        configDisabled,
        filterOutput,
        tokenLimit,
        tokenOffset,
        tokenCount,
        llms,
        llmsFull,
        mcp,
        help,
        update,
        updateCheck,
        version,
        schema,
        rest,
    };
}
/** @internal Loads config-backed option defaults for the active command. */
async function loadCommandOptionDefaults(cli, path, options = {}) {
    if (options.configDisabled)
        return undefined;
    const { loader } = options;
    // Resolve the target file path
    let targetPath;
    if (options.configPath) {
        targetPath = resolveConfigPath(options.configPath);
    }
    else {
        const searchPaths = options.files ?? [`${cli}.json`];
        targetPath = await findFirstExisting(searchPaths);
    }
    // Load and parse the config
    let parsed;
    if (loader) {
        const result = await loader(targetPath);
        if (result === undefined)
            return undefined;
        if (!isRecord(result))
            throw new ParseError({ message: 'Config loader must return a plain object or undefined' });
        parsed = result;
    }
    else {
        if (!targetPath)
            return undefined;
        const result = await readJsonConfig(targetPath, !!options.configPath);
        if (!result)
            return undefined;
        parsed = result;
    }
    // Extract the command section from the config tree
    return extractCommandSection(parsed, cli, path);
}
/** @internal Resolves a config file path, expanding `~` to home dir. */
function resolveConfigPath(filePath) {
    if (filePath.startsWith('~/') || filePath === '~') {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return path.resolve(process.cwd(), filePath);
}
/** @internal Returns the first readable file from a list of paths, or `undefined`. */
async function findFirstExisting(paths) {
    for (const p of paths) {
        const resolved = resolveConfigPath(p);
        try {
            await fs.access(resolved, fs.constants.R_OK);
            return resolved;
        }
        catch { }
    }
    return undefined;
}
/** @internal Reads and parses a JSON config file. */
async function readJsonConfig(targetPath, explicit) {
    let raw;
    try {
        raw = await fs.readFile(targetPath, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            if (explicit)
                throw new ParseError({ message: `Config file not found: ${targetPath}` });
            return undefined;
        }
        throw error;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new ParseError({
            message: `Invalid JSON config file: ${targetPath}`,
            cause: error instanceof Error ? error : undefined,
        });
    }
    if (!isRecord(parsed))
        throw new ParseError({
            message: `Invalid config file: expected a top-level object in ${targetPath}`,
        });
    return parsed;
}
/** @internal Walks the nested config tree to extract option defaults for a command path. */
function extractCommandSection(parsed, cli, path) {
    const segments = path === cli ? [] : path.split(' ');
    let node = parsed;
    for (const seg of segments) {
        if (!isRecord(node))
            return undefined;
        const commands = node.commands;
        if (!isRecord(commands))
            return undefined;
        node = commands[seg];
        if (node === undefined)
            return undefined;
    }
    if (!isRecord(node))
        throw new ParseError({
            message: `Invalid config section for '${path}': expected an object`,
        });
    const options = node.options;
    if (options === undefined)
        return undefined;
    if (!isRecord(options))
        throw new ParseError({
            message: `Invalid config 'options' for '${path}': expected an object`,
        });
    return Object.keys(options).length > 0 ? options : undefined;
}
/** @internal Collects immediate child commands/groups for help output. */
function collectHelpCommands(commands) {
    const result = [];
    for (const [name, entry] of commands) {
        if (isAlias(entry))
            continue;
        result.push({ name, description: entry.description });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}
/** @internal Finds the index of a builtin command token in the filtered argv. Returns -1 if not found. */
function builtinIdx(filtered, cliName, builtin) {
    // e.g. `skills add` or `skill add`
    if (findBuiltin(filtered[0])?.name === builtin)
        return 0;
    // e.g. `my-cli skills add`
    if (filtered[0] === cliName && findBuiltin(filtered[1])?.name === builtin)
        return 1;
    // not a match
    return -1;
}
/** @internal Formats group-level help for a built-in command (e.g. `cli skills`). */
function formatBuiltinHelp(cli, builtin) {
    return Help.formatRoot(`${cli} ${builtin.name}`, {
        aliases: builtin.aliases,
        description: builtin.description,
        commands: builtin.subcommands?.map((s) => ({ name: s.name, description: s.description })),
    });
}
/** @internal Formats subcommand-level help for a built-in command (e.g. `cli skills add --help`). */
function formatBuiltinSubcommandHelp(cli, builtin, subName) {
    const sub = findBuiltinSubcommand(builtin, subName);
    return Help.formatCommand(`${cli} ${builtin.name} ${subName}`, {
        alias: sub?.alias,
        aliases: sub?.aliases,
        description: sub?.description,
        hideGlobalOptions: true,
        options: sub?.options,
    });
}
async function runMcpDoctor(name, commands, options) {
    const warnings = [];
    const errors = [];
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks = [];
    output.on('data', (chunk) => chunks.push(chunk.toString()));
    let serveError;
    const done = Mcp.serve(options.mcp?.name ?? name, options.version ?? '0.0.0', commands, {
        input,
        output,
        middlewares: options.middlewares,
        env: options.envSchema,
        vars: options.vars,
        version: options.version,
        ...(options.mcp?.instructions ? { instructions: options.mcp.instructions } : undefined),
        ...(options.mcp?.title ? { title: options.mcp.title } : undefined),
        tools: { ...options.mcp?.tools, discovery: 'direct' },
    }).catch((error) => {
        serveError = error;
    });
    let serveFinished = false;
    void done.finally(() => {
        serveFinished = true;
    });
    input.write(`${Json.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'incur-doctor', version: '1.0.0' },
        },
    })}\n`);
    input.write(`${Json.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    await waitForMcpDoctorResponses(chunks, () => serveFinished);
    input.end();
    await done;
    if (serveError)
        return {
            ok: false,
            toolCount: 0,
            tools: [],
            warnings,
            errors: [{ code: 'MCP_SERVER_FAILED', message: errorMessage(serveError) }],
        };
    let responses;
    try {
        responses = parseMcpDoctorResponses(chunks);
    }
    catch (error) {
        return {
            ok: false,
            toolCount: 0,
            tools: [],
            warnings,
            errors: [{ code: 'MCP_RESPONSE_PARSE_FAILED', message: errorMessage(error) }],
        };
    }
    const initialize = responses.find((response) => response.id === 1);
    if (!initialize)
        errors.push({ code: 'MCP_INITIALIZE_MISSING', message: 'Missing initialize response.' });
    else if (initialize.error)
        errors.push({ code: 'MCP_INITIALIZE_FAILED', message: mcpErrorMessage(initialize.error) });
    const toolsList = responses.find((response) => response.id === 2);
    let tools = [];
    if (!toolsList)
        errors.push({ code: 'MCP_TOOLS_LIST_MISSING', message: 'Missing tools/list response.' });
    else if (toolsList.error)
        errors.push({ code: 'MCP_TOOLS_LIST_FAILED', message: mcpErrorMessage(toolsList.error) });
    else if (!isRecord(toolsList.result) || !Array.isArray(toolsList.result.tools))
        errors.push({
            code: 'MCP_TOOLS_LIST_INVALID',
            message: 'tools/list did not return a tools array.',
        });
    else
        tools = toolsList.result.tools
            .filter(isRecord)
            .map((tool) => ({
            name: typeof tool.name === 'string' ? tool.name : '',
            ...(typeof tool.description === 'string' ? { description: tool.description } : undefined),
        }))
            .filter((tool) => tool.name);
    if (errors.length === 0 && tools.length === 0)
        warnings.push('No MCP tools exposed.');
    return {
        ok: errors.length === 0,
        toolCount: tools.length,
        tools,
        warnings,
        errors,
    };
}
async function waitForMcpDoctorResponses(chunks, finished) {
    const started = Date.now();
    while (!finished() && (chunks.join('').match(/\n/g)?.length ?? 0) < 2) {
        if (Date.now() - started >= 1_000)
            return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
function parseMcpDoctorResponses(chunks) {
    const responses = [];
    for (const line of chunks.join('').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const parsed = JSON.parse(trimmed);
        if (!isRecord(parsed))
            throw new Error('Expected JSON-RPC response object.');
        responses.push(parsed);
    }
    return responses;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function mcpErrorMessage(error) {
    if (isRecord(error) && typeof error.message === 'string')
        return error.message;
    return Json.stringify(error);
}
/** @internal Formats help text for a fetch gateway command. */
function formatFetchHelp(name, description) {
    const lines = [];
    if (description)
        lines.push(`${name} — ${description}`);
    else
        lines.push(name);
    lines.push('');
    lines.push(`Usage: ${name} <path> [options]`);
    lines.push('');
    lines.push('Path segments are joined into the request URL path.');
    lines.push('');
    lines.push('Options:');
    lines.push('  -X, --method <METHOD>     HTTP method (default: GET, POST if body present)');
    lines.push('  -H, --header "Key: Val"   Set a request header (repeatable)');
    lines.push('  -d, --data <json>          Request body (implies POST)');
    lines.push('      --body <json>          Request body (implies POST)');
    lines.push('  --<key> <value>            Query string parameter');
    return lines.join('\n');
}
async function resolveFsCommandsRoot(directory) {
    if (directory)
        return { directory: fileURLToPath(directory) };
    const entry = process.argv[1];
    if (!entry)
        throw new Error('Could not infer the filesystem command directory without an executed entrypoint. Pass a directory URL to `fs()`.');
    const resolved = path.resolve(entry);
    try {
        const real = await fs.realpath(resolved);
        return { directory: path.dirname(real), exclude: real };
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        return { directory: path.dirname(resolved), exclude: resolved };
    }
}
async function loadFsCommandRoutes(root) {
    const routes = await FsCommands.discover(root.directory, { exclude: root.exclude });
    return Promise.all(routes.map(async (route) => ({
        ...route,
        command: (await import(pathToFileURL(route.file).href)).default,
    })));
}
function isFileCommand(value) {
    return (typeof value === 'object' &&
        value !== null &&
        value[fileCommandSymbol] === true);
}
function mountFsCommand(commands, segments, command, source, globals) {
    let scope = commands;
    for (const [index, segment] of segments.entries()) {
        const final = index === segments.length - 1;
        const existing = scope.get(segment);
        if (final) {
            if (!existing)
                scope.set(segment, command);
            else if (isGroup(existing) && !existing.root) {
                existing.root = command;
                existing.description ??= command.description;
            }
            else
                throw fsCommandCollision(segments, source);
            assertNoGlobalOptionConflicts(segments.join(' '), command, globals);
            for (const alias of command.aliases ?? []) {
                if (scope.has(alias))
                    throw fsCommandCollision([...segments.slice(0, -1), alias], source);
                scope.set(alias, { _alias: true, target: segment });
            }
            return;
        }
        if (!existing) {
            const group = { _group: true, commands: new Map() };
            scope.set(segment, group);
            scope = group.commands;
            continue;
        }
        if (isAlias(existing) || isFetchGateway(existing))
            throw fsCommandCollision(segments, source);
        if (isGroup(existing)) {
            scope = existing.commands;
            continue;
        }
        const group = {
            _group: true,
            commands: new Map(),
            description: existing.description,
            root: existing,
        };
        scope.set(segment, group);
        scope = group.commands;
    }
}
function fsCommandCollision(segments, source) {
    return new Error(`Filesystem command '${segments.join(' ')}' from '${source}' conflicts with an existing command or alias.`);
}
function isFetchSource(value) {
    if (typeof value === 'function')
        return true;
    if (typeof value !== 'object' || value === null)
        return false;
    const source = value;
    return typeof source.fetch === 'function' && source.url instanceof URL;
}
function isMcpSourceDefinition(value) {
    if (typeof value !== 'object' || value === null || !('mcp' in value))
        return false;
    const source = value.mcp;
    if (typeof source === 'string' || source instanceof URL)
        return true;
    return typeof source === 'object' && source !== null && 'url' in source;
}
function resolveFetch(source) {
    if (typeof source === 'function')
        return source;
    return source.fetch;
}
function fetchBaseUrl(source) {
    return typeof source === 'function' ? undefined : source.url;
}
/** @internal Type guard for command groups. */
function isGroup(entry) {
    return '_group' in entry;
}
/** @internal Type guard for fetch gateways. */
function isFetchGateway(entry) {
    return '_fetch' in entry;
}
/** @internal Type guard for alias entries. */
function isAlias(entry) {
    return '_alias' in entry;
}
/** @internal Follows an alias entry to its canonical target. Returns the entry unchanged if not an alias. */
function resolveAlias(commands, entry) {
    if (isAlias(entry))
        return commands.get(entry.target);
    return entry;
}
/** @internal Validates command options against CLI-level global options. */
function assertNoGlobalOptionConflicts(path, entry, globals) {
    if (!globals || isFetchGateway(entry) || isAlias(entry))
        return;
    if (isGroup(entry)) {
        if (entry.root)
            assertNoGlobalOptionConflicts(path, entry.root, globals);
        for (const [name, child] of entry.commands)
            assertNoGlobalOptionConflicts(`${path} ${name}`, child, globals);
        return;
    }
    if (entry.options) {
        const globalKeys = Object.keys(globals.schema.shape);
        const optionKeys = Object.keys(entry.options.shape);
        for (const key of optionKeys) {
            if (globalKeys.includes(key))
                throw new Error(`Command '${path}' option '${key}' conflicts with a global option. Choose a different name.`);
        }
    }
    if (globals.alias && entry.alias) {
        const globalAliasValues = new Set(Object.values(globals.alias));
        for (const [name, short] of Object.entries(entry.alias)) {
            if (short && globalAliasValues.has(short))
                throw new Error(`Command '${path}' alias '-${short}' for '${name}' conflicts with a global alias. Choose a different alias.`);
        }
    }
}
/** @internal Maps CLI instances to their command maps. */
export const toCommands = new WeakMap();
/** @internal Maps CLI instances to asynchronous command registrations. */
export const toPending = new WeakMap();
/** @internal Maps CLI instances to their middleware arrays. */
const toMiddlewares = new WeakMap();
/** @internal Maps root CLI instances to their command definitions. */
export const toRootDefinition = new WeakMap();
/** @internal Maps CLI instances to their root options schema. */
export const toRootOptions = new WeakMap();
/** @internal Maps CLI instances to whether config file loading is enabled. */
export const toConfigEnabled = new WeakMap();
/** @internal Maps CLI instances to their output policy. */
const toOutputPolicy = new WeakMap();
/** @internal Maps CLI instances to their globals schema and alias map. */
const toGlobals = new WeakMap();
/** @internal Maps root CLI instances to their command aliases. */
const toRootAliases = new WeakMap();
/** @internal Sentinel symbol for `ok()` and `error()` return values. */
const sentinel = Symbol.for('incur.sentinel');
/** @internal Formats an error for human-readable TTY output. */
function formatHumanError(error) {
    const prefix = error.code === 'UNKNOWN' || error.code === 'COMMAND_NOT_FOUND'
        ? 'Error'
        : `Error (${error.code})`;
    let out = `${prefix}: ${error.message}`;
    if (error.fieldErrors)
        for (const fe of error.fieldErrors)
            out += `\n  ${fe.path}: ${fe.message}`;
    return out;
}
/** @internal Formats a CTA block for human-readable TTY output. */
function formatHumanCta(cta) {
    const lines = ['', cta.description];
    const maxLen = Math.max(...cta.commands.map((c) => c.command.length));
    for (const c of cta.commands) {
        const desc = c.description ? `  ${''.padEnd(maxLen - c.command.length)}# ${c.description}` : '';
        lines.push(`  ${c.command}${desc}`);
    }
    return lines.join('\n');
}
/** @internal Merges framework-generated CTA blocks while preserving the first description. */
function mergeFormattedCtas(...blocks) {
    const defined = blocks.filter((block) => block !== undefined);
    if (defined.length === 0)
        return undefined;
    return {
        description: defined[0].description,
        commands: defined.flatMap((block) => block.commands),
    };
}
/** @internal Type guard for sentinel results. */
function hasRequiredArgs(args) {
    return Object.values(args.shape).some((field) => field._zod.optout !== 'optional');
}
function isSentinel(value) {
    return typeof value === 'object' && value !== null && sentinel in value;
}
/** @internal Handles streaming output from an async generator `run` handler. */
async function handleStreaming(generator, ctx) {
    // Incremental: no explicit format (default toon), or explicit jsonl
    // Buffered: explicit json/yaml/toon/md
    const useJsonl = ctx.format === 'jsonl';
    const incremental = useJsonl || (!ctx.formatExplicit && ctx.format === 'toon');
    if (incremental) {
        // Incremental output: write each chunk as it arrives
        try {
            let returnValue;
            while (true) {
                const { value, done } = await generator.next();
                if (done) {
                    returnValue = value;
                    break;
                }
                if (isSentinel(value)) {
                    const tagged = value;
                    if (tagged[sentinel] === 'error') {
                        if (useJsonl)
                            ctx.writeln(JSON.stringify({
                                type: 'error',
                                ok: false,
                                error: {
                                    code: tagged.code,
                                    message: tagged.message,
                                    ...(tagged.retryable !== undefined
                                        ? { retryable: tagged.retryable }
                                        : undefined),
                                },
                            }));
                        else
                            ctx.writeln(formatHumanError({ code: tagged.code, message: tagged.message }));
                        ctx.exit(tagged.exitCode ?? 1);
                        return;
                    }
                }
                if (useJsonl)
                    ctx.writeln(Json.stringify({ type: 'chunk', data: value }));
                else if (ctx.renderOutput)
                    ctx.writeln(ctx.truncate(Formatter.format(value, ctx.format)).text);
            }
            // Handle return value — error() or ok() sentinel
            if (isSentinel(returnValue) && returnValue[sentinel] === 'error') {
                const err = returnValue;
                if (useJsonl)
                    ctx.writeln(JSON.stringify({
                        type: 'error',
                        ok: false,
                        error: {
                            code: err.code,
                            message: err.message,
                            ...(err.retryable !== undefined ? { retryable: err.retryable } : undefined),
                        },
                    }));
                else
                    ctx.writeln(formatHumanError({ code: err.code, message: err.message }));
                ctx.exit(err.exitCode ?? 1);
                return;
            }
            const cta = isSentinel(returnValue) && returnValue[sentinel] === 'ok'
                ? formatCtaBlock(ctx.name, returnValue.cta)
                : undefined;
            if (useJsonl)
                ctx.writeln(JSON.stringify({
                    type: 'done',
                    ok: true,
                    meta: {
                        command: ctx.path,
                        duration: `${Math.round(performance.now() - ctx.start)}ms`,
                        ...(cta ? { cta } : undefined),
                    },
                }));
            else if (cta)
                ctx.writeln(formatHumanCta(cta));
        }
        catch (error) {
            if (useJsonl)
                ctx.writeln(JSON.stringify({
                    type: 'error',
                    ok: false,
                    error: {
                        code: error instanceof IncurError ? error.code : 'UNKNOWN',
                        message: error instanceof Error ? error.message : String(error),
                        ...(error instanceof IncurError ? { retryable: error.retryable } : undefined),
                    },
                }));
            else
                ctx.writeln(formatHumanError({
                    code: 'UNKNOWN',
                    message: error instanceof Error ? error.message : String(error),
                }));
            ctx.exit(error instanceof IncurError ? (error.exitCode ?? 1) : 1);
        }
    }
    else {
        // Buffered output: collect all chunks, write as single value
        const chunks = [];
        try {
            let returnValue;
            while (true) {
                const { value, done } = await generator.next();
                if (done) {
                    returnValue = value;
                    break;
                }
                if (isSentinel(value)) {
                    const tagged = value;
                    if (tagged[sentinel] === 'error') {
                        ctx.write({
                            ok: false,
                            error: {
                                code: tagged.code,
                                message: tagged.message,
                                ...(tagged.retryable !== undefined ? { retryable: tagged.retryable } : undefined),
                            },
                            meta: {
                                command: ctx.path,
                                duration: `${Math.round(performance.now() - ctx.start)}ms`,
                            },
                        });
                        ctx.exit(tagged.exitCode ?? 1);
                        return;
                    }
                }
                chunks.push(value);
            }
            if (isSentinel(returnValue) && returnValue[sentinel] === 'error') {
                const err = returnValue;
                ctx.write({
                    ok: false,
                    error: {
                        code: err.code,
                        message: err.message,
                        ...(err.retryable !== undefined ? { retryable: err.retryable } : undefined),
                    },
                    meta: {
                        command: ctx.path,
                        duration: `${Math.round(performance.now() - ctx.start)}ms`,
                    },
                });
                ctx.exit(err.exitCode ?? 1);
                return;
            }
            const cta = isSentinel(returnValue) && returnValue[sentinel] === 'ok'
                ? formatCtaBlock(ctx.name, returnValue.cta)
                : undefined;
            ctx.write({
                ok: true,
                data: chunks,
                meta: {
                    command: ctx.path,
                    duration: `${Math.round(performance.now() - ctx.start)}ms`,
                    ...(cta ? { cta } : undefined),
                },
            });
        }
        catch (error) {
            ctx.write({
                ok: false,
                error: {
                    code: error instanceof IncurError ? error.code : 'UNKNOWN',
                    message: error instanceof Error ? error.message : String(error),
                    ...(error instanceof IncurError ? { retryable: error.retryable } : undefined),
                },
                meta: {
                    command: ctx.path,
                    duration: `${Math.round(performance.now() - ctx.start)}ms`,
                },
            });
            ctx.exit(error instanceof IncurError ? (error.exitCode ?? 1) : 1);
        }
    }
}
/** @internal Builds the `--llms` index manifest (name + description only) from the command tree. */
function buildIndexManifest(commands, prefix = [], globalsSchema, root) {
    const entries = collectIndexCommands(commands, prefix);
    if (root && prefix.length > 0)
        entries.push({
            name: prefix.join(' '),
            ...(root.description ? { description: root.description } : undefined),
        });
    return {
        version: 'incur.v1',
        commands: entries.sort((a, b) => a.name.localeCompare(b.name)),
        ...(globalsSchema ? { globals: Schema.toJsonSchema(globalsSchema) } : undefined),
    };
}
/** @internal Recursively collects leaf commands with name + description only. */
function collectIndexCommands(commands, prefix) {
    const result = [];
    for (const [name, entry] of commands) {
        if (isAlias(entry))
            continue;
        const path = [...prefix, name];
        if (isGroup(entry)) {
            if (entry.root) {
                const cmd = { name: path.join(' ') };
                if (entry.root.description)
                    cmd.description = entry.root.description;
                result.push(cmd);
            }
            result.push(...collectIndexCommands(entry.commands, path));
        }
        else {
            const cmd = { name: path.join(' ') };
            if (isFetchGateway(entry)) {
                if (entry.description)
                    cmd.description = entry.description;
            }
            else if (entry.description)
                cmd.description = entry.description;
            result.push(cmd);
        }
    }
    return result;
}
/** @internal Builds the `--llms` manifest from the command tree. */
function buildManifest(commands, prefix = [], globalsSchema, root) {
    const entries = collectCommands(commands, prefix);
    if (root && prefix.length > 0)
        entries.push(commandManifestEntry(prefix, root));
    return {
        version: 'incur.v1',
        commands: entries.sort((a, b) => a.name.localeCompare(b.name)),
        ...(globalsSchema ? { globals: Schema.toJsonSchema(globalsSchema) } : undefined),
    };
}
/** @internal Recursively collects leaf commands with their full paths. */
function collectCommands(commands, prefix) {
    const result = [];
    for (const [name, entry] of commands) {
        if (isAlias(entry))
            continue;
        const path = [...prefix, name];
        if (isFetchGateway(entry)) {
            const cmd = { name: path.join(' ') };
            if (entry.description)
                cmd.description = entry.description;
            result.push(cmd);
        }
        else if (isGroup(entry)) {
            if (entry.root)
                result.push(commandManifestEntry(path, entry.root));
            result.push(...collectCommands(entry.commands, path));
        }
        else {
            result.push(commandManifestEntry(path, entry));
        }
    }
    return result;
}
function commandManifestEntry(path, entry) {
    const cmd = { name: path.join(' ') };
    if (entry.description)
        cmd.description = entry.description;
    const inputSchema = buildInputSchema(entry.args, entry.env, entry.options);
    const outputSchema = entry.output ? Schema.toJsonSchema(entry.output) : undefined;
    if (inputSchema || outputSchema) {
        cmd.schema = {};
        if (inputSchema?.args)
            cmd.schema.args = inputSchema.args;
        if (inputSchema?.env)
            cmd.schema.env = inputSchema.env;
        if (inputSchema?.options)
            cmd.schema.options = inputSchema.options;
        if (outputSchema)
            cmd.schema.output = outputSchema;
    }
    const examples = formatExamples(entry.examples);
    if (examples) {
        const cmdName = path.join(' ');
        cmd.examples = examples.map((example) => ({
            ...example,
            command: example.command ? `${cmdName} ${example.command}` : cmdName,
        }));
    }
    return cmd;
}
/** @internal Recursively collects leaf commands as `Skill.CommandInfo` for `--llms --format md`. */
export function collectSkillCommands(commands, prefix, groups, rootCommand) {
    const result = [];
    if (rootCommand) {
        const cmd = {};
        if (rootCommand.description)
            cmd.description = rootCommand.description;
        if (rootCommand.args)
            cmd.args = rootCommand.args;
        if (rootCommand.env)
            cmd.env = rootCommand.env;
        if (rootCommand.hint)
            cmd.hint = rootCommand.hint;
        if (isDestructive(rootCommand))
            cmd.hint = appendDestructiveHint(cmd.hint);
        if (rootCommand.options)
            cmd.options = rootCommand.options;
        if (rootCommand.output)
            cmd.output = rootCommand.output;
        const examples = formatExamples(rootCommand.examples);
        if (examples)
            cmd.examples = examples;
        result.push(cmd);
    }
    for (const [name, entry] of commands) {
        if (isAlias(entry))
            continue;
        const path = [...prefix, name];
        if (isFetchGateway(entry)) {
            const cmd = { name: path.join(' ') };
            if (entry.description)
                cmd.description = entry.description;
            cmd.hint = 'Fetch gateway. Pass path segments and curl-style flags (-X, -H, -d, --key value).';
            result.push(cmd);
        }
        else if (isGroup(entry)) {
            if (entry.description)
                groups.set(path.join(' '), entry.description);
            if (entry.root)
                result.push(skillCommandEntry(path, entry.root));
            result.push(...collectSkillCommands(entry.commands, path, groups));
        }
        else {
            result.push(skillCommandEntry(path, entry));
        }
    }
    return result.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}
function skillCommandEntry(path, entry) {
    const cmd = { name: path.join(' ') };
    if (entry.description)
        cmd.description = entry.description;
    if (entry.args)
        cmd.args = entry.args;
    if (entry.env)
        cmd.env = entry.env;
    if (entry.hint)
        cmd.hint = entry.hint;
    if (isDestructive(entry))
        cmd.hint = appendDestructiveHint(cmd.hint);
    if (entry.options)
        cmd.options = entry.options;
    if (entry.output)
        cmd.output = entry.output;
    const examples = formatExamples(entry.examples);
    if (examples) {
        const name = path.join(' ');
        cmd.examples = examples.map((example) => ({
            ...example,
            command: example.command ? `${name} ${example.command}` : name,
        }));
    }
    return cmd;
}
function isDestructive(command) {
    return (command.destructive === true ||
        (command.mcp !== false && command.mcp?.annotations?.destructiveHint === true));
}
function appendDestructiveHint(hint) {
    if (!hint)
        return destructiveCommandHint;
    if (hint.includes(destructiveCommandHint))
        return hint;
    return `${hint} ${destructiveCommandHint}`;
}
/** @internal Formats examples into `{ command, description }` objects. `command` is the args/options suffix only. */
export function formatExamples(examples) {
    if (!examples || examples.length === 0)
        return undefined;
    return examples.map((ex) => {
        const parts = [];
        if (ex.args)
            for (const value of Object.values(ex.args))
                parts.push(String(value));
        if (ex.options)
            for (const [key, value] of Object.entries(ex.options))
                parts.push(`--${key} ${value}`);
        const result = { command: parts.join(' ') };
        if (ex.description)
            result.description = ex.description;
        return result;
    });
}
/** @internal Parses YAML frontmatter from generated skill Markdown. */
export function parseSkillFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match)
        return {};
    const meta = Yaml.loadSync().parse(match[1]);
    if (!meta || typeof meta !== 'object')
        return {};
    return meta;
}
/** @internal Builds separate args, env, and options JSON Schemas. */
function buildInputSchema(args, env, options) {
    if (!args && !env && !options)
        return undefined;
    const result = {};
    if (args)
        result.args = Schema.toJsonSchema(args);
    if (env)
        result.env = Schema.toJsonSchema(env);
    if (options)
        result.options = Schema.toJsonSchema(options);
    return result;
}
/** @internal Scans argv for deprecated flags and writes warnings to stderr. */
function emitDeprecationWarnings(argv, optionsSchema, alias) {
    if (!optionsSchema)
        return;
    const shape = optionsSchema.shape;
    const deprecatedFlags = new Set();
    const deprecatedShorts = new Map();
    for (const key of Object.keys(shape)) {
        const meta = shape[key]?.meta?.();
        if (meta?.deprecated) {
            const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
            deprecatedFlags.add(kebab);
            if (alias?.[key])
                deprecatedShorts.set(alias[key], kebab);
        }
    }
    if (deprecatedFlags.size === 0)
        return;
    for (const token of argv) {
        if (token.startsWith('--')) {
            const stripped = token.split('=')[0].slice(2);
            const raw = !deprecatedFlags.has(stripped) && stripped.startsWith('no-') ? stripped.slice(3) : stripped;
            if (deprecatedFlags.has(raw))
                process.stderr.write(`Warning: --${raw} is deprecated\n`);
        }
        else if (token.startsWith('-') && token.length >= 2) {
            for (const ch of token.slice(1))
                if (deprecatedShorts.has(ch))
                    process.stderr.write(`Warning: --${deprecatedShorts.get(ch)} is deprecated\n`);
        }
    }
}
/** @internal Resolves the display name from `process.argv[1]` basename. Returns the basename if it matches `name` or one of the `aliases`, otherwise falls back to `name`. */
function resolveDisplayName(name, aliases) {
    const bin = process.argv[1];
    if (!bin)
        return name;
    const basename = path.basename(bin);
    if (basename === name)
        return name;
    if (aliases?.includes(basename))
        return basename;
    return name;
}
//# sourceMappingURL=Cli.js.map