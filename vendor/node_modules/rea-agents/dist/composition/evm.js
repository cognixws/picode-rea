import { EvmInterfaceService } from "../application/evm/EvmInterfaceService.js";
import { EvmoleInterfaceProvider } from "../evm/EvmoleInterfaceProvider.js";
/** Compose offline interface analysis without import-time I/O or dependency acquisition. */
export const createEvmInterfaceService = (environment = process.env) => new EvmInterfaceService(new EvmoleInterfaceProvider(environment));
