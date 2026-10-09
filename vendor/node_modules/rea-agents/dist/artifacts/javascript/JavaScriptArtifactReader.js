import { AsarArtifactReader } from "../AsarArtifactReader.js";
import { DirectoryArtifactReader } from "../DirectoryArtifactReader.js";
/** Create the reader for an admitted JavaScript artifact format. */
export const createJavaScriptArtifactReader = (path, format) => format === "asar"
    ? new AsarArtifactReader(path)
    : new DirectoryArtifactReader(path);
