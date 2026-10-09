import { bufferedJsonParts, jsonParts } from "../domain/jsonSerialization.js";
/** Write ordinary JSON without constructing a document-sized string. */
export const writeJsonOutput = async (value, destination, format = "json") => {
    for (const part of bufferedJsonParts(documentParts(value, format)))
        await writePart(destination, part);
};
const writePart = (destination, part) => new Promise((resolve, reject) => {
    const onError = (cause) => reject(cause);
    destination.once("error", onError);
    try {
        destination.write(part, (cause) => {
            if (cause) {
                // A Writable can emit its error after invoking the write callback.
                setImmediate(() => destination.off("error", onError));
                reject(cause);
            }
            else {
                destination.off("error", onError);
                resolve();
            }
        });
    }
    catch (cause) {
        destination.off("error", onError);
        reject(cause);
    }
});
function* documentParts(value, format) {
    if (format === "jsonl" && Array.isArray(value)) {
        for (const item of value) {
            yield* jsonParts(item);
            yield "\n";
        }
        return;
    }
    yield* jsonParts(value, format === "json");
    yield "\n";
}
