import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// SAFETY: both pinned xterm packages publish CommonJS at runtime and matching declarations.
const HeadlessPackage = require("@xterm/headless");
// SAFETY: the addon package is pinned with the compatible headless xterm release.
const SerializePackage = require("@xterm/addon-serialize");
/**
 * Owns one headless terminal and serializes writes into deterministic frames.
 * Reconstructs bounded terminal states while raw PTY chunks remain authoritative.
 *
 * Rendered frames answer what an operator saw after control-sequence handling;
 * raw frames preserve byte/chunk differences that can render identically.
 * Comparisons retain both because neither representation subsumes the other.
 */
export class TerminalRenderer {
    options;
    #terminal;
    #serializeAddon = new SerializePackage.SerializeAddon();
    #frames = [];
    #pending = Promise.resolve();
    #capturedBytes = 0;
    #truncated = false;
    constructor(options) {
        this.options = options;
        this.#terminal = new HeadlessPackage.Terminal({
            allowProposedApi: true,
            cols: options.columns,
            rows: options.rows,
            scrollback: options.scrollback,
        });
        this.#terminal.loadAddon(this.#serializeAddon);
    }
    /** Queue one PTY chunk and capture state only after xterm has parsed it. */
    write(data, atMs) {
        this.#pending = this.#pending.then(() => new Promise((resolveWrite) => {
            this.#terminal.write(data, () => {
                this.#capture(atMs);
                resolveWrite();
            });
        }));
    }
    /** Queue a terminal resize after every preceding write. */
    resize(columns, rows, atMs) {
        this.#pending = this.#pending.then(() => {
            this.#terminal.resize(columns, rows);
            this.#capture(atMs);
        });
    }
    /** Await all queued parsing and return immutable rendered observations. */
    async frames() {
        await this.#pending;
        return structuredClone(this.#frames);
    }
    /** Whether a rendered observation exceeded its independent capture budget. */
    truncated() {
        return this.#truncated;
    }
    /** Release addon and terminal resources after all writes settle. */
    async dispose() {
        await this.#pending;
        this.#serializeAddon.dispose();
        this.#terminal.dispose();
    }
    #capture(atMs) {
        const buffer = this.#terminal.buffer.active;
        const lines = [];
        for (let row = 0; row < this.#terminal.rows; row += 1) {
            const line = buffer.getLine(buffer.viewportY + row);
            lines.push(this.options.normalize((line?.translateToString(false, 0, this.#terminal.cols) ?? "").padEnd(this.#terminal.cols, " ")));
        }
        const serializedState = this.options.normalize(this.#serializeAddon.serialize());
        const bytes = Buffer.byteLength(serializedState) +
            lines.reduce((total, line) => total + Buffer.byteLength(line), 0);
        if (this.#capturedBytes + bytes > this.options.maxBytes) {
            this.#truncated = true;
            return;
        }
        this.#capturedBytes += bytes;
        const sequence = this.#frames.length;
        this.#frames.push({
            sequence,
            at_ms: atMs,
            columns: this.#terminal.cols,
            rows: this.#terminal.rows,
            cursor_x: buffer.cursorX,
            cursor_y: buffer.cursorY,
            active_buffer: buffer.type,
            lines,
            serialized_state: serializedState,
        });
        this.options.recordEvent?.("rendered_frames", sequence);
    }
}
