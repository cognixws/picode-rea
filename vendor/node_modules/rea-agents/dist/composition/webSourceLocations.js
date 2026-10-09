import { WebSourceLocationService } from "../application/WebSourceLocationService.js";
import { LocalWebSourceLocationArtifacts } from "../browser/assets/WebSourceLocationArtifacts.js";
import { SourceMapDecoder } from "../javascript/sourceMaps/SourceMapDecoder.js";
/** Compose local source/map analysis without import-time reads or process acquisition. */
export const createWebSourceLocationService = (environment = process.env) => new WebSourceLocationService(new LocalWebSourceLocationArtifacts(), new SourceMapDecoder({ environment }));
