import { WebModuleTraceService } from "../application/WebModuleTraceService.js";
import { LocalWebModuleArtifacts } from "../browser/modules/WebModuleArtifacts.js";
import { NativeModuleResolver } from "../browser/modules/NativeModuleResolver.js";
/** Assemble optional module tracing without acquiring a browser or reading files. */
export const createWebModuleTraceService = (environment = process.env) => new WebModuleTraceService(new LocalWebModuleArtifacts(), new NativeModuleResolver(environment));
