import { MANAGED_WORKFLOW_TOOL_CONTRACTS } from "../../contracts/managed/managedWorkflowToolContracts.js";
export function managedWorkflowContract(name) {
    const found = MANAGED_WORKFLOW_TOOL_CONTRACTS.find((candidate) => candidate.name === name);
    if (found === undefined)
        throw new Error(`Missing ${name} contract`);
    return found;
}
