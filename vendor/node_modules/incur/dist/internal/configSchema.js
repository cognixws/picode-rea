import fs from 'node:fs/promises';
import * as Cli from '../Cli.js';
import * as Schema from '../Schema.js';
import { importCli } from './utils.js';
/** Returns `true` if the CLI has `config` enabled on `Cli.create()`. */
export function hasConfig(cli) {
    return Cli.toConfigEnabled.get(cli) === true;
}
/** Imports a CLI from `input` (must `export default` a `Cli`), generates the JSON Schema, and writes it to `output`. */
export async function generate(input, output) {
    const cli = await importCli(input);
    await fs.writeFile(output, JSON.stringify(fromCli(cli), null, 2) + '\n');
}
/** Generates a JSON Schema describing the config file structure for a CLI. */
export function fromCli(cli) {
    const commands = Cli.toCommands.get(cli);
    if (!commands)
        return { type: 'object' };
    const rootOptions = Cli.toRootOptions.get(cli);
    const node = buildNode(commands, rootOptions);
    const properties = (node.properties ?? {});
    properties.$schema = { type: 'string' };
    node.properties = properties;
    return node;
}
/** Builds a JSON Schema node for a command level. */
function buildNode(commands, options) {
    const properties = {};
    // Add `options` property from the options schema
    if (options) {
        const optSchema = Schema.toJsonSchema(options);
        const props = optSchema.properties;
        if (props && Object.keys(props).length > 0)
            properties.options = { type: 'object', additionalProperties: false, properties: props };
    }
    // Add `commands` property with subcommand namespaces
    const commandProps = {};
    for (const [name, entry] of commands) {
        if ('_group' in entry && entry._group) {
            commandProps[name] = buildNode(entry.commands, entry.root?.options);
        }
        else if (!('_fetch' in entry)) {
            const cmd = entry;
            commandProps[name] = buildNode(new Map(), cmd.options);
        }
    }
    if (Object.keys(commandProps).length > 0)
        properties.commands = { type: 'object', additionalProperties: false, properties: commandProps };
    const node = {
        type: 'object',
        additionalProperties: false,
    };
    if (Object.keys(properties).length > 0)
        node.properties = properties;
    return node;
}
//# sourceMappingURL=configSchema.js.map