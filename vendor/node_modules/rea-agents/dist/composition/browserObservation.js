import { CdpBrowserProvider } from "../browser/CdpBrowserProvider.js";
/** Construct a fresh provider without opening a target or acquiring an engine. */
export const createBrowserObservationProvider = () => new CdpBrowserProvider();
