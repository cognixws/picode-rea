import { parse } from "@babel/parser";
/** Parse JavaScript or TypeScript once without attaching comments to AST nodes. */
export const parseJavaScriptSource = (source, sourcePath) => {
    try {
        return parse(source, {
            sourceType: "unambiguous",
            errorRecovery: true,
            attachComment: false,
            // "decorators-legacy" admits both the standard and the legacy decorator
            // forms, including parameter decorators. Without it a decorated
            // TypeScript source fails to parse at all rather than reporting
            // recovered syntax, which loses every fact derived from that source.
            // Plain .ts artifacts admit angle-bracket type assertions instead of JSX.
            // Unknown paths retain the existing JSX-capable parser contract.
            plugins: sourcePath?.toLowerCase().endsWith(".ts") === true
                ? ["decorators-legacy", "typescript"]
                : ["decorators-legacy", "jsx", "typescript"],
        });
    }
    catch (cause) {
        // Unparseable source is represented by the null return.
        void cause;
        return null;
    }
};
