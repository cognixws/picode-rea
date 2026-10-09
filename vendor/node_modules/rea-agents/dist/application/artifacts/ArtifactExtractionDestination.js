import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
/** Choose a fresh temporary destination for an artifact extraction. */
export const createArtifactExtractionDestination = () => join(tmpdir(), `rea-extracted-${randomUUID()}`);
