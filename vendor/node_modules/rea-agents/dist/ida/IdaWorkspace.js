import { createHash, randomUUID } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, normalize } from "node:path";
import { AnalysisProtocolError } from "../domain/analysisErrorCore.js";
import { PrivateRuntimeRoot } from "../process/PrivateRuntimeRoot.js";
/** Read a file digest with bounded memory rather than retaining binary bytes. */
export const idaFileDigest = async (path) => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path))
        hash.update(chunk);
    return hash.digest("hex");
};
/** Compare host-local paths without confusing Windows paths with POSIX coordinates. */
export const sameIdaHostPath = (left, right) => process.platform === "win32"
    ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right);
/** Private input copy isolates upstream database and sidecar writes from the original. */
export class IdaWorkspace {
    runtime;
    inputPath;
    sessionId = `rea-${randomUUID()}`;
    constructor(runtime, inputPath) {
        this.runtime = runtime;
        this.inputPath = inputPath;
    }
    /** Filesystem root owned exclusively by this headless session. */
    get directory() {
        return this.runtime.path;
    }
    /** Allocate a protected workspace and copy the admitted input with digest verification. */
    static async create(target, root = tmpdir()) {
        const runtime = await PrivateRuntimeRoot.create({
            parent: normalize(root),
            prefix: "rea-ida-",
        });
        const inputPath = join(runtime.path, basename(target.path));
        try {
            await copyFile(target.path, inputPath, constants.COPYFILE_EXCL);
            if ((await idaFileDigest(inputPath)) !== target.sha256)
                throw new AnalysisProtocolError("IDA target changed between admission and the private input copy; reopen the target.");
            return new IdaWorkspace(runtime, inputPath);
        }
        catch (cause) {
            await runtime.close();
            throw cause;
        }
    }
    /** Delete only this object's privately allocated directory after worker cleanup. */
    async remove() {
        await this.runtime.close();
    }
}
