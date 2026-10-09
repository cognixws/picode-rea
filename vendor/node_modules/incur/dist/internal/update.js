import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { globalInstall } from './pm.js';
const defaultInterval = 24 * 60 * 60 * 1_000;
/** @internal Hidden flag used by detached update checks. */
export const checkFlag = '--incur-update-check';
/** @internal Returns a cached available update and schedules a detached refresh when needed. */
export function check(name, options = {}) {
    if (notificationsDisabled())
        return undefined;
    const provider = resolveProvider(name, options);
    if (!provider?.check || !provider.current)
        return undefined;
    const file = cachePath(provider.key);
    const cached = readCache(file);
    const checkedAt = Date.now();
    const interval = Math.max(0, options.interval ?? defaultInterval);
    if (!cached || checkedAt - cached.checkedAt >= interval)
        scheduleRefresh(file, checkedAt, cached?.latest, options.binary);
    if (!cached?.latest || !isNewerVersion(cached.latest, provider.current))
        return undefined;
    return {
        current: provider.current,
        latest: cached.latest,
        name: provider.name,
    };
}
/** @internal Refreshes the cached latest version through the configured provider. */
export async function refresh(name, options = {}) {
    const provider = resolveProvider(name, options);
    if (!provider?.check || !provider.current)
        return;
    const latest = await provider.check({
        current: provider.current,
        name,
        ...(provider.package ? { package: provider.package } : undefined),
    });
    if (!latest || !parseVersion(latest))
        return;
    writeCache(cachePath(provider.key), { checkedAt: Date.now(), latest });
}
/** @internal Installs the latest CLI version through the configured provider. */
export async function install(name, options = {}) {
    const provider = resolveProvider(name, options);
    if (!provider?.install)
        throw new Error(`No update installer is configured for '${name}'.`);
    const cached = readCache(cachePath(provider.key));
    await provider.install({
        ...(provider.current ? { current: provider.current } : undefined),
        ...(cached?.latest ? { latest: cached.latest } : undefined),
        name,
        ...(provider.package ? { package: provider.package } : undefined),
    });
    return {
        ...(provider.command ? { command: provider.command } : undefined),
        ...(provider.deferred ? { deferred: true } : undefined),
        name: provider.name,
    };
}
/** @internal Returns whether `candidate` is a newer semantic version than `current`. */
export function isNewerVersion(candidate, current) {
    const candidateVersion = parseVersion(candidate);
    const currentVersion = parseVersion(current);
    if (!candidateVersion || !currentVersion)
        return false;
    for (const key of ['major', 'minor', 'patch']) {
        if (candidateVersion[key] > currentVersion[key])
            return true;
        if (candidateVersion[key] < currentVersion[key])
            return false;
    }
    const candidatePrerelease = candidateVersion.prerelease;
    const currentPrerelease = currentVersion.prerelease;
    if (candidatePrerelease.length === 0)
        return currentPrerelease.length > 0;
    if (currentPrerelease.length === 0)
        return false;
    const length = Math.max(candidatePrerelease.length, currentPrerelease.length);
    for (let index = 0; index < length; index++) {
        const candidatePart = candidatePrerelease[index];
        const currentPart = currentPrerelease[index];
        if (candidatePart === undefined)
            return false;
        if (currentPart === undefined)
            return true;
        if (candidatePart === currentPart)
            continue;
        if (typeof candidatePart === 'bigint' && typeof currentPart === 'string')
            return false;
        if (typeof candidatePart === 'string' && typeof currentPart === 'bigint')
            return true;
        return candidatePart > currentPart;
    }
    return false;
}
/** @internal Resolves package defaults and custom provider overrides. */
function resolveProvider(name, options) {
    const executing = resolvePackage(name);
    const packageName = options.package ?? executing?.name;
    if (packageName && !isPackageName(packageName))
        return undefined;
    const current = options.version ?? executing?.version;
    const invocation = packageName ? globalInstall(packageName) : undefined;
    const check = options.check ??
        (packageName
            ? () => {
                return fetchLatest(packageName);
            }
            : undefined);
    const install = options.install ??
        (invocation
            ? () => {
                return exec(invocation.command, invocation.args);
            }
            : undefined);
    if (!check && !install)
        return undefined;
    return {
        ...(check ? { check } : undefined),
        ...(invocation && !options.install
            ? { command: `${invocation.command} ${invocation.args.join(' ')}` }
            : undefined),
        ...(current ? { current } : undefined),
        ...(options.deferred ? { deferred: true } : undefined),
        ...(install ? { install } : undefined),
        key: packageName ?? name,
        name: packageName ?? name,
        ...(packageName ? { package: packageName } : undefined),
    };
}
/** @internal Resolves the npm package containing the executing binary. */
function resolvePackage(name) {
    const entry = (() => {
        if (!process.argv[1])
            return undefined;
        try {
            return fs.realpathSync(process.argv[1]);
        }
        catch {
            return undefined;
        }
    })();
    if (!entry)
        return undefined;
    let directory = path.dirname(entry);
    while (true) {
        try {
            const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
            if (typeof metadata.name === 'string' &&
                typeof metadata.version === 'string' &&
                providesCli(metadata, name))
                return { name: metadata.name, version: metadata.version };
        }
        catch { }
        const parent = path.dirname(directory);
        if (parent === directory)
            return undefined;
        directory = parent;
    }
}
/** @internal Returns whether package metadata declares the configured CLI name. */
function providesCli(metadata, name) {
    if (metadata.name === name)
        return true;
    if (typeof metadata.bin === 'object' && metadata.bin !== null && name in metadata.bin)
        return true;
    if (typeof metadata.bin !== 'string' || typeof metadata.name !== 'string')
        return false;
    return metadata.name.split('/').pop() === name;
}
/** @internal Fetches the latest npm package version. */
async function fetchLatest(packageName) {
    const registry = process.env.npm_config_registry || 'https://registry.npmjs.org';
    const base = registry.endsWith('/') ? registry : `${registry}/`;
    const response = await fetch(new URL(encodeURIComponent(packageName), base), {
        headers: {
            accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
        return undefined;
    const metadata = (await response.json());
    const latest = metadata['dist-tags']?.latest;
    return typeof latest === 'string' ? latest : undefined;
}
/** @internal Parses a semantic version into precedence components. */
function parseVersion(version) {
    const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
    if (!match)
        return undefined;
    const prerelease = [];
    for (const identifier of match[4]?.split('.') ?? []) {
        if (!/^\d+$/.test(identifier)) {
            prerelease.push(identifier);
            continue;
        }
        if (identifier.length > 1 && identifier.startsWith('0'))
            return undefined;
        prerelease.push(BigInt(identifier));
    }
    return {
        major: BigInt(match[1]),
        minor: BigInt(match[2]),
        patch: BigInt(match[3]),
        prerelease,
    };
}
/** @internal Returns whether a package name is safe to place in an install command. */
function isPackageName(name) {
    return /^(?:@[A-Za-z0-9][A-Za-z0-9._~-]*\/)?[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(name);
}
/** @internal Returns the update cache path for a provider. */
function cachePath(key) {
    const root = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    return path.join(root, 'incur', 'updates', `${encodeURIComponent(key)}.json`);
}
/** @internal Reads cached update metadata. */
function readCache(file) {
    try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof value.checkedAt !== 'number')
            return undefined;
        if (value.latest !== undefined && typeof value.latest !== 'string')
            return undefined;
        return value;
    }
    catch {
        return undefined;
    }
}
/** @internal Writes cached update metadata. */
function writeCache(file, cache) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cache) + '\n');
}
/** @internal Marks a check and starts a detached self-invocation to refresh it. */
function scheduleRefresh(file, checkedAt, latest, binary) {
    const invocation = selfInvocation(binary);
    if (!invocation)
        return;
    try {
        writeCache(file, { checkedAt, ...(latest ? { latest } : undefined) });
        const child = childProcess.spawn(invocation.command, invocation.args, {
            detached: true,
            stdio: 'ignore',
        });
        child.once('error', () => { });
        child.unref();
    }
    catch { }
}
/** @internal Resolves how the current CLI can invoke itself. */
function selfInvocation(binary) {
    if (binary)
        return { args: [checkFlag], command: process.execPath };
    const entry = process.argv[1];
    if (!entry)
        return undefined;
    if (entry.startsWith('/$bunfs/'))
        return { args: [checkFlag], command: process.execPath };
    try {
        if (fs.realpathSync(entry) === fs.realpathSync(process.execPath))
            return { args: [checkFlag], command: process.execPath };
    }
    catch { }
    return {
        args: [...process.execArgv, entry, checkFlag],
        command: process.execPath,
    };
}
/** @internal Runs a package-manager command and surfaces its useful error output. */
function exec(command, args) {
    return new Promise((resolve, reject) => {
        childProcess.execFile(command, args, (error, stdout, stderr) => {
            if (!error)
                return resolve();
            reject(new Error(stderr.trim() || stdout.trim() || error.message));
        });
    });
}
/** @internal Returns whether the environment suppresses update notifications. */
function notificationsDisabled() {
    if (process.env.NO_UPDATE_NOTIFIER)
        return true;
    if (process.env.npm_config_update_notifier === 'false')
        return true;
    return Boolean(process.env.CI && process.env.CI !== 'false');
}
//# sourceMappingURL=update.js.map