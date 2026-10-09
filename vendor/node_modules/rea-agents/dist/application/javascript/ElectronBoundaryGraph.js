import { addElectronIpcBoundaries } from "./ElectronBoundaryGraphIpc.js";
import { addElectronNativeBoundaries } from "./ElectronBoundaryGraphNative.js";
import { addElectronWindowBoundaries } from "./ElectronBoundaryGraphWindows.js";
/** Add every static Electron process and security-boundary fact to the JAG. */
export const addElectronBoundaries = (context) => {
    addElectronWindowBoundaries(context);
    addElectronIpcBoundaries(context);
    addElectronNativeBoundaries(context);
};
