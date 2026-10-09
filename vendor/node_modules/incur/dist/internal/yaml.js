import { createRequire } from 'node:module';
/** @internal Cached `yaml` module, shared by `load()` and `loadSync()`. */
let cached;
/** Loads the `yaml` module on demand, so runs that never touch YAML don't pay its startup cost. */
export async function load() {
    cached ??= await import('yaml');
    return cached;
}
/**
 * Synchronous variant of `load()` for sync call paths (e.g. `Formatter.format`).
 *
 * Falls back to `require` when `load()` hasn't run yet. Async paths should call `load()`
 * first so environments without synchronous module resolution (e.g. compiled binaries,
 * bundled workers) never hit the fallback.
 */
export function loadSync() {
    cached ??= createRequire(import.meta.url)('yaml');
    return cached;
}
//# sourceMappingURL=yaml.js.map