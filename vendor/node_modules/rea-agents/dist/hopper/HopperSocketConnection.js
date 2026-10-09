import { createConnection } from "node:net";
import { HopperCancelledError, HopperStartError, } from "../domain/hopperErrors.js";
import { err, ok } from "../domain/result.js";
/** Open one abort-aware Hopper Unix-socket connection attempt. */
export const connectHopperSocketOnce = (socketPath, signal) => new Promise((resolve) => {
    const socket = createConnection(socketPath);
    const detach = () => {
        socket.off("connect", onConnect);
        socket.off("error", onError);
        signal.removeEventListener("abort", onAbort);
    };
    const onConnect = () => {
        detach();
        resolve(ok(socket));
    };
    const onError = (cause) => {
        detach();
        socket.destroy();
        resolve(err(new HopperStartError({ cause })));
    };
    const onAbort = () => {
        detach();
        socket.destroy();
        resolve(err(new HopperCancelledError()));
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted)
        onAbort();
});
