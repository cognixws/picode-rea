import { createHash } from "node:crypto";
import { sanitizeBrowserUrl, } from "../domain/browserObservation.js";
const REDACTION_PREFIX = "[REDACTED:";
const encodedSecretValues = (secret) => new Set([
    secret,
    encodeURIComponent(secret),
    new URLSearchParams([["value", secret]]).toString().slice("value=".length),
]);
/** Resolved secret values kept only for one in-memory scenario session. */
export class BrowserScenarioSecrets {
    values;
    constructor(values) {
        this.values = values;
    }
    static resolve(scenario, environment) {
        const values = new Map();
        for (const declaration of scenario.secrets) {
            const value = environment[declaration.environment_variable];
            if (!Object.hasOwn(environment, declaration.environment_variable) ||
                typeof value !== "string")
                return undefined;
            values.set(declaration.secret_id, value);
        }
        return new BrowserScenarioSecrets(values);
    }
    value(source) {
        if (source.source === "literal")
            return source.value;
        const value = this.values.get(source.secret_id);
        if (value === undefined)
            throw new Error("Validated browser secret was not resolved");
        return value;
    }
    url(destination) {
        const url = new URL(destination.url);
        for (const { name, value } of destination.query)
            url.searchParams.append(name, this.value(value));
        return url.href;
    }
    redact(value) {
        let output = value;
        const replacements = [...this.values].sort(([leftId, left], [rightId, right]) => right.length - left.length ||
            (leftId < rightId ? -1 : leftId > rightId ? 1 : 0));
        for (const [id, secret] of replacements)
            if (secret !== "")
                output = output.replaceAll(secret, `${REDACTION_PREFIX}${id}]`);
        return output;
    }
    /** Replace declared UTF-8, URI/form, and JSON-escaped secrets without decoding binary data. */
    redactBytes(value) {
        const candidates = [...this.values]
            .flatMap(([id, secret]) => {
            if (secret === "")
                return [];
            return [
                ...new Set([
                    ...encodedSecretValues(secret),
                    JSON.stringify(secret).slice(1, -1),
                ]),
            ].map((text) => {
                const needle = Buffer.from(text);
                return {
                    id,
                    needle,
                    marker: Buffer.from(`${REDACTION_PREFIX}${id}]`),
                    index: value.indexOf(needle),
                };
            });
        })
            .sort((left, right) => right.needle.length - left.needle.length ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
        const parts = [];
        let offset = 0;
        while (true) {
            let next;
            for (const candidate of candidates) {
                if (candidate.index >= 0 && candidate.index < offset)
                    candidate.index = value.indexOf(candidate.needle, offset);
                if (candidate.index >= 0 &&
                    (next === undefined || candidate.index < next.index))
                    next = candidate;
            }
            if (next === undefined)
                break;
            parts.push(value.subarray(offset, next.index), next.marker);
            offset = next.index + next.needle.length;
        }
        if (parts.length === 0)
            return value;
        parts.push(value.subarray(offset));
        return Buffer.concat(parts);
    }
    /** Remove only declared secret values from one URL and report that action. */
    sanitizeUrl(value) {
        let output = value;
        const replacements = [...this.values].sort(([leftId, left], [rightId, right]) => right.length - left.length ||
            (leftId < rightId ? -1 : leftId > rightId ? 1 : 0));
        for (const [id, secret] of replacements) {
            if (secret === "")
                continue;
            const marker = `${REDACTION_PREFIX}${id}]`;
            for (const candidate of encodedSecretValues(secret))
                output = output.replaceAll(candidate, marker);
        }
        const sanitized = sanitizeBrowserUrl(output);
        return {
            ...sanitized,
            redacted: sanitized.redacted || output !== value,
        };
    }
    fingerprint(value) {
        for (const secret of this.values.values())
            if (secret !== "" && value.includes(secret))
                return { value_state: "redacted-secret", value_sha256: null };
        return {
            value_state: "hashed",
            value_sha256: createHash("sha256")
                .update(this.redact(value))
                .digest("hex"),
        };
    }
}
