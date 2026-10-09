import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const extensions = ['.cts', '.cjs', '.mts', '.mjs', '.ts', '.js'];
const segmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** @internal Global key shared by generated standalone entrypoints and the runtime loader. */
export const manifestKey = 'incur.fs.manifests';
/** @internal Discovers command module files below a directory. */
export async function discover(directory, options = {}) {
    const routes = [];
    const exclude = options.exclude ? path.resolve(options.exclude) : undefined;
    async function walk(current, prefix) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name.startsWith('_'))
                continue;
            const target = path.join(current, entry.name);
            if (entry.isDirectory()) {
                assertSegment(entry.name, target);
                await walk(target, [...prefix, entry.name]);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (target === exclude)
                continue;
            const extension = extensions.find((candidate) => entry.name.endsWith(candidate));
            if (!extension)
                continue;
            const stem = entry.name.slice(0, -extension.length);
            if (stem.endsWith('.d') ||
                stem.endsWith('.test') ||
                stem.endsWith('.test-d') ||
                stem.endsWith('.spec'))
                continue;
            if (stem === 'index') {
                if (prefix.length > 0)
                    routes.push({ file: target, segments: prefix });
                continue;
            }
            assertSegment(stem, target);
            routes.push({ file: target, segments: [...prefix, stem] });
        }
    }
    await walk(directory, []);
    const seen = new Map();
    for (const route of routes) {
        const name = route.segments.join(' ');
        const existing = seen.get(name);
        if (existing)
            throw new Error(`Duplicate filesystem command '${name}' from '${existing}' and '${route.file}'.`);
        seen.set(name, route.file);
    }
    return routes;
}
/** @internal Consumes the next manifest embedded by a standalone build. */
export function consumeManifest() {
    const global = globalThis;
    const manifests = global[Symbol.for(manifestKey)];
    return manifests?.shift();
}
/** @internal Loads commands deferred by a standalone build manifest. */
export async function loadManifest(routes) {
    return Promise.all(routes.map(async ({ load, ...route }) => ({
        ...route,
        command: await load(),
    })));
}
function assertSegment(segment, source) {
    if (segmentPattern.test(segment))
        return;
    throw new Error(`Invalid filesystem command segment '${segment}' from '${source}'. Use lowercase kebab-case names.`);
}
//# sourceMappingURL=fsCommands.js.map