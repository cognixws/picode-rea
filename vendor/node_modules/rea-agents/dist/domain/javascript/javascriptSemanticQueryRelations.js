const OWNERSHIP_RELATIONS = new Set([
    "acquires",
    "aggregates",
    "awaits",
    "chains",
    "connects-stdio",
    "creates-promise",
    "detaches-task",
    "owns",
    "releases",
    "returns-task",
    "spawns",
]);
/** Whether one relation participates in bidirectional ownership traversal. */
export const isJavaScriptSemanticOwnershipRelation = (relation) => OWNERSHIP_RELATIONS.has(relation);
