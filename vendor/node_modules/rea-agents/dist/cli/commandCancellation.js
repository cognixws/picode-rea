/** Translate one-shot CLI interrupts into awaited cleanup and conventional exit codes. */
export const withCommandCancellation = async (operation, host = process) => {
    const controller = new AbortController();
    let exitCode;
    const interrupt = () => {
        exitCode ??= 130;
        controller.abort();
    };
    const terminate = () => {
        exitCode ??= 143;
        controller.abort();
    };
    host.on("SIGINT", interrupt);
    host.on("SIGTERM", terminate);
    try {
        return await operation(controller.signal);
    }
    finally {
        host.off("SIGINT", interrupt);
        host.off("SIGTERM", terminate);
        if (exitCode !== undefined)
            host.exitCode = exitCode;
    }
};
