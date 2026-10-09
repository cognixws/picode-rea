import { CdpElectronProvider } from "../browser/CdpElectronProvider.js";
/** Construct a fresh provider without opening a target or acquiring an engine. */
export const createElectronObservationProvider = () => new CdpElectronProvider();
