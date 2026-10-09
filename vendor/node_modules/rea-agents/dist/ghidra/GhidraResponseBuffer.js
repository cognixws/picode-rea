/** Splits fragmented UTF-8 socket data into response lines. */
export class GhidraResponseBuffer {
    #options;
    #buffer = "";
    #fragments = [];
    constructor(options) {
        this.#options = options;
    }
    /** Consume one decoded socket chunk. */
    push(chunk) {
        this.#fragments.push(chunk);
        if (!chunk.includes("\n"))
            return;
        this.#buffer += this.#fragments.join("");
        this.#fragments = [];
        let newline = this.#buffer.indexOf("\n");
        while (newline >= 0) {
            const encodedLine = this.#buffer.slice(0, newline);
            this.#buffer = this.#buffer.slice(newline + 1);
            const line = encodedLine.trim();
            if (line.length > 0)
                this.#options.onLine(line);
            newline = this.#buffer.indexOf("\n");
        }
    }
    /** Drop any incomplete line when a session closes. */
    reset() {
        this.#buffer = "";
        this.#fragments = [];
    }
}
