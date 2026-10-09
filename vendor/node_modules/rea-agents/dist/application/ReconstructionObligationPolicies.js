const APPLICATION_NODE_POLICIES = {
    package: policy("packaging", "package-lifecycle", "packaged-process", [
        "positive",
        "negative",
        "teardown",
    ]),
    installer: policy("packaging", "installer", "packaged-process", [
        "positive",
        "negative",
        "teardown",
    ]),
    "context-bridge-api": policy("electron", "context-bridge", "renderer", [
        "positive",
        "negative",
        "malformed",
    ]),
    "ipc-channel": policy("electron", "ipc", "renderer", [
        "positive",
        "negative",
        "malformed",
    ]),
    "ipc-handler": policy("electron", "ipc", "renderer", [
        "positive",
        "negative",
        "malformed",
    ]),
    endpoint: policy("protocol", "endpoint", "protocol", [
        "positive",
        "negative",
        "malformed",
    ]),
    storage: policy("persistence", "persistence", "integration", [
        "positive",
        "negative",
        "malformed",
    ]),
    worker: policy("process", "worker-lifecycle", "packaged-process", [
        "positive",
        "cancellation",
        "teardown",
    ]),
    "service-worker": policy("process", "worker-lifecycle", "packaged-process", [
        "positive",
        "cancellation",
        "teardown",
    ]),
    "native-addon": nativePolicy("native-addon"),
    "native-export": nativePolicy("native-export"),
    "managed-pinvoke-import": nativePolicy("managed-pinvoke"),
    "managed-native-implementation": nativePolicy("managed-native"),
};
const SEMANTIC_NODE_POLICIES = {
    "child-process": policy("process", "child-process", "packaged-process", [
        "positive",
        "negative",
        "cancellation",
        "teardown",
    ]),
    stdio: policy("process", "stdio", "packaged-process", [
        "positive",
        "negative",
        "teardown",
    ]),
    signal: policy("process", "signal", "packaged-process", [
        "positive",
        "cancellation",
        "teardown",
    ]),
    "config-source": parserPolicy("cli", "configuration", "integration"),
    request: parserPolicy("protocol", "request", "protocol"),
    response: parserPolicy("protocol", "response", "protocol"),
    boundary: parserPolicy("application", "parser-boundary", "integration"),
    resource: policy("persistence", "resource-lifecycle", "integration", [
        "positive",
        "negative",
        "teardown",
    ]),
    event: policy("runtime", "event", "packaged-process", [
        "positive",
        "negative",
        "cancellation",
    ]),
    timer: policy("runtime", "timer", "packaged-process", [
        "positive",
        "cancellation",
        "teardown",
    ]),
    promise: policy("runtime", "promise-ownership", "packaged-process", [
        "positive",
        "negative",
        "cancellation",
    ]),
    task: policy("runtime", "task-lifecycle", "packaged-process", [
        "positive",
        "cancellation",
        "teardown",
    ]),
};
export const applicationObligationPolicy = (nodeKind) => APPLICATION_NODE_POLICIES[nodeKind];
export const semanticObligationPolicy = (nodeKind) => SEMANTIC_NODE_POLICIES[nodeKind];
function policy(applicationLayer, family, authority, cases) {
    return {
        applicationLayer,
        family,
        fixtureAuthority: authority,
        verifierAuthority: authority,
        originalAuthority: "runtime",
        cases,
        requiresParserType: false,
    };
}
function parserPolicy(applicationLayer, family, authority) {
    return {
        ...policy(applicationLayer, family, authority, [
            "positive",
            "negative",
            "malformed",
        ]),
        requiresParserType: true,
    };
}
function nativePolicy(family) {
    return {
        applicationLayer: "native-abi",
        family,
        fixtureAuthority: "native-abi",
        verifierAuthority: "native-abi",
        originalAuthority: "static",
        cases: ["positive", "negative"],
        requiresParserType: false,
    };
}
