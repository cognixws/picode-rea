import { completable, } from "@modelcontextprotocol/server";
import { z } from "zod";
import { PROMPT_CONTRACTS, renderGuidedPrompt, } from "../contracts/promptContracts.js";
import { createPromptCompletionSource, } from "./promptCompletion.js";
const promptValuesSchema = z.record(z.string(), z.string());
/** Register every guided workflow and its session-scoped argument completers. */
export const registerGuidedPrompts = (server, analysis, session) => {
    const completion = createPromptCompletionSource(analysis, session);
    const prompts = new Map();
    for (const contract of PROMPT_CONTRACTS)
        prompts.set(contract.name, registerPrompt(server, contract, completion));
    return {
        update(contract) {
            const prompt = prompts.get(contract.name);
            if (prompt === undefined)
                throw new RangeError(`Unknown guided prompt ${contract.name}`);
            const argsSchema = promptArgumentsSchema(contract, completion);
            prompt.update({
                title: contract.title,
                description: contract.description,
                argsSchema,
                callback: (arguments_) => promptResult(contract, arguments_),
            });
        },
    };
};
const registerPrompt = (server, contract, completion) => {
    const argsSchema = promptArgumentsSchema(contract, completion);
    return server.registerPrompt(contract.name, {
        title: contract.title,
        description: contract.description,
        argsSchema,
    }, (arguments_) => promptResult(contract, arguments_));
};
const promptArgumentsSchema = (contract, completion) => {
    const shape = {};
    for (const [name, argument] of Object.entries(contract.arguments))
        shape[name] = argumentSchema(argument, completion);
    return z.object(shape);
};
const argumentSchema = (argument, completion) => {
    const value = z
        .string()
        .min(1)
        .refine((value) => value.trim().length > 0)
        .describe(argument.description);
    const kind = argument.completion;
    const completed = kind === undefined
        ? value
        : completable(value, async (partial, context) => [
            ...(await completion.complete(kind, partial, context)),
        ]);
    return argument.required ? completed : completed.optional();
};
const promptResult = (contract, arguments_) => {
    const values = promptValuesSchema.parse(arguments_);
    for (const [name, argument] of Object.entries(contract.arguments))
        if (argument.required &&
            (values[name] === undefined || values[name]?.trim().length === 0))
            throw new TypeError(`Invalid arguments: ${name} must not be empty`);
    return {
        description: contract.description,
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: renderGuidedPrompt(contract, values),
                },
            },
        ],
    };
};
