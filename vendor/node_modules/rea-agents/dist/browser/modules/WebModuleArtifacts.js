import { jsonObjectSchema } from "../../domain/jsonValue.js";
import { err, ok } from "../../domain/result.js";
import { LocalWebScriptArtifacts } from "../assets/LocalWebScriptArtifacts.js";
import { readWebArtifactJson, webArtifactReadError, } from "../assets/WebArtifactReads.js";
/** Add an explicitly selected import map to a verified captured-script source. */
export class LocalWebModuleArtifacts {
    scripts;
    constructor(scripts = new LocalWebScriptArtifacts("trace_web_module_imports")) {
        this.scripts = scripts;
    }
    /** Read selected source and optional map without website requests. */
    async load(input, options) {
        const loaded = await this.scripts.load(input, options);
        if (!loaded.ok)
            return loaded;
        if (input.import_map === undefined)
            return ok({ ...loaded.value, importMap: null });
        const selected = input.import_map;
        try {
            const data = await readWebArtifactJson(selected.path, 4 * 1024 * 1024, options?.signal);
            const importMap = {
                file: {
                    path: selected.path,
                    sha256: data.sha256,
                    bytes: data.bytes.length,
                },
                baseUrl: selected.base_url,
                value: jsonObjectSchema.parse(data.value),
            };
            return ok({ ...loaded.value, importMap });
        }
        catch (cause) {
            return err(webArtifactReadError(cause, {
                operation: "trace_web_module_imports",
                field: ["import_map", "path"],
                targetPath: selected.path,
            }, options?.signal));
        }
    }
}
