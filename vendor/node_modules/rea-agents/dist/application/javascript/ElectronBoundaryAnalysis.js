import { compareCodePoints } from "../../domain/canonicalOrdering.js";
import { resolveArtifactPathByContext } from "./JavaScriptArtifactPathResolution.js";
/** Flatten all per-file IPC facts into deterministic application records. */
export const collectElectronIpcRecords = (analysis) => analysis.files
    .flatMap(({ file, javascript }) => (javascript?.electron.ipc ?? []).map((finding) => ({
    key: ipcRecordKey(file.path, finding),
    file,
    finding,
})))
    .sort((left, right) => compareCodePoints(left.key, right.key));
/** Match only exact literal channels and retain ambiguous matches separately. */
export const classifyElectronIpcPairings = (records) => {
    const handlers = records.filter(isMainHandler);
    return records.filter(isPairableRendererTransmission).map((transmission) => {
        const candidates = transmission.finding.channel === null
            ? []
            : handlers.filter((handler) => handler.finding.channel === transmission.finding.channel &&
                compatibleIpcModes(transmission.finding, handler.finding));
        return {
            transmission,
            candidates,
            status: candidates.length === 1
                ? "paired"
                : candidates.length > 1
                    ? "ambiguous"
                    : "unpaired",
        };
    });
};
/** Return only pairings supported by one unique literal main handler. */
export const unambiguousElectronIpcPairings = (records) => classifyElectronIpcPairings(records).flatMap((state) => {
    const handler = state.candidates[0];
    return state.status === "paired" && handler !== undefined
        ? [{ transmission: state.transmission, handler }]
        : [];
});
/** Summarize static Electron findings without treating gaps as absence. */
export const summarizeElectronBoundaries = (analysis) => {
    const files = new Map(analysis.files.map(({ file }) => [file.path, file]));
    const javascript = analysis.files.flatMap(({ javascript: value }) => value === null ? [] : [value]);
    const windows = javascript.flatMap(({ electron }) => electron.browser_windows);
    const bridges = javascript.flatMap(({ electron }) => electron.context_bridge_apis);
    const validations = javascript.flatMap(({ electron }) => electron.sender_validations);
    const utilities = analysis.files.flatMap(({ file, javascript: value }) => (value?.electron.utility_processes ?? []).map((finding) => ({
        file,
        finding,
    })));
    const nativeBindings = analysis.files.flatMap(({ file, javascript: value }) => (value?.electron.native_addon_bindings ?? []).map((finding) => ({
        file,
        finding,
    })));
    const ipc = collectElectronIpcRecords(analysis);
    const pairing = classifyElectronIpcPairings(ipc);
    const literalChannels = new Set(ipc.flatMap(({ finding }) => finding.channel === null ? [] : [finding.channel]));
    return {
        browser_windows: windows.length,
        explicit_web_preferences: windows.reduce((count, window) => count + window.web_preferences.length, 0),
        preload_entrypoints: windows.filter(({ preload_path: path }) => path !== null).length,
        context_bridge_apis: bridges.length,
        exposed_api_members: bridges.reduce((count, bridge) => count + bridge.members.length, 0),
        ipc: {
            operations: ipc.length,
            literal_channels: literalChannels.size,
            dynamic_channel_operations: ipc.filter(({ finding }) => finding.channel === null).length,
            renderer_transmissions: ipc.filter(isRendererTransmission).length,
            renderer_listeners: ipc.filter(({ finding }) => finding.side === "renderer" && finding.mode === "listen").length,
            main_handlers: ipc.filter(isMainHandler).length,
            paired_renderer_transmissions: pairing.filter(({ status }) => status === "paired").length,
            ambiguous_renderer_transmissions: pairing.filter(({ status }) => status === "ambiguous").length,
            unpaired_literal_renderer_transmissions: pairing.filter(({ status, transmission }) => status === "unpaired" && transmission.finding.channel !== null).length,
        },
        sender_validation_observations: validations.length,
        utility_processes: utilities.length,
        resolved_utility_entrypoints: utilities.filter(({ file, finding }) => finding.module_path !== null &&
            resolvesToFile({
                file,
                specifier: finding.module_path,
                context: finding.module_resolution_context,
                files,
            })).length,
        native_addon_bindings: nativeBindings.length,
        resolved_native_addon_bindings: nativeBindings.filter(({ file, finding }) => resolvesToFile({
            file,
            specifier: finding.specifier,
            context: "module-specifier",
            files,
            kind: "native-addon",
            moduleKind: finding.module_kind,
        })).length,
    };
};
const compatibleIpcModes = (transmission, handler) => transmission.mode === "invoke"
    ? handler.mode === "handle"
    : transmission.operation === "send-to-host"
        ? false
        : transmission.mode === "send" && handler.mode === "listen";
const isRendererTransmission = ({ finding }) => finding.side === "renderer" &&
    (finding.mode === "send" || finding.mode === "invoke");
const isPairableRendererTransmission = (record) => isRendererTransmission(record) && record.finding.operation !== "send-to-host";
const isMainHandler = ({ finding }) => finding.side === "main" &&
    (finding.mode === "listen" || finding.mode === "handle");
const resolvesToFile = (input) => {
    const resolved = resolveArtifactPathByContext({
        declaredPath: input.specifier,
        sourcePath: input.file.path,
        context: input.context,
        files: input.files,
        ...(input.moduleKind === undefined ? {} : { moduleKind: input.moduleKind }),
    }).resolved_path;
    return (resolved !== null &&
        (input.kind === undefined || input.files.get(resolved)?.kind === input.kind));
};
const ipcRecordKey = (path, finding) => `${path}\0${String(finding.location.start.line)}:${String(finding.location.start.column)}\0${finding.side}\0${finding.operation}`;
