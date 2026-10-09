/** @internal Formats a CTA block into the output metadata shape. */
export function formatCtaBlock(name, block) {
    if (!block || block.commands.length === 0)
        return undefined;
    return {
        description: block.description ??
            (block.commands.length === 1 ? 'Suggested command:' : 'Suggested commands:'),
        commands: block.commands.map((c) => formatCta(name, c)),
    };
}
/** @internal Renders a formatted CTA block as plain text for inline tool output. */
export function renderCtaText(block) {
    const lines = [block.description];
    for (const c of block.commands)
        lines.push(`  ${c.command}${c.description ? ` - ${c.description}` : ''}`);
    return lines.join('\n');
}
/** @internal Formats a CTA by prefixing the CLI name. */
function formatCta(name, cta) {
    if (typeof cta === 'string')
        return { command: `${name} ${cta}` };
    const prefix = cta.command === name || cta.command.startsWith(`${name} `) ? '' : `${name} `;
    let cmd = `${prefix}${cta.command}`;
    if (cta.args)
        for (const [key, value] of Object.entries(cta.args))
            cmd += value === true ? ` <${key}>` : ` ${value}`;
    if (cta.options)
        for (const [key, value] of Object.entries(cta.options))
            cmd += value === true ? ` --${key} <${key}>` : ` --${key} ${value}`;
    return { command: cmd, ...(cta.description ? { description: cta.description } : undefined) };
}
//# sourceMappingURL=cta.js.map