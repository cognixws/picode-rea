import { n as __exportAll } from "./chunk-BRhqBsOc.mjs";
import * as z from "zod/v4";
import { DefaultJsonSchemaValidator } from "@modelcontextprotocol/server/_shims";

//#region src/server/completable.ts
const COMPLETABLE_SYMBOL = Symbol.for("mcp.completable");
/**
* Wraps a schema to provide autocompletion capabilities. Useful for, e.g., prompt arguments in MCP.
*
* @example
* ```ts source="./completable.examples.ts#completable_basicUsage"
* server.registerPrompt(
*     'review-code',
*     {
*         title: 'Code Review',
*         argsSchema: z.object({
*             language: completable(z.string().describe('Programming language'), value =>
*                 ['typescript', 'javascript', 'python', 'rust', 'go'].filter(lang => lang.startsWith(value))
*             )
*         })
*     },
*     ({ language }) => ({
*         messages: [
*             {
*                 role: 'user' as const,
*                 content: {
*                     type: 'text' as const,
*                     text: `Review this ${language} code.`
*                 }
*             }
*         ]
*     })
* );
* ```
*
* @see {@linkcode server/mcp.McpServer.registerPrompt | McpServer.registerPrompt} for using completable schemas in prompt argument definitions
*/
function completable(schema, complete) {
	Object.defineProperty(schema, COMPLETABLE_SYMBOL, {
		value: { complete },
		enumerable: false,
		writable: false,
		configurable: false
	});
	return schema;
}
/**
* Checks if a schema is completable (has completion metadata).
*/
function isCompletable(schema) {
	return !!schema && typeof schema === "object" && COMPLETABLE_SYMBOL in schema;
}
/**
* Gets the completer callback from a completable schema, if it exists.
*/
function getCompleter(schema) {
	return schema[COMPLETABLE_SYMBOL]?.complete;
}

//#endregion
//#region ../core-internal/src/auth/errors.ts
/**
* OAuth error codes as defined by {@link https://datatracker.ietf.org/doc/html/rfc6749#section-5.2 | RFC 6749}
* and extensions.
*/
let OAuthErrorCode = /* @__PURE__ */ function(OAuthErrorCode$1) {
	/**
	* The request is missing a required parameter, includes an invalid parameter value,
	* includes a parameter more than once, or is otherwise malformed.
	*/
	OAuthErrorCode$1["InvalidRequest"] = "invalid_request";
	/**
	* Client authentication failed (e.g., unknown client, no client authentication included,
	* or unsupported authentication method).
	*/
	OAuthErrorCode$1["InvalidClient"] = "invalid_client";
	/**
	* The provided authorization grant or refresh token is invalid, expired, revoked,
	* does not match the redirection URI used in the authorization request, or was issued to another client.
	*/
	OAuthErrorCode$1["InvalidGrant"] = "invalid_grant";
	/**
	* The authenticated client is not authorized to use this authorization grant type.
	*/
	OAuthErrorCode$1["UnauthorizedClient"] = "unauthorized_client";
	/**
	* The authorization grant type is not supported by the authorization server.
	*/
	OAuthErrorCode$1["UnsupportedGrantType"] = "unsupported_grant_type";
	/**
	* The requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner.
	*/
	OAuthErrorCode$1["InvalidScope"] = "invalid_scope";
	/**
	* The resource owner or authorization server denied the request.
	*/
	OAuthErrorCode$1["AccessDenied"] = "access_denied";
	/**
	* The authorization server encountered an unexpected condition that prevented it from fulfilling the request.
	*/
	OAuthErrorCode$1["ServerError"] = "server_error";
	/**
	* The authorization server is currently unable to handle the request due to temporary overloading or maintenance.
	*/
	OAuthErrorCode$1["TemporarilyUnavailable"] = "temporarily_unavailable";
	/**
	* The authorization server does not support obtaining an authorization code using this method.
	*/
	OAuthErrorCode$1["UnsupportedResponseType"] = "unsupported_response_type";
	/**
	* The authorization server does not support the requested token type.
	*/
	OAuthErrorCode$1["UnsupportedTokenType"] = "unsupported_token_type";
	/**
	* The access token provided is expired, revoked, malformed, or invalid for other reasons.
	*/
	OAuthErrorCode$1["InvalidToken"] = "invalid_token";
	/**
	* The HTTP method used is not allowed for this endpoint. (Custom, non-standard error)
	*/
	OAuthErrorCode$1["MethodNotAllowed"] = "method_not_allowed";
	/**
	* Rate limit exceeded. (Custom, non-standard error based on RFC 6585)
	*/
	OAuthErrorCode$1["TooManyRequests"] = "too_many_requests";
	/**
	* The client metadata is invalid. (Custom error for dynamic client registration - RFC 7591)
	*/
	OAuthErrorCode$1["InvalidClientMetadata"] = "invalid_client_metadata";
	/**
	* The value of one or more redirection URIs is invalid. (Dynamic client registration - RFC 7591 §3.2.2)
	*/
	OAuthErrorCode$1["InvalidRedirectUri"] = "invalid_redirect_uri";
	/**
	* The request requires higher privileges than provided by the access token.
	*/
	OAuthErrorCode$1["InsufficientScope"] = "insufficient_scope";
	/**
	* The requested resource is invalid, missing, unknown, or malformed. (Custom error for resource indicators - RFC 8707)
	*/
	OAuthErrorCode$1["InvalidTarget"] = "invalid_target";
	return OAuthErrorCode$1;
}({});
/**
* OAuth error class for all OAuth-related errors.
*/
var OAuthError = class OAuthError extends Error {
	constructor(code, message, errorUri) {
		super(message);
		this.code = code;
		this.errorUri = errorUri;
		this.name = "OAuthError";
	}
	/**
	* Converts the error to a standard OAuth error response object.
	*/
	toResponseObject() {
		const response = {
			error: this.code,
			error_description: this.message
		};
		if (this.errorUri) response.error_uri = this.errorUri;
		return response;
	}
	/**
	* Creates an {@linkcode OAuthError} from an OAuth error response.
	*/
	static fromResponse(response) {
		return new OAuthError(response.error, response.error_description ?? response.error, response.error_uri);
	}
};

//#endregion
//#region ../core-internal/src/errors/sdkErrors.ts
/**
* Error codes for SDK errors (local errors that never cross the wire).
* Unlike {@linkcode ProtocolErrorCode} which uses numeric JSON-RPC codes, `SdkErrorCode` uses
* descriptive string values for better developer experience.
*
* These errors are thrown locally by the SDK and are never serialized as
* JSON-RPC error responses.
*/
let SdkErrorCode = /* @__PURE__ */ function(SdkErrorCode$1) {
	/** Transport is not connected */
	SdkErrorCode$1["NotConnected"] = "NOT_CONNECTED";
	/** Transport is already connected */
	SdkErrorCode$1["AlreadyConnected"] = "ALREADY_CONNECTED";
	/** Protocol is not initialized */
	SdkErrorCode$1["NotInitialized"] = "NOT_INITIALIZED";
	/** Required capability is not supported by the remote side */
	SdkErrorCode$1["CapabilityNotSupported"] = "CAPABILITY_NOT_SUPPORTED";
	/** Request timed out waiting for response */
	SdkErrorCode$1["RequestTimeout"] = "REQUEST_TIMEOUT";
	/** Connection was closed */
	SdkErrorCode$1["ConnectionClosed"] = "CONNECTION_CLOSED";
	/** Failed to send message */
	SdkErrorCode$1["SendFailed"] = "SEND_FAILED";
	/** Response result failed local schema validation */
	SdkErrorCode$1["InvalidResult"] = "INVALID_RESULT";
	/**
	* The response carried a `resultType` discriminator (protocol revision
	* 2026-07-28) naming a result kind this client cannot consume yet, e.g.
	* `input_required`. The kind is carried in `data.resultType`.
	*/
	SdkErrorCode$1["UnsupportedResultType"] = "UNSUPPORTED_RESULT_TYPE";
	/**
	* The multi-round-trip auto-fulfilment driver exhausted its round cap
	* (`inputRequired.maxRounds`) without the server returning a complete
	* result. `data.rounds` carries the cap that was hit and
	* `data.lastResult` carries the last `input_required` payload received
	* (`{ inputRequests, requestState? }`), so callers can inspect or resume
	* the flow manually.
	*/
	SdkErrorCode$1["InputRequiredRoundsExceeded"] = "INPUT_REQUIRED_ROUNDS_EXCEEDED";
	/**
	* The auto-aggregating no-`cursor` `listTools()` / `listPrompts()` /
	* `listResources()` / `listResourceTemplates()` walk hit the
	* `ClientOptions.listMaxPages` cap without the server's pagination
	* converging. `data.method` carries the list verb and
	* `data.listMaxPages` the cap that was hit; raise the cap or fall back to
	* explicit per-page `{ cursor }` calls.
	*/
	SdkErrorCode$1["ListPaginationExceeded"] = "LIST_PAGINATION_EXCEEDED";
	/**
	* The spec method being sent does not exist on the negotiated protocol
	* version's wire era (e.g. `tasks/get` toward a 2026-07-28 peer, or
	* `server/discover` toward a 2025-era peer). Raised locally, before
	* anything reaches the transport. The method and era are carried in
	* `data.method` / `data.era`.
	*/
	SdkErrorCode$1["MethodNotSupportedByProtocolVersion"] = "METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION";
	/**
	* Protocol-era negotiation at connect time failed without producing either a
	* usable modern (2026-07-28+) era or a definitive legacy fallback signal —
	* e.g. the negotiation mode forbids falling back (`pin`), or the probe hit a
	* network failure (a typed connect error, never an era verdict).
	*
	* Negotiation-phase only: this code is never used once an era is established.
	*/
	SdkErrorCode$1["EraNegotiationFailed"] = "ERA_NEGOTIATION_FAILED";
	SdkErrorCode$1["ClientHttpNotImplemented"] = "CLIENT_HTTP_NOT_IMPLEMENTED";
	SdkErrorCode$1["ClientHttpAuthentication"] = "CLIENT_HTTP_AUTHENTICATION";
	SdkErrorCode$1["ClientHttpForbidden"] = "CLIENT_HTTP_FORBIDDEN";
	SdkErrorCode$1["ClientHttpUnexpectedContent"] = "CLIENT_HTTP_UNEXPECTED_CONTENT";
	SdkErrorCode$1["ClientHttpFailedToOpenStream"] = "CLIENT_HTTP_FAILED_TO_OPEN_STREAM";
	SdkErrorCode$1["ClientHttpFailedToTerminateSession"] = "CLIENT_HTTP_FAILED_TO_TERMINATE_SESSION";
	return SdkErrorCode$1;
}({});
/**
* SDK errors are local errors that never cross the wire.
* They are distinct from {@linkcode ProtocolError} which represents JSON-RPC protocol errors
* that are serialized and sent as error responses.
*
* @example
* ```ts source="./sdkErrors.examples.ts#SdkError_basicUsage"
* try {
*     // Throwing an SDK error
*     throw new SdkError(SdkErrorCode.NotConnected, 'Transport is not connected');
* } catch (error) {
*     // Checking error type by code
*     if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
*         // Handle timeout
*     }
* }
* ```
*/
var SdkError = class extends Error {
	constructor(code, message, data) {
		super(message);
		this.code = code;
		this.data = data;
		this.name = "SdkError";
	}
};
/**
* An {@linkcode SdkError} subclass for HTTP transport failures.
*
* Thrown by the streamable HTTP transport when the server responds with a
* non-OK status code. Narrows {@linkcode SdkError.data | data} to
* {@linkcode SdkHttpErrorData} so consumers can inspect the HTTP status
* without unsafe casting.
*
* @example
* ```ts source="./sdkErrors.examples.ts#SdkHttpError_basicUsage"
* if (error instanceof SdkHttpError) {
*     console.log(error.status); // number
*     console.log(error.statusText); // string | undefined
* }
* ```
*/
var SdkHttpError = class extends SdkError {
	constructor(code, message, data) {
		super(code, message, data);
		this.name = "SdkHttpError";
	}
	get status() {
		return this.data.status;
	}
	get statusText() {
		return this.data.statusText;
	}
};

//#endregion
//#region ../core-internal/src/shared/auth.ts
/**
* Reusable URL validation that disallows `javascript:` scheme
*/
const SafeUrlSchema = z.url().superRefine((val, ctx) => {
	if (!URL.canParse(val)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "URL must be parseable",
			fatal: true
		});
		return z.NEVER;
	}
}).refine((url) => {
	const u = new URL(url);
	return u.protocol !== "javascript:" && u.protocol !== "data:" && u.protocol !== "vbscript:";
}, { message: "URL cannot use javascript:, data:, or vbscript: scheme" });
/**
* RFC 9728 OAuth Protected Resource Metadata
*/
const OAuthProtectedResourceMetadataSchema = z.looseObject({
	resource: z.string().url(),
	authorization_servers: z.array(SafeUrlSchema).optional(),
	jwks_uri: z.string().url().optional(),
	scopes_supported: z.array(z.string()).optional(),
	bearer_methods_supported: z.array(z.string()).optional(),
	resource_signing_alg_values_supported: z.array(z.string()).optional(),
	resource_name: z.string().optional(),
	resource_documentation: z.string().optional(),
	resource_policy_uri: z.string().url().optional(),
	resource_tos_uri: z.string().url().optional(),
	tls_client_certificate_bound_access_tokens: z.boolean().optional(),
	authorization_details_types_supported: z.array(z.string()).optional(),
	dpop_signing_alg_values_supported: z.array(z.string()).optional(),
	dpop_bound_access_tokens_required: z.boolean().optional()
});
/**
* RFC 8414 OAuth 2.0 Authorization Server Metadata
*/
const OAuthMetadataSchema = z.looseObject({
	issuer: z.string(),
	authorization_endpoint: SafeUrlSchema,
	token_endpoint: SafeUrlSchema,
	registration_endpoint: SafeUrlSchema.optional(),
	scopes_supported: z.array(z.string()).optional(),
	response_types_supported: z.array(z.string()),
	response_modes_supported: z.array(z.string()).optional(),
	grant_types_supported: z.array(z.string()).optional(),
	token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
	token_endpoint_auth_signing_alg_values_supported: z.array(z.string()).optional(),
	service_documentation: SafeUrlSchema.optional(),
	revocation_endpoint: SafeUrlSchema.optional(),
	revocation_endpoint_auth_methods_supported: z.array(z.string()).optional(),
	revocation_endpoint_auth_signing_alg_values_supported: z.array(z.string()).optional(),
	introspection_endpoint: z.string().optional(),
	introspection_endpoint_auth_methods_supported: z.array(z.string()).optional(),
	introspection_endpoint_auth_signing_alg_values_supported: z.array(z.string()).optional(),
	code_challenge_methods_supported: z.array(z.string()).optional(),
	client_id_metadata_document_supported: z.boolean().optional(),
	authorization_response_iss_parameter_supported: z.boolean().optional().catch(void 0)
});
/**
* OpenID Connect Discovery 1.0 Provider Metadata
*
* @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
*/
const OpenIdProviderMetadataSchema = z.looseObject({
	issuer: z.string(),
	authorization_endpoint: SafeUrlSchema,
	token_endpoint: SafeUrlSchema,
	userinfo_endpoint: SafeUrlSchema.optional(),
	jwks_uri: SafeUrlSchema,
	registration_endpoint: SafeUrlSchema.optional(),
	scopes_supported: z.array(z.string()).optional(),
	response_types_supported: z.array(z.string()),
	response_modes_supported: z.array(z.string()).optional(),
	grant_types_supported: z.array(z.string()).optional(),
	acr_values_supported: z.array(z.string()).optional(),
	subject_types_supported: z.array(z.string()),
	id_token_signing_alg_values_supported: z.array(z.string()),
	id_token_encryption_alg_values_supported: z.array(z.string()).optional(),
	id_token_encryption_enc_values_supported: z.array(z.string()).optional(),
	userinfo_signing_alg_values_supported: z.array(z.string()).optional(),
	userinfo_encryption_alg_values_supported: z.array(z.string()).optional(),
	userinfo_encryption_enc_values_supported: z.array(z.string()).optional(),
	request_object_signing_alg_values_supported: z.array(z.string()).optional(),
	request_object_encryption_alg_values_supported: z.array(z.string()).optional(),
	request_object_encryption_enc_values_supported: z.array(z.string()).optional(),
	token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
	token_endpoint_auth_signing_alg_values_supported: z.array(z.string()).optional(),
	display_values_supported: z.array(z.string()).optional(),
	claim_types_supported: z.array(z.string()).optional(),
	claims_supported: z.array(z.string()).optional(),
	service_documentation: z.string().optional(),
	claims_locales_supported: z.array(z.string()).optional(),
	ui_locales_supported: z.array(z.string()).optional(),
	claims_parameter_supported: z.boolean().optional(),
	request_parameter_supported: z.boolean().optional(),
	request_uri_parameter_supported: z.boolean().optional(),
	require_request_uri_registration: z.boolean().optional(),
	op_policy_uri: SafeUrlSchema.optional(),
	op_tos_uri: SafeUrlSchema.optional(),
	client_id_metadata_document_supported: z.boolean().optional(),
	authorization_response_iss_parameter_supported: z.boolean().optional().catch(void 0)
});
/**
* OpenID Connect Discovery metadata that may include OAuth 2.0 fields
* This schema represents the real-world scenario where OIDC providers
* return a mix of OpenID Connect and OAuth 2.0 metadata fields
*/
const OpenIdProviderDiscoveryMetadataSchema = z.object({
	...OpenIdProviderMetadataSchema.shape,
	...OAuthMetadataSchema.pick({ code_challenge_methods_supported: true }).shape
});
/**
* OAuth 2.1 token response
*/
const OAuthTokensSchema = z.object({
	access_token: z.string(),
	id_token: z.string().optional(),
	token_type: z.string(),
	expires_in: z.coerce.number().optional(),
	scope: z.string().optional(),
	refresh_token: z.string().optional()
}).strip();
/**
* RFC 8693 §2.2.1 Token Exchange response for ID-JAG tokens.
*
* `token_type` is intentionally optional: per RFC 8693 §2.2.1 it is informational when
* the issued token is not an access token, and per RFC 6749 §5.1 it is case-insensitive,
* so strict checking rejects conformant IdPs.
*/
const IdJagTokenExchangeResponseSchema = z.object({
	issued_token_type: z.literal("urn:ietf:params:oauth:token-type:id-jag"),
	access_token: z.string(),
	token_type: z.string().optional(),
	expires_in: z.number().optional(),
	scope: z.string().optional()
}).strip();
/**
* OAuth 2.1 error response
*/
const OAuthErrorResponseSchema = z.object({
	error: z.string(),
	error_description: z.string().optional(),
	error_uri: z.string().optional()
});
/**
* Optional version of {@linkcode SafeUrlSchema} that allows empty string for backward compatibility on `tos_uri` and `logo_uri`
*/
const OptionalSafeUrlSchema = SafeUrlSchema.optional().or(z.literal("").transform(() => void 0));
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration metadata
*/
const OAuthClientMetadataSchema = z.object({
	redirect_uris: z.array(SafeUrlSchema),
	token_endpoint_auth_method: z.string().optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	application_type: z.string().optional(),
	client_name: z.string().optional(),
	client_uri: SafeUrlSchema.optional(),
	logo_uri: OptionalSafeUrlSchema,
	scope: z.string().optional(),
	contacts: z.array(z.string()).optional(),
	tos_uri: OptionalSafeUrlSchema,
	policy_uri: z.string().optional(),
	jwks_uri: SafeUrlSchema.optional(),
	jwks: z.any().optional(),
	software_id: z.string().optional(),
	software_version: z.string().optional(),
	software_statement: z.string().optional()
}).strip();
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration client information
*/
const OAuthClientInformationSchema = z.object({
	client_id: z.string(),
	client_secret: z.string().optional(),
	client_id_issued_at: z.number().optional(),
	client_secret_expires_at: z.number().optional()
}).strip();
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration full response (client information plus metadata)
*/
const OAuthClientInformationFullSchema = OAuthClientMetadataSchema.merge(OAuthClientInformationSchema);
/**
* RFC 7591 OAuth 2.0 Dynamic Client Registration error response
*/
const OAuthClientRegistrationErrorSchema = z.object({
	error: z.string(),
	error_description: z.string().optional()
}).strip();
/**
* RFC 7009 OAuth 2.0 Token Revocation request
*/
const OAuthTokenRevocationRequestSchema = z.object({
	token: z.string(),
	token_type_hint: z.string().optional()
}).strip();

//#endregion
//#region ../core-internal/src/shared/authUtils.ts
/**
* Utilities for handling OAuth resource URIs.
*/
/**
* Converts a server URL to a resource URL by removing the fragment.
* {@link https://datatracker.ietf.org/doc/html/rfc8707#section-2 | RFC 8707 section 2}
* states that resource URIs "MUST NOT include a fragment component".
* Keeps everything else unchanged (scheme, domain, port, path, query).
*/
function resourceUrlFromServerUrl(url) {
	const resourceURL = typeof url === "string" ? new URL(url) : new URL(url.href);
	resourceURL.hash = "";
	return resourceURL;
}
/**
* Checks if a requested resource URL matches a configured resource URL.
* A requested resource matches if it has the same scheme, domain, port,
* and its path starts with the configured resource's path.
*
* @param options - The options object
* @param options.requestedResource - The resource URL being requested
* @param options.configuredResource - The resource URL that has been configured
* @returns true if the requested resource matches the configured resource, false otherwise
*/
function checkResourceAllowed({ requestedResource, configuredResource }) {
	const requested = typeof requestedResource === "string" ? new URL(requestedResource) : new URL(requestedResource.href);
	const configured = typeof configuredResource === "string" ? new URL(configuredResource) : new URL(configuredResource.href);
	if (requested.origin !== configured.origin) return false;
	if (requested.pathname.length < configured.pathname.length) return false;
	const requestedPath = requested.pathname.endsWith("/") ? requested.pathname : requested.pathname + "/";
	const configuredPath = configured.pathname.endsWith("/") ? configured.pathname : configured.pathname + "/";
	return requestedPath.startsWith(configuredPath);
}

//#endregion
//#region ../core-internal/src/shared/clientCapabilityRequirements.ts
/**
* Inbound request methods whose processing structurally requires a client
* capability, keyed by method, valued by the capabilities required.
*
* Currently empty: none of the request methods served on the 2026-07-28
* registry unconditionally requires a client capability. Entries appear here
* when such methods exist — for example requests whose handling embeds
* elicitation or sampling input requests (the input-request engine), or
* opt-in subscription delivery. Handler-conditional requirements (a specific
* tool that needs sampling) are not expressible as a static method table and
* are enforced at the point the requirement arises instead.
*/
const REQUIRED_CLIENT_CAPABILITIES_BY_METHOD = {};
/**
* The client capabilities a request method structurally requires, or
* `undefined` when the method has no static requirement.
*/
function requiredClientCapabilitiesForRequest(method) {
	return Object.hasOwn(REQUIRED_CLIENT_CAPABILITIES_BY_METHOD, method) ? REQUIRED_CLIENT_CAPABILITIES_BY_METHOD[method] : void 0;
}
function isPlainObject$6(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Whether a required nested member counts as declared even though it is not
* spelled out: a bare `elicitation: {}` declaration (no mode sub-capability at
* all) is read as form support — the pre-mode (2025) meaning of a bare
* declaration — so an `elicitation.form` requirement treats it as satisfied.
* Declaring any mode explicitly (for example `elicitation: { url: {} }`)
* removes the implication.
*/
function isImpliedCapabilityMember(capability, member, declaredValue) {
	return capability === "elicitation" && member === "form" && declaredValue["form"] === void 0 && declaredValue["url"] === void 0;
}
/**
* The client capabilities an embedded multi-round-trip input request requires
* (call site 2 — the outbound input-request leg): a server MUST NOT send an
* `inputRequests` kind the request's declared client capabilities do not
* cover. Returns `undefined` for entries whose method is not one of the
* embedded input-request kinds (those are a server bug handled separately,
* not a capability question).
*
* The requirement is mode-aware where the capability is: URL-mode elicitation
* requires `elicitation.url`; form-mode (or mode-omitted) elicitation requires
* `elicitation.form` (modes are sub-capabilities, and a server MUST NOT send a
* mode the client did not declare); sampling with `tools`/`toolChoice`
* requires `sampling.tools`. A bare `elicitation: {}` declaration satisfies
* the form requirement — see {@linkcode missingClientCapabilities}.
*/
function requiredClientCapabilitiesForInputRequest(entry) {
	switch (entry.method) {
		case "elicitation/create":
			if (entry.params?.["mode"] === "url") return { elicitation: { url: {} } };
			return { elicitation: { form: {} } };
		case "sampling/createMessage": {
			const params = entry.params;
			if (params !== void 0 && (params["tools"] !== void 0 || params["toolChoice"] !== void 0)) return { sampling: { tools: {} } };
			return { sampling: {} };
		}
		case "roots/list": return { roots: {} };
		default: return;
	}
}
/**
* Computes the subset of `required` client capabilities the client did not
* declare. Returns `undefined` when every required capability is declared;
* otherwise returns an object in the `ClientCapabilities` shape containing
* exactly the missing capabilities (suitable for
* `data.requiredCapabilities` on the `-32021` error).
*
* A capability counts as declared when its top-level key is present on the
* declared capabilities; when the requirement names nested members (for
* example `elicitation: { url: {} }`), each named member must also be present
* under the declared capability. One lenient reading applies: a bare
* `elicitation: {}` declaration (no mode sub-capability at all) counts as
* declaring `elicitation.form` — the pre-mode (2025) meaning of a bare
* declaration. An absent or empty `declared` value means
* nothing is declared — every required capability is missing (the structural
* clean-refusal posture for sessions with no per-request capability view).
*/
function missingClientCapabilities(required, declared) {
	const missing = {};
	for (const [capability, requirement] of Object.entries(required)) {
		if (requirement === void 0) continue;
		const declaredValue = declared === void 0 ? void 0 : declared[capability];
		if (declaredValue === void 0) {
			missing[capability] = requirement;
			continue;
		}
		if (isPlainObject$6(requirement) && isPlainObject$6(declaredValue)) {
			const missingMembers = {};
			for (const [member, memberRequirement] of Object.entries(requirement)) if (memberRequirement !== void 0 && declaredValue[member] === void 0 && !isImpliedCapabilityMember(capability, member, declaredValue)) missingMembers[member] = memberRequirement;
			if (Object.keys(missingMembers).length > 0) missing[capability] = missingMembers;
		}
	}
	return Object.keys(missing).length > 0 ? missing : void 0;
}

//#endregion
//#region ../core-internal/src/types/constants.ts
const LATEST_PROTOCOL_VERSION = "2025-11-25";
const DEFAULT_NEGOTIATED_PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS = [
	LATEST_PROTOCOL_VERSION,
	"2025-06-18",
	"2025-03-26",
	"2024-11-05",
	"2024-10-07"
];
/**
* `_meta` key associating a message with a 2025-11-25 task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const RELATED_TASK_META_KEY = "io.modelcontextprotocol/related-task";
/**
* `_meta` key carrying the MCP protocol version governing a request.
*
* For the HTTP transport, the value must match the `MCP-Protocol-Version` header.
*/
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
/**
* `_meta` key identifying the client software making a request.
*/
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
/**
* `_meta` key carrying the client's capabilities for a request.
*
* Capabilities are declared per request rather than once at initialization;
* servers must not infer capabilities from prior requests.
*/
const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
/**
* `_meta` key carrying the JSON-RPC ID of the `subscriptions/listen` request
* that opened the stream a notification was delivered on.
*
* Stamped by the server on every notification delivered via a
* `subscriptions/listen` stream (including the leading
* `notifications/subscriptions/acknowledged`); on stdio, where all messages
* share one channel, clients use it to correlate notifications with their
* originating subscription. The value is the listen request's JSON-RPC ID
* verbatim.
*/
const SUBSCRIPTION_ID_META_KEY = "io.modelcontextprotocol/subscriptionId";
/**
* `_meta` key carrying the desired log level for a request.
*
* When absent, the server must not send `notifications/message` notifications
* for the request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months.
*/
const LOG_LEVEL_META_KEY = "io.modelcontextprotocol/logLevel";
/**
* `_meta` key carrying W3C Trace Context for distributed tracing (SEP-414).
*
* When present, the value MUST follow the W3C `traceparent` header format,
* e.g. `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`.
*
* @see https://www.w3.org/TR/trace-context/#traceparent-header
*/
const TRACEPARENT_META_KEY = "traceparent";
/**
* `_meta` key carrying vendor-specific trace state for distributed tracing (SEP-414).
*
* When present, the value MUST follow the W3C `tracestate` header format,
* e.g. `vendor1=value1,vendor2=value2`.
*
* @see https://www.w3.org/TR/trace-context/#tracestate-header
*/
const TRACESTATE_META_KEY = "tracestate";
/**
* `_meta` key carrying cross-cutting propagation values for distributed tracing (SEP-414).
*
* When present, the value MUST follow the W3C Baggage header format,
* e.g. `userId=alice,serverRegion=us-east-1`.
*
* @see https://www.w3.org/TR/baggage/
*/
const BAGGAGE_META_KEY = "baggage";
const JSONRPC_VERSION = "2.0";
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

//#endregion
//#region ../core-internal/src/shared/protocolEras.ts
/**
* The first protocol revision of the modern (2026-07-28) era. Revision identifiers
* are ISO dates, so lexicographic comparison orders them chronologically.
*/
const FIRST_MODERN_PROTOCOL_VERSION = "2026-07-28";
/**
* Modern-era protocol revisions this SDK can negotiate via `server/discover`.
* Deliberately separate from {@linkcode SUPPORTED_PROTOCOL_VERSIONS} (the legacy
* `initialize` list), so adding a revision here can never leak a modern version
* string into a 2025-era handshake. Internal — not part of the public API surface.
*/
const SUPPORTED_MODERN_PROTOCOL_VERSIONS = [FIRST_MODERN_PROTOCOL_VERSION];
/** Whether the given protocol revision belongs to the modern (2026-07-28+) era. */
function isModernProtocolVersion(version) {
	return version >= FIRST_MODERN_PROTOCOL_VERSION;
}
/** The legacy-era (pre-2026-07-28) subset of a supported-versions list, in the list's own preference order. */
function legacyProtocolVersions(versions) {
	return versions.filter((version) => !isModernProtocolVersion(version));
}
/** The modern-era (2026-07-28+) subset of a supported-versions list, in the list's own preference order. */
function modernProtocolVersions(versions) {
	return versions.filter((version) => isModernProtocolVersion(version));
}

//#endregion
//#region ../core-internal/src/wire/textFallback.ts
/**
* SEP-2106 §4.3 TextContent auto-append, era-agnostic, called from BOTH
* codecs' {@link WireCodec.projectCallToolResult}: when `structuredContent`
* is a non-object value (array/primitive/`null`) and the handler authored no
* `type:'text'` block, append `{type:'text', text: JSON.stringify(value)}`.
* Object-shaped (or absent) `structuredContent` returns the same reference.
*
* Leaf module: imported by both era codec modules, so it must NOT import from
* `./codec.js` (which value-imports the rev codecs at top level — that would
* make a runtime cycle and a TDZ hazard for entries that evaluate a rev codec
* module first).
*/
function appendTextFallbackForNonObject(result) {
	const sc = result.structuredContent;
	if (sc === void 0) return result;
	if (!(typeof sc !== "object" || sc === null || Array.isArray(sc))) return result;
	if (result.content?.some((c) => c.type === "text") ?? false) return result;
	return {
		...result,
		content: [...result.content ?? [], {
			type: "text",
			text: JSON.stringify(sc)
		}]
	};
}

//#endregion
//#region ../core-internal/src/wire/rev2025-11-25/legacyWrap.ts
/**
* SEP-2106 legacy `outputSchema` wrap helpers (2025-era projection only).
*
* The neutral / 2026-07-28 model lets a tool's `outputSchema` carry any JSON
* Schema root. The 2025-11-25 wire shape requires `type:'object'` at the root,
* so when an era-blind handler advertises a non-object root, the 2025 codec's
* `encodeResult('tools/list', …)` projects it down to
* `{type:'object', properties:{result:<natural>}, required:['result']}`, and
* `projectCallToolResult` wraps the matching `structuredContent` as
* `{result:<value>}`. The 2026 codec's projections are the identity.
*
* These helpers are wire-layer property — they exist so the projection can
* live behind {@link WireCodec.encodeResult} / {@link WireCodec.projectCallToolResult}
* and never be re-derived in shared/ or server-side code.
*/
/**
* Whether a JSON Schema's root is non-object: either an explicit non-object
* `type`, or a typeless root such as `{anyOf:[…]}`. Object-shaped typeless
* roots that the schema-conversion layer can prove are objects are stamped
* `type:'object'` upstream, so they reach this predicate as object roots.
*/
function isNonObjectJsonSchemaRoot(json) {
	return json["type"] !== "object";
}
/**
* Keyword-position keys whose values are instance data (not subschemas). A
* `{$ref:…}` appearing inside one is a literal value, not a JSON Pointer to
* rewrite. Only consulted when the current object is in keyword position —
* a PROPERTY named `default`/`const` (under `properties`/`$defs`/…) is a name
* position whose value IS a subschema and is recursed into.
*/
const REF_REWRITE_DATA_POSITION_KEYS = new Set([
	"const",
	"enum",
	"default",
	"examples"
]);
/**
* Keyword-position keys whose value is a name→subschema map. Entries inside
* such a map are in NAME position: their keys are author-chosen property
* names (which may collide with JSON Schema keywords), their values are
* subschemas to recurse into.
*/
const REF_REWRITE_NAME_MAP_KEYS = new Set([
	"properties",
	"patternProperties",
	"$defs",
	"definitions",
	"dependentSchemas"
]);
/**
* Wrap a non-object output schema in the 2025-era envelope:
* `{type:'object', properties:{result:<natural>}, required:['result']}`.
*
* Same-document `$ref` / `$dynamicRef` JSON Pointers inside the natural schema
* (e.g. `#/properties/foo` produced by zod for de-duplicated/recursive types)
* are rewritten to account for the new `#/properties/result` root: bare `#` →
* `#/properties/result`, `#/…` → `#/properties/result/…`. Cross-document refs
* (anything not starting with `#`) are left untouched.
*
* The rewrite is position-aware: data-valued keywords
* (`const`/`enum`/`default`/`examples`) in keyword position are NOT descended
* into; the same names appearing as property names under
* `properties`/`patternProperties`/`$defs`/`definitions`/`dependentSchemas`
* ARE descended into (they're subschemas). The rewrite is also `$id`-scoped:
* if the natural root carries `$id` no pointer is rewritten (same-document
* refs inside resolve against the embedded `$id` base, not the wrapper root),
* and any subtree that establishes its own `$id` is left untouched for the
* same reason.
*/
function wrapOutputSchemaForLegacy(natural) {
	const $schema = typeof natural["$schema"] === "string" ? natural["$schema"] : void 0;
	if (natural["$id"] !== void 0) return {
		...$schema !== void 0 && { $schema },
		type: "object",
		properties: { result: natural },
		required: ["result"]
	};
	const rewriteRefs = (node, parentIsNameMap) => {
		if (Array.isArray(node)) return node.map((item) => rewriteRefs(item, false));
		if (node === null || typeof node !== "object") return node;
		if (!parentIsNameMap && node["$id"] !== void 0) return node;
		const out = {};
		for (const [k, v] of Object.entries(node)) if (parentIsNameMap) out[k] = rewriteRefs(v, false);
		else if ((k === "$ref" || k === "$dynamicRef") && typeof v === "string") out[k] = v === "#" ? "#/properties/result" : v.startsWith("#/") ? `#/properties/result${v.slice(1)}` : v;
		else if (REF_REWRITE_DATA_POSITION_KEYS.has(k)) out[k] = v;
		else if (REF_REWRITE_NAME_MAP_KEYS.has(k)) out[k] = rewriteRefs(v, true);
		else out[k] = rewriteRefs(v, false);
		return out;
	};
	return {
		...$schema !== void 0 && { $schema },
		type: "object",
		properties: { result: rewriteRefs(natural, false) },
		required: ["result"]
	};
}

//#endregion
//#region ../core-internal/src/wire/rev2025-11-25/schemas.ts
/**
* Complete frozen 2025-11-25 wire schemas. Self-contained — no imports from
* the public/neutral types/schemas.ts. The neutral layer is the public-API
* superset and is free to evolve (e.g., SEP-2106 widening); this file is the
* 2025 wire-parse contract (Q10-L2 byte-identity) and is BEHAVIOR-FROZEN.
*
* This is the era's complete frozen wire-parse contract — both the 2025-only
* delta (the deprecated task family, the era role unions) AND frozen copies of
* every era-shared shape (Tool, CallToolResult, Initialize*, ContentBlock,
* prompts/resources/completion/elicitation, …). The 2026-era codec
* (`wire/rev2026-07-28/`) is symmetrically self-contained in the same way.
*
* The 2025-only delta (the task message surface, restored types-only by #2248
* for interop with task-capable 2025 peers) is parsed ONLY through this era's
* registry; the deprecated Task* schemas also live (marked `@deprecated`) in
* the neutral schema layer so the public types stay nameable without a
* cross-layer import — nameability is constant, runtime availability is
* version-keyed — but appear in no API signature. Q1 increment 2 — deletions
* are physical: the
* 2026-era REGISTRY has no Task* methods (its frozen building-block copies do
* carry the deprecated Task* sub-schemas by composition — soft contamination,
* tracked for anchor-exactness adjudication).
*
* The only cross-layer dependency is `import type { JSONObject, JSONValue }`
* from the neutral types barrel — pure structural type aliases with no parse
* behavior. No runtime schema is shared with the neutral layer.
*/
const JSONValueSchema$2 = z.lazy(() => z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.record(z.string(), JSONValueSchema$2),
	z.array(JSONValueSchema$2)
]));
const JSONObjectSchema$2 = z.record(z.string(), JSONValueSchema$2);
/**
* A progress token, used to associate progress notifications with the original request.
*/
const ProgressTokenSchema$2 = z.union([z.string(), z.number().int()]);
/**
* An opaque token used to represent a cursor for pagination.
*/
const CursorSchema$2 = z.string();
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const TaskMetadataSchema$2 = z.object({ ttl: z.number().optional() });
/**
* Metadata for associating messages with a task.
* Include this in the `_meta` field under the key `io.modelcontextprotocol/related-task`.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const RelatedTaskMetadataSchema$2 = z.object({ taskId: z.string() });
const RequestMetaSchema$2 = z.looseObject({
	progressToken: ProgressTokenSchema$2.optional(),
	"io.modelcontextprotocol/related-task": RelatedTaskMetadataSchema$2.optional()
});
/**
* Common params for any request.
*/
const BaseRequestParamsSchema$2 = z.object({ _meta: RequestMetaSchema$2.optional() });
/**
* Common params for any task-augmented request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskAugmentedRequestParamsSchema$2 = BaseRequestParamsSchema$2.extend({ task: TaskMetadataSchema$2.optional() });
const RequestSchema$1 = z.object({
	method: z.string(),
	params: BaseRequestParamsSchema$2.loose().optional()
});
const NotificationsParamsSchema$2 = z.object({ _meta: RequestMetaSchema$2.optional() });
const NotificationSchema$2 = z.object({
	method: z.string(),
	params: NotificationsParamsSchema$2.loose().optional()
});
const ResultSchema$2 = z.looseObject({ _meta: RequestMetaSchema$2.optional() });
/**
* A uniquely identifying ID for a request in JSON-RPC.
*/
const RequestIdSchema$2 = z.union([z.string(), z.number().int()]);
/**
* A response that indicates success but carries no data.
*/
const EmptyResultSchema$1 = ResultSchema$2.strict();
const CancelledNotificationParamsSchema$2 = NotificationsParamsSchema$2.extend({
	requestId: RequestIdSchema$2.optional(),
	reason: z.string().optional()
});
/**
* This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
*
* The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
*
* This notification indicates that the result will be unused, so any associated processing SHOULD cease.
*
* A client MUST NOT attempt to cancel its {@linkcode InitializeRequest | initialize} request.
*/
const CancelledNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/cancelled"),
	params: CancelledNotificationParamsSchema$2
});
/**
* Icon schema for use in {@link Tool | tools}, {@link Prompt | prompts}, {@link Resource | resources}, and {@link Implementation | implementations}.
*/
const IconSchema$2 = z.object({
	src: z.string(),
	mimeType: z.string().optional(),
	sizes: z.array(z.string()).optional(),
	theme: z.enum(["light", "dark"]).optional()
});
/**
* Base schema to add `icons` property.
*
*/
const IconsSchema$2 = z.object({ icons: z.array(IconSchema$2).optional() });
/**
* Base metadata interface for common properties across {@link Resource | resources}, {@link Tool | tools}, {@link Prompt | prompts}, and {@link Implementation | implementations}.
*/
const BaseMetadataSchema$2 = z.object({
	name: z.string(),
	title: z.string().optional()
});
/**
* Describes the name and version of an MCP implementation.
*/
const ImplementationSchema$2 = BaseMetadataSchema$2.extend({
	...BaseMetadataSchema$2.shape,
	...IconsSchema$2.shape,
	version: z.string(),
	websiteUrl: z.string().optional(),
	description: z.string().optional()
});
const FormElicitationCapabilitySchema$2 = z.intersection(z.object({ applyDefaults: z.boolean().optional() }), JSONObjectSchema$2);
const ElicitationCapabilitySchema$2 = z.preprocess((value) => {
	if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return { form: {} };
	return value;
}, z.intersection(z.object({
	form: FormElicitationCapabilitySchema$2.optional(),
	url: JSONObjectSchema$2.optional()
}), JSONObjectSchema$2.optional()));
/**
* Task capabilities for clients, indicating which request types support task creation.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ClientTasksCapabilitySchema$2 = z.looseObject({
	list: JSONObjectSchema$2.optional(),
	cancel: JSONObjectSchema$2.optional(),
	requests: z.looseObject({
		sampling: z.looseObject({ createMessage: JSONObjectSchema$2.optional() }).optional(),
		elicitation: z.looseObject({ create: JSONObjectSchema$2.optional() }).optional()
	}).optional()
});
/**
* Task capabilities for servers, indicating which request types support task creation.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ServerTasksCapabilitySchema$2 = z.looseObject({
	list: JSONObjectSchema$2.optional(),
	cancel: JSONObjectSchema$2.optional(),
	requests: z.looseObject({ tools: z.looseObject({ call: JSONObjectSchema$2.optional() }).optional() }).optional()
});
/**
* Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
*/
const ClientCapabilitiesSchema$2 = z.object({
	experimental: z.record(z.string(), JSONObjectSchema$2).optional(),
	sampling: z.object({
		context: JSONObjectSchema$2.optional(),
		tools: JSONObjectSchema$2.optional()
	}).optional(),
	elicitation: ElicitationCapabilitySchema$2.optional(),
	roots: z.object({ listChanged: z.boolean().optional() }).optional(),
	tasks: ClientTasksCapabilitySchema$2.optional(),
	extensions: z.record(z.string(), JSONObjectSchema$2).optional()
});
const InitializeRequestParamsSchema$1 = BaseRequestParamsSchema$2.extend({
	protocolVersion: z.string(),
	capabilities: ClientCapabilitiesSchema$2,
	clientInfo: ImplementationSchema$2
});
/**
* This request is sent from the client to the server when it first connects, asking it to begin initialization.
*/
const InitializeRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("initialize"),
	params: InitializeRequestParamsSchema$1
});
/**
* Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
*/
const ServerCapabilitiesSchema$2 = z.object({
	experimental: z.record(z.string(), JSONObjectSchema$2).optional(),
	logging: JSONObjectSchema$2.optional(),
	completions: JSONObjectSchema$2.optional(),
	prompts: z.object({ listChanged: z.boolean().optional() }).optional(),
	resources: z.object({
		subscribe: z.boolean().optional(),
		listChanged: z.boolean().optional()
	}).optional(),
	tools: z.object({ listChanged: z.boolean().optional() }).optional(),
	tasks: ServerTasksCapabilitySchema$2.optional(),
	extensions: z.record(z.string(), JSONObjectSchema$2).optional()
});
/**
* After receiving an initialize request from the client, the server sends this response.
*/
const InitializeResultSchema$1 = ResultSchema$2.extend({
	protocolVersion: z.string(),
	capabilities: ServerCapabilitiesSchema$2,
	serverInfo: ImplementationSchema$2,
	instructions: z.string().optional()
});
/**
* This notification is sent from the client to the server after initialization has finished.
*/
const InitializedNotificationSchema$1 = NotificationSchema$2.extend({
	method: z.literal("notifications/initialized"),
	params: NotificationsParamsSchema$2.optional()
});
/**
* A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
*/
const PingRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("ping"),
	params: BaseRequestParamsSchema$2.optional()
});
const ProgressSchema$2 = z.object({
	progress: z.number(),
	total: z.optional(z.number()),
	message: z.optional(z.string())
});
const ProgressNotificationParamsSchema$2 = z.object({
	...NotificationsParamsSchema$2.shape,
	...ProgressSchema$2.shape,
	progressToken: ProgressTokenSchema$2
});
/**
* An out-of-band notification used to inform the receiver of a progress update for a long-running request.
*
* @category notifications/progress
*/
const ProgressNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/progress"),
	params: ProgressNotificationParamsSchema$2
});
const PaginatedRequestParamsSchema$1 = BaseRequestParamsSchema$2.extend({ cursor: CursorSchema$2.optional() });
const PaginatedRequestSchema$1 = RequestSchema$1.extend({ params: PaginatedRequestParamsSchema$1.optional() });
const PaginatedResultSchema$2 = ResultSchema$2.extend({ nextCursor: CursorSchema$2.optional() });
/**
* The contents of a specific resource or sub-resource.
*/
const ResourceContentsSchema$2 = z.object({
	uri: z.string(),
	mimeType: z.optional(z.string()),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const TextResourceContentsSchema$2 = ResourceContentsSchema$2.extend({ text: z.string() });
/**
* A Zod schema for validating Base64 strings that is more performant and
* robust for very large inputs than the default regex-based check. It avoids
* stack overflows by using the native `atob` function for validation.
*/
const Base64Schema$2 = z.string().refine((val) => {
	try {
		atob(val);
		return true;
	} catch {
		return false;
	}
}, { message: "Invalid Base64 string" });
const BlobResourceContentsSchema$2 = ResourceContentsSchema$2.extend({ blob: Base64Schema$2 });
/**
* The sender or recipient of messages and data in a conversation.
*/
const RoleSchema$2 = z.enum(["user", "assistant"]);
/**
* Optional annotations providing clients additional context about a resource.
*/
const AnnotationsSchema$2 = z.object({
	audience: z.array(RoleSchema$2).optional(),
	priority: z.number().min(0).max(1).optional(),
	lastModified: z.iso.datetime({ offset: true }).optional()
});
/**
* A known resource that the server is capable of reading.
*/
const ResourceSchema$2 = z.object({
	...BaseMetadataSchema$2.shape,
	...IconsSchema$2.shape,
	uri: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string()),
	size: z.optional(z.number()),
	annotations: AnnotationsSchema$2.optional(),
	_meta: z.optional(z.looseObject({}))
});
/**
* A template description for resources available on the server.
*/
const ResourceTemplateSchema$2 = z.object({
	...BaseMetadataSchema$2.shape,
	...IconsSchema$2.shape,
	uriTemplate: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string()),
	annotations: AnnotationsSchema$2.optional(),
	_meta: z.optional(z.looseObject({}))
});
/**
* Sent from the client to request a list of resources the server has.
*/
const ListResourcesRequestSchema$2 = PaginatedRequestSchema$1.extend({ method: z.literal("resources/list") });
/**
* The server's response to a {@linkcode ListResourcesRequest | resources/list} request from the client.
*/
const ListResourcesResultSchema$2 = PaginatedResultSchema$2.extend({ resources: z.array(ResourceSchema$2) });
/**
* Sent from the client to request a list of resource templates the server has.
*/
const ListResourceTemplatesRequestSchema$2 = PaginatedRequestSchema$1.extend({ method: z.literal("resources/templates/list") });
/**
* The server's response to a {@linkcode ListResourceTemplatesRequest | resources/templates/list} request from the client.
*/
const ListResourceTemplatesResultSchema$2 = PaginatedResultSchema$2.extend({ resourceTemplates: z.array(ResourceTemplateSchema$2) });
const ResourceRequestParamsSchema$1 = BaseRequestParamsSchema$2.extend({ uri: z.string() });
/**
* Parameters for a {@linkcode ReadResourceRequest | resources/read} request.
*/
const ReadResourceRequestParamsSchema$1 = ResourceRequestParamsSchema$1;
/**
* Sent from the client to the server, to read a specific resource URI.
*/
const ReadResourceRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("resources/read"),
	params: ReadResourceRequestParamsSchema$1
});
/**
* The server's response to a {@linkcode ReadResourceRequest | resources/read} request from the client.
*/
const ReadResourceResultSchema$2 = ResultSchema$2.extend({ contents: z.array(z.union([TextResourceContentsSchema$2, BlobResourceContentsSchema$2])) });
/**
* An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
*/
const ResourceListChangedNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/resources/list_changed"),
	params: NotificationsParamsSchema$2.optional()
});
const SubscribeRequestParamsSchema$1 = ResourceRequestParamsSchema$1;
/**
* Sent from the client to request `resources/updated` notifications from the server whenever a particular resource changes.
*/
const SubscribeRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("resources/subscribe"),
	params: SubscribeRequestParamsSchema$1
});
const UnsubscribeRequestParamsSchema$1 = ResourceRequestParamsSchema$1;
/**
* Sent from the client to request cancellation of {@linkcode ResourceUpdatedNotification | resources/updated} notifications from the server. This should follow a previous {@linkcode SubscribeRequest | resources/subscribe} request.
*/
const UnsubscribeRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("resources/unsubscribe"),
	params: UnsubscribeRequestParamsSchema$1
});
/**
* Parameters for a {@linkcode ResourceUpdatedNotification | notifications/resources/updated} notification.
*/
const ResourceUpdatedNotificationParamsSchema$2 = NotificationsParamsSchema$2.extend({ uri: z.string() });
/**
* A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a {@linkcode SubscribeRequest | resources/subscribe} request.
*/
const ResourceUpdatedNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/resources/updated"),
	params: ResourceUpdatedNotificationParamsSchema$2
});
/**
* Describes an argument that a prompt can accept.
*/
const PromptArgumentSchema$2 = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	required: z.optional(z.boolean())
});
/**
* A prompt or prompt template that the server offers.
*/
const PromptSchema$2 = z.object({
	...BaseMetadataSchema$2.shape,
	...IconsSchema$2.shape,
	description: z.optional(z.string()),
	arguments: z.optional(z.array(PromptArgumentSchema$2)),
	_meta: z.optional(z.looseObject({}))
});
/**
* Sent from the client to request a list of prompts and prompt templates the server has.
*/
const ListPromptsRequestSchema$2 = PaginatedRequestSchema$1.extend({ method: z.literal("prompts/list") });
/**
* The server's response to a {@linkcode ListPromptsRequest | prompts/list} request from the client.
*/
const ListPromptsResultSchema$2 = PaginatedResultSchema$2.extend({ prompts: z.array(PromptSchema$2) });
/**
* Parameters for a {@linkcode GetPromptRequest | prompts/get} request.
*/
const GetPromptRequestParamsSchema$1 = BaseRequestParamsSchema$2.extend({
	name: z.string(),
	arguments: z.record(z.string(), z.string()).optional()
});
/**
* Used by the client to get a prompt provided by the server.
*/
const GetPromptRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("prompts/get"),
	params: GetPromptRequestParamsSchema$1
});
/**
* Text provided to or from an LLM.
*/
const TextContentSchema$2 = z.object({
	type: z.literal("text"),
	text: z.string(),
	annotations: AnnotationsSchema$2.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* An image provided to or from an LLM.
*/
const ImageContentSchema$2 = z.object({
	type: z.literal("image"),
	data: Base64Schema$2,
	mimeType: z.string(),
	annotations: AnnotationsSchema$2.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Audio content provided to or from an LLM.
*/
const AudioContentSchema$2 = z.object({
	type: z.literal("audio"),
	data: Base64Schema$2,
	mimeType: z.string(),
	annotations: AnnotationsSchema$2.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* A tool call request from an assistant (LLM).
* Represents the assistant's request to use a tool.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ToolUseContentSchema$2 = z.object({
	type: z.literal("tool_use"),
	name: z.string(),
	id: z.string(),
	input: z.record(z.string(), z.unknown()),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* The contents of a resource, embedded into a prompt or tool call result.
*/
const EmbeddedResourceSchema$2 = z.object({
	type: z.literal("resource"),
	resource: z.union([TextResourceContentsSchema$2, BlobResourceContentsSchema$2]),
	annotations: AnnotationsSchema$2.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* A resource that the server is capable of reading, included in a prompt or tool call result.
*
* Note: resource links returned by tools are not guaranteed to appear in the results of {@linkcode ListResourcesRequest | resources/list} requests.
*/
const ResourceLinkSchema$2 = ResourceSchema$2.extend({ type: z.literal("resource_link") });
/**
* A content block that can be used in prompts and tool results.
*/
const ContentBlockSchema$2 = z.union([
	TextContentSchema$2,
	ImageContentSchema$2,
	AudioContentSchema$2,
	ResourceLinkSchema$2,
	EmbeddedResourceSchema$2
]);
/**
* Describes a message returned as part of a prompt.
*/
const PromptMessageSchema$2 = z.object({
	role: RoleSchema$2,
	content: ContentBlockSchema$2
});
/**
* The server's response to a {@linkcode GetPromptRequest | prompts/get} request from the client.
*/
const GetPromptResultSchema$2 = ResultSchema$2.extend({
	description: z.string().optional(),
	messages: z.array(PromptMessageSchema$2)
});
/**
* An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
const PromptListChangedNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/prompts/list_changed"),
	params: NotificationsParamsSchema$2.optional()
});
/**
* Additional properties describing a `Tool` to clients.
*
* NOTE: all properties in {@linkcode ToolAnnotations} are **hints**.
* They are not guaranteed to provide a faithful description of
* tool behavior (including descriptive properties like `title`).
*
* Clients should never make tool use decisions based on `ToolAnnotations`
* received from untrusted servers.
*/
const ToolAnnotationsSchema$2 = z.object({
	title: z.string().optional(),
	readOnlyHint: z.boolean().optional(),
	destructiveHint: z.boolean().optional(),
	idempotentHint: z.boolean().optional(),
	openWorldHint: z.boolean().optional()
});
/**
* Execution-related properties for a tool.
*/
const ToolExecutionSchema$1 = z.object({ taskSupport: z.enum([
	"required",
	"optional",
	"forbidden"
]).optional() });
/**
* Definition for a tool the client can call.
*/
const ToolSchema$2 = z.object({
	...BaseMetadataSchema$2.shape,
	...IconsSchema$2.shape,
	description: z.string().optional(),
	inputSchema: z.object({
		type: z.literal("object"),
		properties: z.record(z.string(), JSONValueSchema$2).optional(),
		required: z.array(z.string()).optional()
	}).catchall(z.unknown()),
	outputSchema: z.object({
		type: z.literal("object"),
		properties: z.record(z.string(), JSONValueSchema$2).optional(),
		required: z.array(z.string()).optional()
	}).catchall(z.unknown()).optional(),
	annotations: ToolAnnotationsSchema$2.optional(),
	execution: ToolExecutionSchema$1.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Sent from the client to request a list of tools the server has.
*/
const ListToolsRequestSchema$2 = PaginatedRequestSchema$1.extend({ method: z.literal("tools/list") });
/**
* The server's response to a {@linkcode ListToolsRequest | tools/list} request from the client.
*/
const ListToolsResultSchema$2 = PaginatedResultSchema$2.extend({ tools: z.array(ToolSchema$2) });
/**
* The server's response to a tool call.
*/
const CallToolResultSchema$2 = ResultSchema$2.extend({
	content: z.array(ContentBlockSchema$2),
	structuredContent: z.record(z.string(), z.unknown()).optional(),
	isError: z.boolean().optional()
});
/**
* Parameters for a `tools/call` request.
*/
const CallToolRequestParamsSchema$1 = TaskAugmentedRequestParamsSchema$2.extend({
	name: z.string(),
	arguments: z.record(z.string(), z.unknown()).optional()
});
/**
* Used by the client to invoke a tool provided by the server.
*/
const CallToolRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("tools/call"),
	params: CallToolRequestParamsSchema$1
});
/**
* An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
const ToolListChangedNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/tools/list_changed"),
	params: NotificationsParamsSchema$2.optional()
});
/**
* The severity of a log message.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const LoggingLevelSchema$2 = z.enum([
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency"
]);
/**
* Parameters for a `logging/setLevel` request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const SetLevelRequestParamsSchema$1 = BaseRequestParamsSchema$2.extend({ level: LoggingLevelSchema$2 });
/**
* A request from the client to the server, to enable or adjust logging.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const SetLevelRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("logging/setLevel"),
	params: SetLevelRequestParamsSchema$1
});
/**
* Parameters for a `notifications/message` notification.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const LoggingMessageNotificationParamsSchema$2 = NotificationsParamsSchema$2.extend({
	level: LoggingLevelSchema$2,
	logger: z.string().optional(),
	data: z.unknown()
});
/**
* Notification of a log message passed from server to client. If no `logging/setLevel` request has been sent from the client, the server MAY decide which messages to send automatically.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const LoggingMessageNotificationSchema$2 = NotificationSchema$2.extend({
	method: z.literal("notifications/message"),
	params: LoggingMessageNotificationParamsSchema$2
});
/**
* Hints to use for model selection.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ModelHintSchema$2 = z.object({ name: z.string().optional() });
/**
* The server's preferences for model selection, requested of the client during sampling.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ModelPreferencesSchema$2 = z.object({
	hints: z.array(ModelHintSchema$2).optional(),
	costPriority: z.number().min(0).max(1).optional(),
	speedPriority: z.number().min(0).max(1).optional(),
	intelligencePriority: z.number().min(0).max(1).optional()
});
/**
* Controls tool usage behavior in sampling requests.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ToolChoiceSchema$2 = z.object({ mode: z.enum([
	"auto",
	"required",
	"none"
]).optional() });
/**
* The result of a tool execution, provided by the user (server).
* Represents the outcome of invoking a tool requested via `ToolUseContent`.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ToolResultContentSchema$2 = z.object({
	type: z.literal("tool_result"),
	toolUseId: z.string().describe("The unique identifier for the corresponding tool call."),
	content: z.array(ContentBlockSchema$2),
	structuredContent: z.object({}).loose().optional(),
	isError: z.boolean().optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Basic content types for sampling responses (without tool use).
* Used for backwards-compatible {@linkcode CreateMessageResult} when tools are not used.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const SamplingContentSchema$1 = z.discriminatedUnion("type", [
	TextContentSchema$2,
	ImageContentSchema$2,
	AudioContentSchema$2
]);
/**
* Content block types allowed in sampling messages.
* This includes text, image, audio, tool use requests, and tool results.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const SamplingMessageContentBlockSchema$2 = z.discriminatedUnion("type", [
	TextContentSchema$2,
	ImageContentSchema$2,
	AudioContentSchema$2,
	ToolUseContentSchema$2,
	ToolResultContentSchema$2
]);
/**
* Describes a message issued to or received from an LLM API.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const SamplingMessageSchema$2 = z.object({
	role: RoleSchema$2,
	content: z.union([SamplingMessageContentBlockSchema$2, z.array(SamplingMessageContentBlockSchema$2)]),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Parameters for a `sampling/createMessage` request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageRequestParamsSchema$2 = TaskAugmentedRequestParamsSchema$2.extend({
	messages: z.array(SamplingMessageSchema$2),
	modelPreferences: ModelPreferencesSchema$2.optional(),
	systemPrompt: z.string().optional(),
	includeContext: z.enum([
		"none",
		"thisServer",
		"allServers"
	]).optional(),
	temperature: z.number().optional(),
	maxTokens: z.number().int(),
	stopSequences: z.array(z.string()).optional(),
	metadata: JSONObjectSchema$2.optional(),
	tools: z.array(ToolSchema$2).optional(),
	toolChoice: ToolChoiceSchema$2.optional()
});
/**
* A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("sampling/createMessage"),
	params: CreateMessageRequestParamsSchema$2
});
/**
* The client's response to a `sampling/create_message` request from the server.
* This is the backwards-compatible version that returns single content (no arrays).
* Used when the request does not include tools.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageResultSchema$2 = ResultSchema$2.extend({
	model: z.string(),
	stopReason: z.optional(z.enum([
		"endTurn",
		"stopSequence",
		"maxTokens"
	]).or(z.string())),
	role: RoleSchema$2,
	content: SamplingContentSchema$1
});
/**
* The client's response to a `sampling/create_message` request when tools were provided.
* This version supports array content for tool use flows.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageResultWithToolsSchema$1 = ResultSchema$2.extend({
	model: z.string(),
	stopReason: z.optional(z.enum([
		"endTurn",
		"stopSequence",
		"maxTokens",
		"toolUse"
	]).or(z.string())),
	role: RoleSchema$2,
	content: z.union([SamplingMessageContentBlockSchema$2, z.array(SamplingMessageContentBlockSchema$2)])
});
/**
* Primitive schema definition for boolean fields.
*/
const BooleanSchemaSchema$2 = z.object({
	type: z.literal("boolean"),
	title: z.string().optional(),
	description: z.string().optional(),
	default: z.boolean().optional()
});
/**
* Primitive schema definition for string fields.
*/
const StringSchemaSchema$2 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	minLength: z.number().optional(),
	maxLength: z.number().optional(),
	format: z.enum([
		"email",
		"uri",
		"date",
		"date-time"
	]).optional(),
	default: z.string().optional()
});
/**
* Primitive schema definition for number fields.
*/
const NumberSchemaSchema$2 = z.object({
	type: z.enum(["number", "integer"]),
	title: z.string().optional(),
	description: z.string().optional(),
	minimum: z.number().optional(),
	maximum: z.number().optional(),
	default: z.number().optional()
});
/**
* Schema for single-selection enumeration without display titles for options.
*/
const UntitledSingleSelectEnumSchemaSchema$2 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	enum: z.array(z.string()),
	default: z.string().optional()
});
/**
* Schema for single-selection enumeration with display titles for each option.
*/
const TitledSingleSelectEnumSchemaSchema$2 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	oneOf: z.array(z.object({
		const: z.string(),
		title: z.string()
	})),
	default: z.string().optional()
});
/**
* Use {@linkcode TitledSingleSelectEnumSchema} instead.
* This interface will be removed in a future version.
*/
const LegacyTitledEnumSchemaSchema$2 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	enum: z.array(z.string()),
	enumNames: z.array(z.string()).optional(),
	default: z.string().optional()
});
const SingleSelectEnumSchemaSchema$2 = z.union([UntitledSingleSelectEnumSchemaSchema$2, TitledSingleSelectEnumSchemaSchema$2]);
/**
* Schema for multiple-selection enumeration without display titles for options.
*/
const UntitledMultiSelectEnumSchemaSchema$2 = z.object({
	type: z.literal("array"),
	title: z.string().optional(),
	description: z.string().optional(),
	minItems: z.number().optional(),
	maxItems: z.number().optional(),
	items: z.object({
		type: z.literal("string"),
		enum: z.array(z.string())
	}),
	default: z.array(z.string()).optional()
});
/**
* Schema for multiple-selection enumeration with display titles for each option.
*/
const TitledMultiSelectEnumSchemaSchema$2 = z.object({
	type: z.literal("array"),
	title: z.string().optional(),
	description: z.string().optional(),
	minItems: z.number().optional(),
	maxItems: z.number().optional(),
	items: z.object({ anyOf: z.array(z.object({
		const: z.string(),
		title: z.string()
	})) }),
	default: z.array(z.string()).optional()
});
/**
* Combined schema for multiple-selection enumeration
*/
const MultiSelectEnumSchemaSchema$2 = z.union([UntitledMultiSelectEnumSchemaSchema$2, TitledMultiSelectEnumSchemaSchema$2]);
/**
* Primitive schema definition for enum fields.
*/
const EnumSchemaSchema$2 = z.union([
	LegacyTitledEnumSchemaSchema$2,
	SingleSelectEnumSchemaSchema$2,
	MultiSelectEnumSchemaSchema$2
]);
/**
* Union of all primitive schema definitions.
*/
const PrimitiveSchemaDefinitionSchema$2 = z.union([
	EnumSchemaSchema$2,
	BooleanSchemaSchema$2,
	StringSchemaSchema$2,
	NumberSchemaSchema$2
]);
/**
* Parameters for an `elicitation/create` request for form-based elicitation.
*/
const ElicitRequestFormParamsSchema$2 = TaskAugmentedRequestParamsSchema$2.extend({
	mode: z.literal("form").optional(),
	message: z.string(),
	requestedSchema: z.object({
		type: z.literal("object"),
		properties: z.record(z.string(), PrimitiveSchemaDefinitionSchema$2),
		required: z.array(z.string()).optional()
	}).catchall(z.unknown())
});
/**
* Parameters for an {@linkcode ElicitRequest | elicitation/create} request for URL-based elicitation.
*/
const ElicitRequestURLParamsSchema$2 = TaskAugmentedRequestParamsSchema$2.extend({
	mode: z.literal("url"),
	message: z.string(),
	elicitationId: z.string(),
	url: z.string().url()
});
/**
* The parameters for a request to elicit additional information from the user via the client.
*/
const ElicitRequestParamsSchema$2 = z.union([ElicitRequestFormParamsSchema$2, ElicitRequestURLParamsSchema$2]);
/**
* A request from the server to elicit user input via the client.
* The client should present the message and form fields to the user (form mode)
* or navigate to a URL (URL mode).
*/
const ElicitRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("elicitation/create"),
	params: ElicitRequestParamsSchema$2
});
/**
* Parameters for a {@linkcode ElicitationCompleteNotification | notifications/elicitation/complete} notification.
*
* @category notifications/elicitation/complete
*/
const ElicitationCompleteNotificationParamsSchema$1 = NotificationsParamsSchema$2.extend({ elicitationId: z.string() });
/**
* A notification from the server to the client, informing it of a completion of an out-of-band elicitation request.
*
* @category notifications/elicitation/complete
*/
const ElicitationCompleteNotificationSchema$1 = NotificationSchema$2.extend({
	method: z.literal("notifications/elicitation/complete"),
	params: ElicitationCompleteNotificationParamsSchema$1
});
/**
* The client's response to an {@linkcode ElicitRequest | elicitation/create} request from the server.
*/
const ElicitResultSchema$2 = ResultSchema$2.extend({
	action: z.enum([
		"accept",
		"decline",
		"cancel"
	]),
	content: z.preprocess((val) => val === null ? void 0 : val, z.record(z.string(), z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.array(z.string())
	])).optional())
});
/**
* A reference to a resource or resource template definition.
*/
const ResourceTemplateReferenceSchema$2 = z.object({
	type: z.literal("ref/resource"),
	uri: z.string()
});
/**
* Identifies a prompt.
*/
const PromptReferenceSchema$2 = z.object({
	type: z.literal("ref/prompt"),
	name: z.string()
});
/**
* Parameters for a {@linkcode CompleteRequest | completion/complete} request.
*/
const CompleteRequestParamsSchema$1 = BaseRequestParamsSchema$2.extend({
	ref: z.union([PromptReferenceSchema$2, ResourceTemplateReferenceSchema$2]),
	argument: z.object({
		name: z.string(),
		value: z.string()
	}),
	context: z.object({ arguments: z.record(z.string(), z.string()).optional() }).optional()
});
/**
* A request from the client to the server, to ask for completion options.
*/
const CompleteRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("completion/complete"),
	params: CompleteRequestParamsSchema$1
});
/**
* The server's response to a {@linkcode CompleteRequest | completion/complete} request
*/
const CompleteResultSchema$2 = ResultSchema$2.extend({ completion: z.looseObject({
	values: z.array(z.string()).max(100),
	total: z.optional(z.number().int()),
	hasMore: z.optional(z.boolean())
}) });
/**
* Represents a root directory or file that the server can operate on.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const RootSchema$2 = z.object({
	uri: z.string().startsWith("file://"),
	name: z.string().optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Sent from the server to request a list of root URIs from the client.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const ListRootsRequestSchema$2 = RequestSchema$1.extend({
	method: z.literal("roots/list"),
	params: BaseRequestParamsSchema$2.optional()
});
/**
* The client's response to a `roots/list` request from the server.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const ListRootsResultSchema$2 = ResultSchema$2.extend({ roots: z.array(RootSchema$2) });
/**
* A notification from the client to the server, informing it that the list of roots has changed.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const RootsListChangedNotificationSchema$1 = NotificationSchema$2.extend({
	method: z.literal("notifications/roots/list_changed"),
	params: NotificationsParamsSchema$2.optional()
});
/**
* Task creation parameters, used to ask that the server create a task to represent a request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskCreationParamsSchema$1 = z.looseObject({
	ttl: z.number().optional(),
	pollInterval: z.number().optional()
});
/**
* The status of a task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskStatusSchema$1 = z.enum([
	"working",
	"input_required",
	"completed",
	"failed",
	"cancelled"
]);
/**
* A pollable state object associated with a request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskSchema$1 = z.object({
	taskId: z.string(),
	status: TaskStatusSchema$1,
	ttl: z.union([z.number(), z.null()]),
	createdAt: z.string(),
	lastUpdatedAt: z.string(),
	pollInterval: z.optional(z.number()),
	statusMessage: z.optional(z.string())
});
/**
* Result returned when a task is created, containing the task data wrapped in a `task` field.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const CreateTaskResultSchema$1 = ResultSchema$2.extend({ task: TaskSchema$1 });
/**
* Parameters for task status notification.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskStatusNotificationParamsSchema$1 = NotificationsParamsSchema$2.merge(TaskSchema$1);
/**
* A notification sent when a task's status changes.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskStatusNotificationSchema$1 = NotificationSchema$2.extend({
	method: z.literal("notifications/tasks/status"),
	params: TaskStatusNotificationParamsSchema$1
});
/**
* A request to get the state of a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("tasks/get"),
	params: BaseRequestParamsSchema$2.extend({ taskId: z.string() })
});
/**
* The response to a {@linkcode GetTaskRequest | tasks/get} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskResultSchema$1 = ResultSchema$2.merge(TaskSchema$1);
/**
* A request to get the result of a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskPayloadRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("tasks/result"),
	params: BaseRequestParamsSchema$2.extend({ taskId: z.string() })
});
/**
* The response to a `tasks/result` request.
* The structure matches the result type of the original request.
* For example, a {@linkcode CallToolRequest | tools/call} task would return the `CallToolResult` structure.
*
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskPayloadResultSchema$1 = ResultSchema$2.loose();
/**
* A request to list tasks.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ListTasksRequestSchema$1 = PaginatedRequestSchema$1.extend({ method: z.literal("tasks/list") });
/**
* The response to a {@linkcode ListTasksRequest | tasks/list} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ListTasksResultSchema$1 = PaginatedResultSchema$2.extend({ tasks: z.array(TaskSchema$1) });
/**
* A request to cancel a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const CancelTaskRequestSchema$1 = RequestSchema$1.extend({
	method: z.literal("tasks/cancel"),
	params: BaseRequestParamsSchema$2.extend({ taskId: z.string() })
});
/**
* The response to a {@linkcode CancelTaskRequest | tasks/cancel} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const CancelTaskResultSchema$1 = ResultSchema$2.merge(TaskSchema$1);
const ClientRequestSchema$1 = z.union([
	PingRequestSchema$1,
	InitializeRequestSchema$1,
	CompleteRequestSchema$2,
	SetLevelRequestSchema$1,
	GetPromptRequestSchema$2,
	ListPromptsRequestSchema$2,
	ListResourcesRequestSchema$2,
	ListResourceTemplatesRequestSchema$2,
	ReadResourceRequestSchema$2,
	SubscribeRequestSchema$1,
	UnsubscribeRequestSchema$1,
	CallToolRequestSchema$2,
	ListToolsRequestSchema$2,
	GetTaskRequestSchema$1,
	GetTaskPayloadRequestSchema$1,
	ListTasksRequestSchema$1,
	CancelTaskRequestSchema$1
]);
const ClientNotificationSchema$1 = z.union([
	CancelledNotificationSchema$2,
	ProgressNotificationSchema$2,
	InitializedNotificationSchema$1,
	RootsListChangedNotificationSchema$1,
	TaskStatusNotificationSchema$1
]);
const ClientResultSchema$1 = z.union([
	EmptyResultSchema$1,
	CreateMessageResultSchema$2,
	CreateMessageResultWithToolsSchema$1,
	ElicitResultSchema$2,
	ListRootsResultSchema$2,
	GetTaskResultSchema$1,
	ListTasksResultSchema$1,
	CreateTaskResultSchema$1
]);
const ServerRequestSchema$1 = z.union([
	PingRequestSchema$1,
	CreateMessageRequestSchema$2,
	ElicitRequestSchema$2,
	ListRootsRequestSchema$2,
	GetTaskRequestSchema$1,
	GetTaskPayloadRequestSchema$1,
	ListTasksRequestSchema$1,
	CancelTaskRequestSchema$1
]);
const ServerNotificationSchema$1 = z.union([
	CancelledNotificationSchema$2,
	ProgressNotificationSchema$2,
	LoggingMessageNotificationSchema$2,
	ResourceUpdatedNotificationSchema$2,
	ResourceListChangedNotificationSchema$2,
	ToolListChangedNotificationSchema$2,
	PromptListChangedNotificationSchema$2,
	TaskStatusNotificationSchema$1,
	ElicitationCompleteNotificationSchema$1
]);
const ServerResultSchema$1 = z.union([
	EmptyResultSchema$1,
	InitializeResultSchema$1,
	CompleteResultSchema$2,
	GetPromptResultSchema$2,
	ListPromptsResultSchema$2,
	ListResourcesResultSchema$2,
	ListResourceTemplatesResultSchema$2,
	ReadResourceResultSchema$2,
	CallToolResultSchema$2,
	ListToolsResultSchema$2,
	GetTaskResultSchema$1,
	ListTasksResultSchema$1,
	CreateTaskResultSchema$1
]);

//#endregion
//#region ../core-internal/src/wire/rev2025-11-25/registry.ts
const resultSchemas = {
	ping: EmptyResultSchema$1,
	initialize: InitializeResultSchema$1,
	"completion/complete": CompleteResultSchema$2,
	"logging/setLevel": EmptyResultSchema$1,
	"prompts/get": GetPromptResultSchema$2,
	"prompts/list": ListPromptsResultSchema$2,
	"resources/list": ListResourcesResultSchema$2,
	"resources/templates/list": ListResourceTemplatesResultSchema$2,
	"resources/read": ReadResourceResultSchema$2,
	"resources/subscribe": EmptyResultSchema$1,
	"resources/unsubscribe": EmptyResultSchema$1,
	"tools/call": CallToolResultSchema$2,
	"tools/list": ListToolsResultSchema$2,
	"sampling/createMessage": CreateMessageResultWithToolsSchema$1,
	"elicitation/create": ElicitResultSchema$2,
	"roots/list": ListRootsResultSchema$2
};
const requestSchemas = {
	ping: PingRequestSchema$1,
	initialize: InitializeRequestSchema$1,
	"completion/complete": CompleteRequestSchema$2,
	"logging/setLevel": SetLevelRequestSchema$1,
	"prompts/get": GetPromptRequestSchema$2,
	"prompts/list": ListPromptsRequestSchema$2,
	"resources/list": ListResourcesRequestSchema$2,
	"resources/templates/list": ListResourceTemplatesRequestSchema$2,
	"resources/read": ReadResourceRequestSchema$2,
	"resources/subscribe": SubscribeRequestSchema$1,
	"resources/unsubscribe": UnsubscribeRequestSchema$1,
	"tools/call": CallToolRequestSchema$2,
	"tools/list": ListToolsRequestSchema$2,
	"tasks/get": GetTaskRequestSchema$1,
	"tasks/result": GetTaskPayloadRequestSchema$1,
	"tasks/list": ListTasksRequestSchema$1,
	"tasks/cancel": CancelTaskRequestSchema$1,
	"sampling/createMessage": CreateMessageRequestSchema$2,
	"elicitation/create": ElicitRequestSchema$2,
	"roots/list": ListRootsRequestSchema$2
};
const notificationSchemas = {
	"notifications/cancelled": CancelledNotificationSchema$2,
	"notifications/progress": ProgressNotificationSchema$2,
	"notifications/initialized": InitializedNotificationSchema$1,
	"notifications/roots/list_changed": RootsListChangedNotificationSchema$1,
	"notifications/tasks/status": TaskStatusNotificationSchema$1,
	"notifications/message": LoggingMessageNotificationSchema$2,
	"notifications/resources/updated": ResourceUpdatedNotificationSchema$2,
	"notifications/resources/list_changed": ResourceListChangedNotificationSchema$2,
	"notifications/tools/list_changed": ToolListChangedNotificationSchema$2,
	"notifications/prompts/list_changed": PromptListChangedNotificationSchema$2,
	"notifications/elicitation/complete": ElicitationCompleteNotificationSchema$1
};
/** The 2025-era request-method set (registry membership = the deletion story). */
function hasRequestMethod2025(method) {
	return Object.prototype.hasOwnProperty.call(requestSchemas, method);
}
/** The 2025-era notification-method set. */
function hasNotificationMethod2025(method) {
	return Object.prototype.hasOwnProperty.call(notificationSchemas, method);
}
/** Result-map membership: exactly the era's typed-method subset (no task entries, no 2026-only methods). */
function hasResultMethod(method) {
	return Object.prototype.hasOwnProperty.call(resultSchemas, method);
}
function getResultSchema(method) {
	return hasResultMethod(method) ? resultSchemas[method] : void 0;
}
function getRequestSchema(method) {
	return hasRequestMethod2025(method) ? requestSchemas[method] : void 0;
}
function getNotificationSchema(method) {
	return hasNotificationMethod2025(method) ? notificationSchemas[method] : void 0;
}
/** Registry method lists (for the spec-method universe and the CI registry-diff oracle). */
const rev2025RequestMethods = Object.keys(requestSchemas);
const rev2025NotificationMethods = Object.keys(notificationSchemas);

//#endregion
//#region ../core-internal/src/wire/rev2025-11-25/codec.ts
function isPlainObject$5(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Tri-state wrap of an optional Zod schema lookup (the function-only contract). */
function triState$1(schema, raw) {
	if (schema === void 0) return {
		ok: false,
		reason: "not-in-era"
	};
	const parsed = schema.safeParse(raw);
	return parsed.success ? {
		ok: true,
		value: parsed.data
	} : {
		ok: false,
		reason: "invalid",
		message: String(parsed.error)
	};
}
const NOT_IN_ERA$1 = {
	ok: false,
	reason: "not-in-era"
};
/** Whether a `tools/list` entry advertises a non-object `outputSchema` root that needs the SEP-2106 legacy wrap. */
function toolNeedsLegacyWrap(t) {
	return isPlainObject$5(t) && isPlainObject$5(t["outputSchema"]) && isNonObjectJsonSchemaRoot(t["outputSchema"]);
}
/** The wire→neutral trust boundary: a decoded 2025-era wire result is adopted as the neutral `Result` here (the module's single deliberate assertion). */
function toNeutralResult(value) {
	return value;
}
const rev2025Codec = {
	era: "2025-11-25",
	hasRequestMethod: hasRequestMethod2025,
	hasNotificationMethod: hasNotificationMethod2025,
	validateRequest: (method, raw) => triState$1(getRequestSchema(method), raw),
	validateResult: (method, raw) => triState$1(getResultSchema(method), raw),
	validateNotification: (method, raw) => triState$1(getNotificationSchema(method), raw),
	hasInputRequestMethod: () => false,
	validateInputRequest: () => NOT_IN_ERA$1,
	validateInputResponse: () => NOT_IN_ERA$1,
	samplingResultVariant: ((hasTools, raw) => triState$1(hasTools ? CreateMessageResultWithToolsSchema$1 : CreateMessageResultSchema$2, raw)),
	outboundEnvelope: (_material) => void 0,
	validateEnvelopeMeta: (_meta) => [],
	projectCallToolResult(result, advertisedOutputSchema) {
		const withText = appendTextFallbackForNonObject(result);
		const sc = withText.structuredContent;
		if (sc === void 0) return withText;
		const valueIsNonObject = typeof sc !== "object" || sc === null || Array.isArray(sc);
		const schemaWrapped = advertisedOutputSchema !== void 0 && isNonObjectJsonSchemaRoot(advertisedOutputSchema);
		if (!valueIsNonObject && !schemaWrapped) return withText;
		return {
			...withText,
			structuredContent: { result: sc }
		};
	},
	decodeResult(_method, raw) {
		if (isPlainObject$5(raw) && "resultType" in raw) {
			const stripped = { ...raw };
			delete stripped["resultType"];
			return {
				kind: "complete",
				result: toNeutralResult(stripped)
			};
		}
		return {
			kind: "complete",
			result: toNeutralResult(raw)
		};
	},
	encodeResult(method, result) {
		if (method !== "tools/list") return result;
		const tools = result.tools;
		if (!Array.isArray(tools) || !tools.some((t) => toolNeedsLegacyWrap(t))) return result;
		return {
			...result,
			tools: tools.map((t) => toolNeedsLegacyWrap(t) ? {
				...t,
				outputSchema: wrapOutputSchemaForLegacy(t.outputSchema)
			} : t)
		};
	},
	encodeErrorCode: (code) => code === -32002 ? -32602 : code,
	checkInboundEnvelope: (_material) => void 0
};

//#endregion
//#region ../core-internal/src/shared/resultCacheHints.ts
/**
* The operations whose results are cacheable on the 2026-07-28 revision (the
* `CacheableResult` extenders). This list is closed: no other operation's
* result ever receives cache fields from the SDK.
*/
const CACHEABLE_RESULT_METHODS = [
	"tools/list",
	"prompts/list",
	"resources/list",
	"resources/templates/list",
	"resources/read",
	"server/discover"
];
/** Whether the given method's result is cacheable on the 2026-07-28 revision. */
function isCacheableResultMethod(method) {
	return CACHEABLE_RESULT_METHODS.includes(method);
}
/**
* The symbol-keyed carrier for a configured cache hint on a result object.
* Symbol properties are invisible to JSON serialization, so the carrier can be
* attached era-blind: only the 2026-era encode seam consumes it.
*/
const RESULT_CACHE_HINT_FALLBACK = Symbol("modelcontextprotocol.resultCacheHintFallback");
/**
* Attaches a configured cache hint to a result as the encode-time fallback.
* Returns the result unchanged when there is nothing to attach. When a more
* specific hint is already attached, the two hints are combined per field
* (most-specific-author-wins for each of `ttlMs` and `cacheScope`): the
* per-registration hint attached by the feature layer keeps every field it
* sets, and the server-level per-operation hint only fills the fields the
* more specific hint leaves unset.
*/
function attachCacheHintFallback(result, hint) {
	if (hint === void 0) return result;
	const attached = result[RESULT_CACHE_HINT_FALLBACK];
	if (attached === void 0) return {
		...result,
		[RESULT_CACHE_HINT_FALLBACK]: hint
	};
	const merged = {};
	const ttlMs = attached.ttlMs ?? hint.ttlMs;
	if (ttlMs !== void 0) merged.ttlMs = ttlMs;
	const cacheScope = attached.cacheScope ?? hint.cacheScope;
	if (cacheScope !== void 0) merged.cacheScope = cacheScope;
	return {
		...result,
		[RESULT_CACHE_HINT_FALLBACK]: merged
	};
}
/** Reads the configured cache-hint fallback attached to a result, if any. */
function cacheHintFallbackOf(result) {
	return result[RESULT_CACHE_HINT_FALLBACK];
}
/**
* Whether a value is a valid `ttlMs`: a non-negative safe integer. Safe
* integers are required because the wire schemas validate `ttlMs` as an
* integer within `Number.MIN_SAFE_INTEGER`/`Number.MAX_SAFE_INTEGER`; a value
* outside that range is treated as invalid here so it falls through to the
* next author instead of being emitted and rejected downstream.
*/
function isValidCacheTtlMs(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
/** Whether a value is a valid `cacheScope`. */
function isValidCacheScope(value) {
	return value === "public" || value === "private";
}
/**
* Validates a configured cache hint at configuration time. Throws a
* `RangeError` naming the offending field, so misconfiguration fails at
* startup/registration rather than silently degrading at encode time.
*/
function assertValidCacheHint(hint, context) {
	if (hint.ttlMs !== void 0 && !isValidCacheTtlMs(hint.ttlMs)) throw new RangeError(`Invalid cache hint for ${context}: ttlMs must be a non-negative safe integer (got ${String(hint.ttlMs)})`);
	if (hint.cacheScope !== void 0 && !isValidCacheScope(hint.cacheScope)) throw new RangeError(`Invalid cache hint for ${context}: cacheScope must be 'public' or 'private' (got ${String(hint.cacheScope)})`);
}

//#endregion
//#region ../core-internal/src/types/enums.ts
/**
* Error codes for protocol errors that cross the wire as JSON-RPC error responses.
* These follow the JSON-RPC specification and MCP-specific extensions.
*/
let ProtocolErrorCode = /* @__PURE__ */ function(ProtocolErrorCode$1) {
	ProtocolErrorCode$1[ProtocolErrorCode$1["ParseError"] = -32700] = "ParseError";
	ProtocolErrorCode$1[ProtocolErrorCode$1["InvalidRequest"] = -32600] = "InvalidRequest";
	ProtocolErrorCode$1[ProtocolErrorCode$1["MethodNotFound"] = -32601] = "MethodNotFound";
	ProtocolErrorCode$1[ProtocolErrorCode$1["InvalidParams"] = -32602] = "InvalidParams";
	ProtocolErrorCode$1[ProtocolErrorCode$1["InternalError"] = -32603] = "InternalError";
	/**
	* Resource not found.
	*
	* Receive-tolerated only: the SDK never EMITS `-32002` — `resources/read`
	* misses answer `-32602` (Invalid Params) on every protocol revision per
	* the 2026-07-28 spec MUST, and a handler-thrown `-32002` is mapped to
	* `-32602` at the era encode seam. The member stays importable so clients
	* can recognise `-32002` from peers built on earlier SDK releases (the
	* spec's "clients SHOULD also accept `-32002`" backwards-compatibility
	* clause). Throw `ResourceNotFoundError` instead.
	*/
	ProtocolErrorCode$1[ProtocolErrorCode$1["ResourceNotFound"] = -32002] = "ResourceNotFound";
	/**
	* Processing the request requires a capability the client did not declare
	* in the request's `clientCapabilities` (protocol revision 2026-07-28).
	*/
	ProtocolErrorCode$1[ProtocolErrorCode$1["MissingRequiredClientCapability"] = -32021] = "MissingRequiredClientCapability";
	/**
	* The request's protocol version is unknown to the server or unsupported
	* by it (protocol revision 2026-07-28).
	*/
	ProtocolErrorCode$1[ProtocolErrorCode$1["UnsupportedProtocolVersion"] = -32022] = "UnsupportedProtocolVersion";
	ProtocolErrorCode$1[ProtocolErrorCode$1["UrlElicitationRequired"] = -32042] = "UrlElicitationRequired";
	return ProtocolErrorCode$1;
}({});

//#endregion
//#region ../core-internal/src/types/errors.ts
/**
* Protocol errors are JSON-RPC errors that cross the wire as error responses.
* They use numeric error codes from the {@linkcode ProtocolErrorCode} enum.
*/
var ProtocolError = class ProtocolError extends Error {
	constructor(code, message, data) {
		super(message);
		this.code = code;
		this.data = data;
		this.name = "ProtocolError";
	}
	/**
	* Factory method to create the appropriate error type based on the error code and data
	*/
	static fromError(code, message, data) {
		if (code === ProtocolErrorCode.UrlElicitationRequired && data) {
			const errorData = data;
			if (errorData.elicitations) return new UrlElicitationRequiredError(errorData.elicitations, message);
		}
		if (code === ProtocolErrorCode.UnsupportedProtocolVersion && data) {
			const errorData = data;
			if (Array.isArray(errorData.supported) && typeof errorData.requested === "string") return new UnsupportedProtocolVersionError({
				supported: errorData.supported,
				requested: errorData.requested
			}, message);
		}
		if (code === ProtocolErrorCode.InvalidParams || code === ProtocolErrorCode.ResourceNotFound) {
			const errorData = data;
			if (typeof errorData?.uri === "string" && (code === ProtocolErrorCode.ResourceNotFound || Object.keys(errorData).length === 1)) return new ResourceNotFoundError(errorData.uri, message);
		}
		if (code === ProtocolErrorCode.MissingRequiredClientCapability && data) {
			const errorData = data;
			if (errorData.requiredCapabilities !== null && typeof errorData.requiredCapabilities === "object" && !Array.isArray(errorData.requiredCapabilities)) return new MissingRequiredClientCapabilityError({ requiredCapabilities: errorData.requiredCapabilities }, message);
		}
		return new ProtocolError(code, message, data);
	}
};
/**
* Error type for a `resources/read` miss: the requested resource does not
* exist. The wire code is `-32602` (Invalid Params) on every protocol
* revision — the spec MUST for revision 2026-07-28, and the value the v1.x
* SDK has always emitted on earlier revisions. The error data echoes the
* requested URI.
*
* Recognise this error by checking `error.data` is exactly `{ uri: string }`
* (a `-32602` whose data carries `uri` and nothing else is resource-not-found;
* any other `-32602` is an ordinary Invalid Params). For backwards compatibility, clients should also
* accept `-32002` as resource not found — earlier SDK builds emitted that
* code, and {@linkcode ProtocolError.fromError} reconstructs this class for
* either code **when `error.data` carries `uri`** (a bare `-32002` without
* `data.uri` stays a generic {@linkcode ProtocolError}). Do not rely on
* `instanceof` — it does not work across separately bundled copies of the
* SDK.
*/
var ResourceNotFoundError = class extends ProtocolError {
	constructor(uri, message = `Resource not found: ${uri}`) {
		super(ProtocolErrorCode.InvalidParams, message, { uri });
	}
	/** The URI that was requested and not found. */
	get uri() {
		return this.data.uri;
	}
};
/**
* Specialized error type when a tool requires a URL mode elicitation.
* This makes it nicer for the client to handle since there is specific data to work with instead of just a code to check against.
*/
var UrlElicitationRequiredError = class extends ProtocolError {
	constructor(elicitations, message = `URL elicitation${elicitations.length > 1 ? "s" : ""} required`) {
		super(ProtocolErrorCode.UrlElicitationRequired, message, { elicitations });
	}
	get elicitations() {
		return this.data?.elicitations ?? [];
	}
};
/**
* Error type for the `-32022` UnsupportedProtocolVersion protocol error (protocol
* revision 2026-07-28): the request's protocol version is unknown to the server or
* unsupported by it.
*
* The error data lists the protocol versions the receiver supports (`supported`),
* so the sender can choose a mutually supported version and retry, and echoes the
* version that was requested (`requested`).
*/
var UnsupportedProtocolVersionError = class extends ProtocolError {
	constructor(data, message = `Unsupported protocol version: ${data.requested}`) {
		super(ProtocolErrorCode.UnsupportedProtocolVersion, message, data);
	}
	/**
	* Protocol versions the receiver supports.
	*/
	get supported() {
		return this.data.supported;
	}
	/**
	* The protocol version that was requested.
	*/
	get requested() {
		return this.data.requested;
	}
};
/**
* Error type for the `-32021` MissingRequiredClientCapability protocol error
* (protocol revision 2026-07-28): processing the request requires a capability
* the client did not declare in the request's `clientCapabilities`.
*
* The error data lists the missing capabilities (`requiredCapabilities`) in
* the `ClientCapabilities` shape, so the client can see exactly what it would
* have to declare for the request to be served. On HTTP, the response status
* is `400 Bad Request`.
*
* Recognize this error by its code and `data.requiredCapabilities` rather than
* by class identity (`instanceof` does not work across separately bundled
* copies of the SDK).
*/
var MissingRequiredClientCapabilityError = class extends ProtocolError {
	constructor(data, message = `Missing required client capabilities: ${Object.keys(data.requiredCapabilities).join(", ")}`) {
		super(ProtocolErrorCode.MissingRequiredClientCapability, message, data);
	}
	/**
	* The capabilities the server requires from the client to process the
	* request (only the missing capabilities are listed).
	*/
	get requiredCapabilities() {
		return this.data.requiredCapabilities;
	}
};

//#endregion
//#region ../core-internal/src/wire/rev2026-07-28/encodeContract.ts
/** The default cache policy when neither the handler nor configuration provides one. */
const DEFAULT_CACHE_TTL_MS = 0;
const DEFAULT_CACHE_SCOPE = "private";
/**
* Request methods whose spec result vocabulary goes beyond `'complete'` on the
* 2026-07-28 revision: their results may be `input_required` (multi
* round-trip requests), so a handler-provided `resultType` passes through the
* stamp untouched. `subscriptions/listen` is NOT in this set: it never emits
* a JSON-RPC result — termination is stream close (HTTP) or
* `notifications/cancelled` (stdio) per the spec.
*/
const EXTENDED_RESULT_TYPE_METHODS = [
	"tools/call",
	"prompts/get",
	"resources/read"
];
/**
* Step 1 of the encode contract: ensure the outbound result carries the
* required `resultType` discriminator.
*
* - No handler-provided value → stamp `'complete'`.
* - Handler-provided `'complete'` → kept as-is.
* - Handler-provided non-`'complete'` value on a method whose vocabulary
*   allows it ({@linkcode EXTENDED_RESULT_TYPE_METHODS}) → passes through.
*   The value is forwarded verbatim — the wire vocabulary is an open union and
*   the SDK does not validate the string, so emitting a `resultType` the
*   negotiated revision does not define is the handler author's
*   responsibility.
* - Handler-provided non-`'complete'` value on any other method → internal
*   error (loud): the value would be mis-typed on the wire, and silently
*   rewriting it would hide a server bug.
*/
function stampResultType(method, result) {
	const provided = result["resultType"];
	if (provided === void 0) return {
		...result,
		resultType: "complete"
	};
	if (provided === "complete") return result;
	if (EXTENDED_RESULT_TYPE_METHODS.includes(method)) return result;
	throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned resultType '${String(provided)}', but results of ${method} only support 'complete' on protocol revision 2026-07-28`);
}
/**
* Step 2 of the encode contract: fill the required `ttlMs`/`cacheScope` fields
* on cacheable results.
*
* Applies only when the (post-stamp) `resultType` is `'complete'` and the
* method is one of the cacheable operations; everything else is returned
* untouched apart from removing the configured-hint carrier. Field resolution
* is per field, most specific author first: a valid handler-returned value,
* then the configured cache hint attached by the server layer, then the
* defaults. Handler-returned values are validated at encode time (`ttlMs`
* must be a non-negative integer, `cacheScope` must be `'public'` or
* `'private'`); invalid values are ignored rather than emitted.
*/
function fillCacheFields(method, result) {
	const fallback = cacheHintFallbackOf(result);
	if (result["resultType"] !== "complete" || !isCacheableResultMethod(method)) return fallback === void 0 ? result : stripCacheHintFallback(result);
	const provided = result;
	const ttlMs = isValidCacheTtlMs(provided["ttlMs"]) ? provided["ttlMs"] : resolveTtlMs(fallback);
	const cacheScope = isValidCacheScope(provided["cacheScope"]) ? provided["cacheScope"] : resolveCacheScope(fallback);
	const filled = {
		...provided,
		ttlMs,
		cacheScope
	};
	delete filled[RESULT_CACHE_HINT_FALLBACK];
	return filled;
}
function resolveTtlMs(fallback) {
	return fallback !== void 0 && isValidCacheTtlMs(fallback.ttlMs) ? fallback.ttlMs : DEFAULT_CACHE_TTL_MS;
}
function resolveCacheScope(fallback) {
	return fallback !== void 0 && isValidCacheScope(fallback.cacheScope) ? fallback.cacheScope : DEFAULT_CACHE_SCOPE;
}
function stripCacheHintFallback(result) {
	const copy = { ...result };
	delete copy[RESULT_CACHE_HINT_FALLBACK];
	return copy;
}

//#endregion
//#region ../core-internal/src/wire/rev2026-07-28/schemas.ts
/**
* 2026-era wire schemas (protocol revision 2026-07-28).
*
* Fully self-contained — no runtime imports from types/schemas.ts. The
* neutral types/schemas.ts layer is the public-API superset and is free to
* evolve; this file is the 2026 wire-parse contract and is BEHAVIOR-FROZEN
* against the 2026-07-28 anchor. Every era-shared building block (content
* blocks, resources, prompts, capabilities, notifications, …) that the wire
* shapes compose is a frozen LOCAL copy — verbatim from the neutral layer at
* the point this revision was sealed, dependencies first. The only cross-layer
* dependency is `import type { JSONObject, JSONValue }` from the neutral types
* barrel — pure structural type aliases with no parse behavior.
*
* This module is the only place the per-request `_meta` envelope is modeled.
* The envelope is wire-only vocabulary: the protocol layer lifts it off
* inbound requests before any handler runs and surfaces it at
* `ctx.mcpReq.envelope`; the 2026-era codec enforces its requiredness at
* dispatch time (`checkInboundEnvelope`) - the former neutral-schema JSDoc
* deferral ("enforced per request at dispatch time, not here") is now
* discharged by that codec step.
*
* No 2025-era traffic ever touches this module, so requiredness here is
* bare and spec-exact (the shared-schema `.catch` hazards do not apply).
*/
const JSONValueSchema$1 = z.lazy(() => z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.record(z.string(), JSONValueSchema$1),
	z.array(JSONValueSchema$1)
]));
const JSONObjectSchema$1 = z.record(z.string(), JSONValueSchema$1);
/**
* A progress token, used to associate progress notifications with the original request.
*/
const ProgressTokenSchema$1 = z.union([z.string(), z.number().int()]);
/**
* An opaque token used to represent a cursor for pagination.
*/
const CursorSchema$1 = z.string();
/**
* A uniquely identifying ID for a request in JSON-RPC.
*/
const RequestIdSchema$1 = z.union([z.string(), z.number().int()]);
/**
* The sender or recipient of messages and data in a conversation.
*/
const RoleSchema$1 = z.enum(["user", "assistant"]);
/**
* The severity of a log message.
*/
const LoggingLevelSchema$1 = z.enum([
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency"
]);
/**
* A Zod schema for validating Base64 strings that is more performant and
* robust for very large inputs than the default regex-based check. It avoids
* stack overflows by using the native `atob` function for validation.
*/
const Base64Schema$1 = z.string().refine((val) => {
	try {
		atob(val);
		return true;
	} catch {
		return false;
	}
}, { message: "Invalid Base64 string" });
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const TaskMetadataSchema$1 = z.object({ ttl: z.number().optional() });
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const RelatedTaskMetadataSchema$1 = z.object({ taskId: z.string() });
const RequestMetaSchema$1 = z.looseObject({
	progressToken: ProgressTokenSchema$1.optional(),
	"io.modelcontextprotocol/related-task": RelatedTaskMetadataSchema$1.optional()
});
const BaseRequestParamsSchema$1 = z.object({ _meta: RequestMetaSchema$1.optional() });
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const TaskAugmentedRequestParamsSchema$1 = BaseRequestParamsSchema$1.extend({ task: TaskMetadataSchema$1.optional() });
const NotificationsParamsSchema$1 = z.object({ _meta: RequestMetaSchema$1.optional() });
const NotificationSchema$1 = z.object({
	method: z.string(),
	params: NotificationsParamsSchema$1.loose().optional()
});
const IconSchema$1 = z.object({
	src: z.string(),
	mimeType: z.string().optional(),
	sizes: z.array(z.string()).optional(),
	theme: z.enum(["light", "dark"]).optional()
});
const IconsSchema$1 = z.object({ icons: z.array(IconSchema$1).optional() });
const BaseMetadataSchema$1 = z.object({
	name: z.string(),
	title: z.string().optional()
});
const ImplementationSchema$1 = BaseMetadataSchema$1.extend({
	...BaseMetadataSchema$1.shape,
	...IconsSchema$1.shape,
	version: z.string(),
	websiteUrl: z.string().optional(),
	description: z.string().optional()
});
const FormElicitationCapabilitySchema$1 = z.intersection(z.object({ applyDefaults: z.boolean().optional() }), JSONObjectSchema$1);
const ElicitationCapabilitySchema$1 = z.preprocess((value) => {
	if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return { form: {} };
	return value;
}, z.intersection(z.object({
	form: FormElicitationCapabilitySchema$1.optional(),
	url: JSONObjectSchema$1.optional()
}), JSONObjectSchema$1.optional()));
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const ClientTasksCapabilitySchema$1 = z.looseObject({
	list: JSONObjectSchema$1.optional(),
	cancel: JSONObjectSchema$1.optional(),
	requests: z.looseObject({
		sampling: z.looseObject({ createMessage: JSONObjectSchema$1.optional() }).optional(),
		elicitation: z.looseObject({ create: JSONObjectSchema$1.optional() }).optional()
	}).optional()
});
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const ServerTasksCapabilitySchema$1 = z.looseObject({
	list: JSONObjectSchema$1.optional(),
	cancel: JSONObjectSchema$1.optional(),
	requests: z.looseObject({ tools: z.looseObject({ call: JSONObjectSchema$1.optional() }).optional() }).optional()
});
const ClientCapabilitiesSchema$1 = z.object({
	experimental: z.record(z.string(), JSONObjectSchema$1).optional(),
	sampling: z.object({
		context: JSONObjectSchema$1.optional(),
		tools: JSONObjectSchema$1.optional()
	}).optional(),
	elicitation: ElicitationCapabilitySchema$1.optional(),
	roots: z.object({ listChanged: z.boolean().optional() }).optional(),
	tasks: ClientTasksCapabilitySchema$1.optional(),
	extensions: z.record(z.string(), JSONObjectSchema$1).optional()
});
const ServerCapabilitiesSchema$1 = z.object({
	experimental: z.record(z.string(), JSONObjectSchema$1).optional(),
	logging: JSONObjectSchema$1.optional(),
	completions: JSONObjectSchema$1.optional(),
	prompts: z.object({ listChanged: z.boolean().optional() }).optional(),
	resources: z.object({
		subscribe: z.boolean().optional(),
		listChanged: z.boolean().optional()
	}).optional(),
	tools: z.object({ listChanged: z.boolean().optional() }).optional(),
	tasks: ServerTasksCapabilitySchema$1.optional(),
	extensions: z.record(z.string(), JSONObjectSchema$1).optional()
});
const ProgressSchema$1 = z.object({
	progress: z.number(),
	total: z.optional(z.number()),
	message: z.optional(z.string())
});
const ProgressNotificationParamsSchema$1 = z.object({
	...NotificationsParamsSchema$1.shape,
	...ProgressSchema$1.shape,
	progressToken: ProgressTokenSchema$1
});
const ProgressNotificationSchema$1 = NotificationSchema$1.extend({
	method: z.literal("notifications/progress"),
	params: ProgressNotificationParamsSchema$1
});
const LoggingMessageNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({
	level: LoggingLevelSchema$1,
	logger: z.string().optional(),
	data: z.unknown()
});
const LoggingMessageNotificationSchema$1 = NotificationSchema$1.extend({
	method: z.literal("notifications/message"),
	params: LoggingMessageNotificationParamsSchema$1
});
const ResourceContentsSchema$1 = z.object({
	uri: z.string(),
	mimeType: z.optional(z.string()),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const TextResourceContentsSchema$1 = ResourceContentsSchema$1.extend({ text: z.string() });
const BlobResourceContentsSchema$1 = ResourceContentsSchema$1.extend({ blob: Base64Schema$1 });
const AnnotationsSchema$1 = z.object({
	audience: z.array(RoleSchema$1).optional(),
	priority: z.number().min(0).max(1).optional(),
	lastModified: z.iso.datetime({ offset: true }).optional()
});
const ResourceSchema$1 = z.object({
	...BaseMetadataSchema$1.shape,
	...IconsSchema$1.shape,
	uri: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string()),
	size: z.optional(z.number()),
	annotations: AnnotationsSchema$1.optional(),
	_meta: z.optional(z.looseObject({}))
});
const ResourceTemplateSchema$1 = z.object({
	...BaseMetadataSchema$1.shape,
	...IconsSchema$1.shape,
	uriTemplate: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string()),
	annotations: AnnotationsSchema$1.optional(),
	_meta: z.optional(z.looseObject({}))
});
const ResourceListChangedNotificationSchema$1 = NotificationSchema$1.extend({
	method: z.literal("notifications/resources/list_changed"),
	params: NotificationsParamsSchema$1.optional()
});
const ResourceUpdatedNotificationParamsSchema$1 = NotificationsParamsSchema$1.extend({ uri: z.string() });
const ResourceUpdatedNotificationSchema$1 = NotificationSchema$1.extend({
	method: z.literal("notifications/resources/updated"),
	params: ResourceUpdatedNotificationParamsSchema$1
});
const PromptArgumentSchema$1 = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	required: z.optional(z.boolean())
});
const PromptSchema$1 = z.object({
	...BaseMetadataSchema$1.shape,
	...IconsSchema$1.shape,
	description: z.optional(z.string()),
	arguments: z.optional(z.array(PromptArgumentSchema$1)),
	_meta: z.optional(z.looseObject({}))
});
const PromptListChangedNotificationSchema$1 = NotificationSchema$1.extend({
	method: z.literal("notifications/prompts/list_changed"),
	params: NotificationsParamsSchema$1.optional()
});
const TextContentSchema$1 = z.object({
	type: z.literal("text"),
	text: z.string(),
	annotations: AnnotationsSchema$1.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const ImageContentSchema$1 = z.object({
	type: z.literal("image"),
	data: Base64Schema$1,
	mimeType: z.string(),
	annotations: AnnotationsSchema$1.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const AudioContentSchema$1 = z.object({
	type: z.literal("audio"),
	data: Base64Schema$1,
	mimeType: z.string(),
	annotations: AnnotationsSchema$1.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const ToolUseContentSchema$1 = z.object({
	type: z.literal("tool_use"),
	name: z.string(),
	id: z.string(),
	input: z.record(z.string(), z.unknown()),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const EmbeddedResourceSchema$1 = z.object({
	type: z.literal("resource"),
	resource: z.union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]),
	annotations: AnnotationsSchema$1.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const ResourceLinkSchema$1 = ResourceSchema$1.extend({ type: z.literal("resource_link") });
const ContentBlockSchema$1 = z.union([
	TextContentSchema$1,
	ImageContentSchema$1,
	AudioContentSchema$1,
	ResourceLinkSchema$1,
	EmbeddedResourceSchema$1
]);
const PromptMessageSchema$1 = z.object({
	role: RoleSchema$1,
	content: ContentBlockSchema$1
});
const ToolAnnotationsSchema$1 = z.object({
	title: z.string().optional(),
	readOnlyHint: z.boolean().optional(),
	destructiveHint: z.boolean().optional(),
	idempotentHint: z.boolean().optional(),
	openWorldHint: z.boolean().optional()
});
const ToolListChangedNotificationSchema$1 = NotificationSchema$1.extend({
	method: z.literal("notifications/tools/list_changed"),
	params: NotificationsParamsSchema$1.optional()
});
const ModelHintSchema$1 = z.object({ name: z.string().optional() });
const ModelPreferencesSchema$1 = z.object({
	hints: z.array(ModelHintSchema$1).optional(),
	costPriority: z.number().min(0).max(1).optional(),
	speedPriority: z.number().min(0).max(1).optional(),
	intelligencePriority: z.number().min(0).max(1).optional()
});
const ToolChoiceSchema$1 = z.object({ mode: z.enum([
	"auto",
	"required",
	"none"
]).optional() });
const BooleanSchemaSchema$1 = z.object({
	type: z.literal("boolean"),
	title: z.string().optional(),
	description: z.string().optional(),
	default: z.boolean().optional()
});
const StringSchemaSchema$1 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	minLength: z.number().optional(),
	maxLength: z.number().optional(),
	format: z.enum([
		"email",
		"uri",
		"date",
		"date-time"
	]).optional(),
	default: z.string().optional()
});
const NumberSchemaSchema$1 = z.object({
	type: z.enum(["number", "integer"]),
	title: z.string().optional(),
	description: z.string().optional(),
	minimum: z.number().optional(),
	maximum: z.number().optional(),
	default: z.number().optional()
});
const UntitledSingleSelectEnumSchemaSchema$1 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	enum: z.array(z.string()),
	default: z.string().optional()
});
const TitledSingleSelectEnumSchemaSchema$1 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	oneOf: z.array(z.object({
		const: z.string(),
		title: z.string()
	})),
	default: z.string().optional()
});
const LegacyTitledEnumSchemaSchema$1 = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	enum: z.array(z.string()),
	enumNames: z.array(z.string()).optional(),
	default: z.string().optional()
});
const SingleSelectEnumSchemaSchema$1 = z.union([UntitledSingleSelectEnumSchemaSchema$1, TitledSingleSelectEnumSchemaSchema$1]);
const UntitledMultiSelectEnumSchemaSchema$1 = z.object({
	type: z.literal("array"),
	title: z.string().optional(),
	description: z.string().optional(),
	minItems: z.number().optional(),
	maxItems: z.number().optional(),
	items: z.object({
		type: z.literal("string"),
		enum: z.array(z.string())
	}),
	default: z.array(z.string()).optional()
});
const TitledMultiSelectEnumSchemaSchema$1 = z.object({
	type: z.literal("array"),
	title: z.string().optional(),
	description: z.string().optional(),
	minItems: z.number().optional(),
	maxItems: z.number().optional(),
	items: z.object({ anyOf: z.array(z.object({
		const: z.string(),
		title: z.string()
	})) }),
	default: z.array(z.string()).optional()
});
const MultiSelectEnumSchemaSchema$1 = z.union([UntitledMultiSelectEnumSchemaSchema$1, TitledMultiSelectEnumSchemaSchema$1]);
const EnumSchemaSchema$1 = z.union([
	LegacyTitledEnumSchemaSchema$1,
	SingleSelectEnumSchemaSchema$1,
	MultiSelectEnumSchemaSchema$1
]);
const PrimitiveSchemaDefinitionSchema$1 = z.union([
	EnumSchemaSchema$1,
	BooleanSchemaSchema$1,
	StringSchemaSchema$1,
	NumberSchemaSchema$1
]);
const ElicitRequestFormParamsSchema$1 = TaskAugmentedRequestParamsSchema$1.extend({
	mode: z.literal("form").optional(),
	message: z.string(),
	requestedSchema: z.object({
		type: z.literal("object"),
		properties: z.record(z.string(), PrimitiveSchemaDefinitionSchema$1),
		required: z.array(z.string()).optional()
	}).catchall(z.unknown())
});
const ResourceTemplateReferenceSchema$1 = z.object({
	type: z.literal("ref/resource"),
	uri: z.string()
});
const PromptReferenceSchema$1 = z.object({
	type: z.literal("ref/prompt"),
	name: z.string()
});
const RootSchema$1 = z.object({
	uri: z.string().startsWith("file://"),
	name: z.string().optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const sharedClientCapabilityShape = ClientCapabilitiesSchema$1.shape;
const ClientCapabilities2026Schema = z.object({
	experimental: sharedClientCapabilityShape.experimental,
	sampling: sharedClientCapabilityShape.sampling,
	elicitation: sharedClientCapabilityShape.elicitation,
	roots: sharedClientCapabilityShape.roots,
	extensions: sharedClientCapabilityShape.extensions
});
const sharedServerCapabilityShape = ServerCapabilitiesSchema$1.shape;
const ServerCapabilities2026Schema = z.object({
	experimental: sharedServerCapabilityShape.experimental,
	logging: sharedServerCapabilityShape.logging,
	completions: sharedServerCapabilityShape.completions,
	prompts: sharedServerCapabilityShape.prompts,
	resources: sharedServerCapabilityShape.resources,
	tools: sharedServerCapabilityShape.tools,
	extensions: sharedServerCapabilityShape.extensions
});
/**
* The per-request `_meta` envelope carried by every request under protocol revision
* 2026-07-28: the protocol version governing the request, the client implementation
* info, and the client's capabilities — declared per request rather than once at
* initialization — plus the optional log-level opt-in.
*
* This schema models the complete envelope on its own (loose: foreign keys
* pass through - the lift extracts exactly the reserved keys, so enforcement
* never sees extension material). Requiredness is enforced per request at
* dispatch time by the 2026-era codec's `checkInboundEnvelope` step.
*/
const RequestMetaEnvelopeSchema = z.looseObject({
	progressToken: ProgressTokenSchema$1.optional(),
	[PROTOCOL_VERSION_META_KEY]: z.string(),
	[CLIENT_INFO_META_KEY]: ImplementationSchema$1,
	[CLIENT_CAPABILITIES_META_KEY]: ClientCapabilities2026Schema,
	[LOG_LEVEL_META_KEY]: LoggingLevelSchema$1.optional()
});
/** 2026-era Tool: anchor-exact — no `execution` (deleted vocabulary). */
const ToolSchema$1 = z.object({
	...BaseMetadataSchema$1.shape,
	...IconsSchema$1.shape,
	description: z.string().optional(),
	inputSchema: z.looseObject({
		$schema: z.string().optional(),
		type: z.literal("object")
	}),
	outputSchema: z.looseObject({ $schema: z.string().optional() }).optional(),
	annotations: ToolAnnotationsSchema$1.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/** 2026-era ToolResultContent (anchor-exact: `structuredContent?: unknown`). */
const ToolResultContentSchema$1 = z.object({
	type: z.literal("tool_result"),
	toolUseId: z.string(),
	content: z.array(ContentBlockSchema$1),
	structuredContent: z.unknown().optional(),
	isError: z.boolean().optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/** 2026-era sampling content union (composes the forked tool-result shape). */
const SamplingMessageContentBlockSchema$1 = z.union([
	TextContentSchema$1,
	ImageContentSchema$1,
	AudioContentSchema$1,
	ToolUseContentSchema$1,
	ToolResultContentSchema$1
]);
/** 2026-era SamplingMessage (anchor-exact: single block or array). */
const SamplingMessageSchema$1 = z.object({
	role: RoleSchema$1,
	content: z.union([SamplingMessageContentBlockSchema$1, z.array(SamplingMessageContentBlockSchema$1)]),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/** Open union per the anchor: 'complete' | 'input_required' | string. */
const ResultTypeSchema = z.string();
const wireMeta = z.record(z.string(), z.unknown()).optional();
function wireResult(shape) {
	return z.looseObject({
		_meta: wireMeta,
		resultType: ResultTypeSchema.default("complete"),
		...shape
	});
}
const ResultSchema$1 = wireResult({});
const PaginatedResultSchema$1 = wireResult({ nextCursor: CursorSchema$1.optional() });
const CallToolResultSchema$1 = wireResult({
	content: z.array(ContentBlockSchema$1),
	structuredContent: z.unknown().optional(),
	isError: z.boolean().optional()
});
const ListToolsResultSchema$1 = wireResult({
	ttlMs: z.number().int().min(0),
	cacheScope: z.enum(["public", "private"]),
	tools: z.array(ToolSchema$1),
	nextCursor: CursorSchema$1.optional()
});
const ListPromptsResultSchema$1 = wireResult({
	ttlMs: z.number().int().min(0),
	cacheScope: z.enum(["public", "private"]),
	prompts: z.array(PromptSchema$1),
	nextCursor: CursorSchema$1.optional()
});
const GetPromptResultSchema$1 = wireResult({
	description: z.string().optional(),
	messages: z.array(PromptMessageSchema$1)
});
const ListResourcesResultSchema$1 = wireResult({
	ttlMs: z.number().int().min(0),
	cacheScope: z.enum(["public", "private"]),
	resources: z.array(ResourceSchema$1),
	nextCursor: CursorSchema$1.optional()
});
const ListResourceTemplatesResultSchema$1 = wireResult({
	ttlMs: z.number().int().min(0),
	cacheScope: z.enum(["public", "private"]),
	resourceTemplates: z.array(ResourceTemplateSchema$1),
	nextCursor: CursorSchema$1.optional()
});
const ReadResourceResultSchema$1 = wireResult({
	ttlMs: z.number().int().min(0),
	cacheScope: z.enum(["public", "private"]),
	contents: z.array(z.union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]))
});
const CompleteResultSchema$1 = wireResult({ completion: z.object({
	values: z.array(z.string()).max(100),
	total: z.number().int().optional(),
	hasMore: z.boolean().optional()
}).loose() });
/** CacheableResult (SEP-2549): ttlMs and cacheScope REQUIRED per the anchor. */
const CacheableResultSchema = wireResult({
	ttlMs: z.number().int().min(0),
	cacheScope: z.enum(["public", "private"])
});
const DiscoverResultSchema$1 = wireResult({
	ttlMs: z.number().int().min(0).catch(0),
	cacheScope: z.enum(["public", "private"]).catch("private"),
	supportedVersions: z.array(z.string()),
	capabilities: ServerCapabilities2026Schema,
	serverInfo: ImplementationSchema$1,
	instructions: z.string().optional()
});
/** 2026-era CreateMessageRequestParams (anchor-exact: forked SamplingMessage/Tool, no task augmentation). */
const CreateMessageRequestParamsSchema$1 = z.object({
	messages: z.array(SamplingMessageSchema$1),
	modelPreferences: ModelPreferencesSchema$1.optional(),
	systemPrompt: z.string().optional(),
	includeContext: z.enum([
		"none",
		"thisServer",
		"allServers"
	]).optional(),
	temperature: z.number().optional(),
	maxTokens: z.number().int(),
	stopSequences: z.array(z.string()).optional(),
	metadata: JSONObjectSchema$1.optional(),
	tools: z.array(ToolSchema$1).optional(),
	toolChoice: ToolChoiceSchema$1.optional()
});
/** 2026-era embedded sampling request (de-JSON-RPC'd). */
const CreateMessageRequestSchema$1 = z.object({
	method: z.literal("sampling/createMessage"),
	params: CreateMessageRequestParamsSchema$1
});
/**
* 2026-era embedded roots listing request (de-JSON-RPC'd). Embedded input
* requests do NOT carry the per-request `_meta` envelope on this revision —
* the anchor declares a bare optional `_meta` on `params`.
*/
const ListRootsRequestSchema$1 = z.object({
	method: z.literal("roots/list"),
	params: z.object({ _meta: z.record(z.string(), z.unknown()).optional() }).optional()
});
/** 2026-era embedded sampling response (anchor-exact: extends the forked SamplingMessage). */
const CreateMessageResultSchema$1 = z.object({
	...SamplingMessageSchema$1.shape,
	model: z.string(),
	stopReason: z.string().optional()
});
/** 2026-era embedded roots listing response (anchor-exact: bare `roots` array). */
const ListRootsResultSchema$1 = z.object({ roots: z.array(RootSchema$1) });
/** 2026-era embedded elicitation response (anchor-exact: bare result, restricted content value types). */
const ElicitResultSchema$1 = z.object({
	action: z.enum([
		"accept",
		"decline",
		"cancel"
	]),
	content: z.record(z.string(), z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.array(z.string())
	])).optional()
});
/**
* 2026-era URL-mode elicitation params (anchor-exact fork): the draft removed
* `elicitationId` (and the `notifications/elicitation/complete` channel it
* keyed) — the shared schema keeps the field because it is required on the
* frozen 2025-11-25 revision.
*/
const ElicitRequestURLParamsSchema$1 = z.object({
	mode: z.literal("url"),
	message: z.string(),
	url: z.string().url()
});
/** 2026-era elicitation params (form mode is revision-identical; URL mode is the fork above). */
const ElicitRequestParamsSchema$1 = z.union([ElicitRequestFormParamsSchema$1, ElicitRequestURLParamsSchema$1]);
/** 2026-era embedded elicitation request (de-JSON-RPC'd; see the URL-mode fork above). */
const ElicitRequestSchema$1 = z.object({
	method: z.literal("elicitation/create"),
	params: ElicitRequestParamsSchema$1
});
/** A single embedded input request (one of the three demoted server→client requests). */
const InputRequestSchema = z.union([
	CreateMessageRequestSchema$1,
	ListRootsRequestSchema$1,
	ElicitRequestSchema$1
]);
/** A single embedded input response — the BARE result union (never a `{method, result}` wrapper). */
const InputResponseSchema = z.union([
	CreateMessageResultSchema$1,
	ListRootsResultSchema$1,
	ElicitResultSchema$1
]);
/** Map of embedded input requests, keyed by server-assigned identifiers. */
const InputRequestsSchema = z.record(z.string(), InputRequestSchema);
/** Map of embedded input responses, keyed by the corresponding request identifiers. */
const InputResponsesSchema = z.record(z.string(), InputResponseSchema);
/**
* The wire InputRequiredResult: `resultType: 'input_required'` plus at least
* one of `inputRequests` / `requestState` (the at-least-one rule is enforced
* at the server seam, not by this parse shape).
*/
const InputRequiredResultSchema = wireResult({
	inputRequests: InputRequestsSchema.optional(),
	requestState: z.string().optional()
});
/** The retry-channel members carried by client-initiated requests on this revision. */
const retryParamsShape = {
	inputResponses: InputResponsesSchema.optional(),
	requestState: z.string().optional()
};
/** Anchor InputResponseRequestParams: the retry channel on top of the required request `_meta` envelope. */
const InputResponseRequestParamsSchema = z.object({
	_meta: RequestMetaEnvelopeSchema,
	...retryParamsShape
});
/** Post-lift request `_meta` (progressToken + extension keys; loose). */
const DispatchRequestMetaSchema = z.looseObject({ progressToken: ProgressTokenSchema$1.optional() });
function wireRequest(method, paramsShape) {
	return z.object({
		method: z.literal(method),
		params: z.object({
			_meta: RequestMetaEnvelopeSchema,
			...paramsShape
		})
	});
}
function dispatchRequest(method, paramsShape) {
	return z.object({
		method: z.literal(method),
		params: z.object({
			_meta: DispatchRequestMetaSchema.optional(),
			...paramsShape
		}).optional()
	});
}
const callToolParamsShape = {
	name: z.string(),
	arguments: z.record(z.string(), z.unknown()).optional(),
	...retryParamsShape
};
const paginatedParamsShape = { cursor: CursorSchema$1.optional() };
const CallToolRequestSchema$1 = wireRequest("tools/call", callToolParamsShape);
const ListToolsRequestSchema$1 = wireRequest("tools/list", paginatedParamsShape);
const ListPromptsRequestSchema$1 = wireRequest("prompts/list", paginatedParamsShape);
const GetPromptRequestSchema$1 = wireRequest("prompts/get", {
	name: z.string(),
	arguments: z.record(z.string(), z.string()).optional(),
	...retryParamsShape
});
const ListResourcesRequestSchema$1 = wireRequest("resources/list", paginatedParamsShape);
const ListResourceTemplatesRequestSchema$1 = wireRequest("resources/templates/list", paginatedParamsShape);
const ReadResourceRequestSchema$1 = wireRequest("resources/read", {
	uri: z.string(),
	...retryParamsShape
});
const completeParamsShape = {
	ref: z.union([PromptReferenceSchema$1, ResourceTemplateReferenceSchema$1]),
	argument: z.object({
		name: z.string(),
		value: z.string()
	}),
	context: z.object({ arguments: z.record(z.string(), z.string()).optional() }).optional()
};
const CompleteRequestSchema$1 = wireRequest("completion/complete", completeParamsShape);
const DiscoverRequestSchema$1 = wireRequest("server/discover", {});
/** Anchor SubscriptionFilter (2026-only). */
const SubscriptionFilterSchema$1 = z.object({
	toolsListChanged: z.boolean().optional(),
	promptsListChanged: z.boolean().optional(),
	resourcesListChanged: z.boolean().optional(),
	resourceSubscriptions: z.array(z.string()).optional()
});
const subscriptionsListenParamsShape = { notifications: SubscriptionFilterSchema$1 };
const SubscriptionsListenRequestSchema$1 = wireRequest("subscriptions/listen", subscriptionsListenParamsShape);
/** Anchor SubscriptionsListenResultMeta — required subscriptionId stamp on the graceful-close result. */
const SubscriptionsListenResultMetaSchema$1 = z.looseObject({ "io.modelcontextprotocol/subscriptionId": RequestIdSchema$1 });
/**
* Anchor SubscriptionsListenResult (2026-only). The empty `subscriptions/listen`
* response signalling that the subscription has ended gracefully (server
* shutdown). An abrupt transport close carries no response — the client treats
* stream-close-without-result as a disconnect.
*/
const SubscriptionsListenResultSchema$1 = z.looseObject({
	_meta: SubscriptionsListenResultMetaSchema$1,
	resultType: ResultTypeSchema.default("complete")
});
/** Dispatch (post-lift) request schemas, keyed by method — registry-internal. */
const dispatchRequestSchemas = {
	"tools/call": dispatchRequest("tools/call", callToolParamsShape),
	"tools/list": dispatchRequest("tools/list", paginatedParamsShape),
	"prompts/get": dispatchRequest("prompts/get", {
		name: z.string(),
		arguments: z.record(z.string(), z.string()).optional()
	}),
	"prompts/list": dispatchRequest("prompts/list", paginatedParamsShape),
	"resources/list": dispatchRequest("resources/list", paginatedParamsShape),
	"resources/templates/list": dispatchRequest("resources/templates/list", paginatedParamsShape),
	"resources/read": dispatchRequest("resources/read", { uri: z.string() }),
	"completion/complete": dispatchRequest("completion/complete", completeParamsShape),
	"server/discover": dispatchRequest("server/discover", {}),
	"subscriptions/listen": dispatchRequest("subscriptions/listen", subscriptionsListenParamsShape)
};
/** Dispatch (post-lift) result schemas, keyed by method — what the funnel
* validates AFTER `decodeResult` consumed `resultType`. */
function liftedResult(shape) {
	return z.looseObject({
		_meta: wireMeta,
		...shape
	});
}
const dispatchResultSchemas = {
	"tools/call": liftedResult({
		content: z.array(ContentBlockSchema$1),
		structuredContent: z.unknown().optional(),
		isError: z.boolean().optional()
	}),
	"tools/list": liftedResult({
		ttlMs: z.number().int().min(0),
		cacheScope: z.enum(["public", "private"]),
		tools: z.array(ToolSchema$1),
		nextCursor: CursorSchema$1.optional()
	}),
	"prompts/get": liftedResult({
		description: z.string().optional(),
		messages: z.array(PromptMessageSchema$1)
	}),
	"prompts/list": liftedResult({
		ttlMs: z.number().int().min(0),
		cacheScope: z.enum(["public", "private"]),
		prompts: z.array(PromptSchema$1),
		nextCursor: CursorSchema$1.optional()
	}),
	"resources/list": liftedResult({
		ttlMs: z.number().int().min(0),
		cacheScope: z.enum(["public", "private"]),
		resources: z.array(ResourceSchema$1),
		nextCursor: CursorSchema$1.optional()
	}),
	"resources/templates/list": liftedResult({
		ttlMs: z.number().int().min(0),
		cacheScope: z.enum(["public", "private"]),
		resourceTemplates: z.array(ResourceTemplateSchema$1),
		nextCursor: CursorSchema$1.optional()
	}),
	"resources/read": liftedResult({
		ttlMs: z.number().int().min(0),
		cacheScope: z.enum(["public", "private"]),
		contents: z.array(z.union([TextResourceContentsSchema$1, BlobResourceContentsSchema$1]))
	}),
	"completion/complete": liftedResult({ completion: z.object({
		values: z.array(z.string()).max(100),
		total: z.number().int().optional(),
		hasMore: z.boolean().optional()
	}).loose() }),
	"server/discover": liftedResult({
		ttlMs: z.number().int().min(0).catch(0),
		cacheScope: z.enum(["public", "private"]).catch("private"),
		supportedVersions: z.array(z.string()),
		capabilities: ServerCapabilities2026Schema,
		serverInfo: ImplementationSchema$1,
		instructions: z.string().optional()
	}),
	"subscriptions/listen": liftedResult({})
};
/**
* Notification `_meta` (anchor `NotificationMetaObject`): loose, with the
* subscriptions/listen demux key typed when present. Only the anchor-exact
* SHAPE is modeled here — listen delivery itself (filter gating, demux,
* teardown) is #14 scope and not implemented by this module.
*/
const NotificationMetaSchema = z.looseObject({ "io.modelcontextprotocol/subscriptionId": RequestIdSchema$1.optional() });
/** Anchor SubscriptionsAcknowledgedNotification (2026-only). */
const SubscriptionsAcknowledgedNotificationSchema$1 = z.object({
	method: z.literal("notifications/subscriptions/acknowledged"),
	params: z.object({
		_meta: NotificationMetaSchema.optional(),
		notifications: SubscriptionFilterSchema$1
	})
});
/**
* 2026-era `notifications/cancelled` params (anchor-exact fork): `requestId`
* is REQUIRED on this revision — the shared schema keeps it optional because
* the frozen 2025-11-25 shape declares it optional (task cancellation goes
* through `tasks/cancel` there). Requiredness is bare because no 2025-era
* traffic touches this module.
*/
const CancelledNotificationParamsSchema$1 = z.object({
	_meta: NotificationMetaSchema.optional(),
	requestId: RequestIdSchema$1,
	reason: z.string().optional()
});
/** 2026-era `notifications/cancelled` (see the params fork above). */
const CancelledNotificationSchema$1 = z.object({
	method: z.literal("notifications/cancelled"),
	params: CancelledNotificationParamsSchema$1
});
const notificationSchemas2026 = {
	"notifications/cancelled": CancelledNotificationSchema$1,
	"notifications/progress": ProgressNotificationSchema$1,
	"notifications/message": LoggingMessageNotificationSchema$1,
	"notifications/resources/updated": ResourceUpdatedNotificationSchema$1,
	"notifications/resources/list_changed": ResourceListChangedNotificationSchema$1,
	"notifications/tools/list_changed": ToolListChangedNotificationSchema$1,
	"notifications/prompts/list_changed": PromptListChangedNotificationSchema$1,
	"notifications/subscriptions/acknowledged": SubscriptionsAcknowledgedNotificationSchema$1
};
const wireResultResponse = (result) => z.object({
	jsonrpc: z.literal("2.0"),
	id: z.union([z.string(), z.number().int()]),
	result
}).strict();
const JSONRPCResultResponseSchema$1 = wireResultResponse(ResultSchema$1);
const CallToolResultResponseSchema = wireResultResponse(z.union([CallToolResultSchema$1, InputRequiredResultSchema]));
const ListToolsResultResponseSchema = wireResultResponse(ListToolsResultSchema$1);
const ListPromptsResultResponseSchema = wireResultResponse(ListPromptsResultSchema$1);
const GetPromptResultResponseSchema = wireResultResponse(z.union([GetPromptResultSchema$1, InputRequiredResultSchema]));
const ListResourcesResultResponseSchema = wireResultResponse(ListResourcesResultSchema$1);
const ListResourceTemplatesResultResponseSchema = wireResultResponse(ListResourceTemplatesResultSchema$1);
const ReadResourceResultResponseSchema = wireResultResponse(z.union([ReadResourceResultSchema$1, InputRequiredResultSchema]));
const CompleteResultResponseSchema = wireResultResponse(CompleteResultSchema$1);
const DiscoverResultResponseSchema = wireResultResponse(DiscoverResultSchema$1);

//#endregion
//#region ../core-internal/src/wire/rev2026-07-28/inputRequired.ts
/**
* In-band input-request vocabulary of the 2026-07-28 revision (SEP-2322
* multi round-trip requests), dispatch view.
*
* The three former server→client wire requests (`elicitation/create`,
* `sampling/createMessage`, `roots/list`) are NOT wire request methods on
* this revision — they are demoted to de-JSON-RPC'd payloads embedded in an
* `input_required` result. The multi-round-trip driver dispatches those
* embedded payloads to the client's registered handlers through the normal
* handler machinery, and these are the schemas that dispatch parses them
* with: lenient where the anchor's wire-true artifacts are strict (an
* embedded request never carries the per-request `_meta` envelope), exact
* where the vocabulary forks (the sampling shapes compose the forked
* SamplingMessage/Tool payloads).
*
* Registry membership is intentionally NOT granted here — these methods stay
* absent from the 2026-era request registry (a peer sending one as a wire
* request still gets −32601 by absence). Only the codec's
* `inputRequestSchema`/`inputResponseSchema` accessors expose them.
*/
/** The embedded input-request methods of the 2026-07-28 revision. */
const INPUT_REQUEST_METHODS_2026 = [
	"elicitation/create",
	"sampling/createMessage",
	"roots/list"
];
/** Dispatch-time (lenient) embedded request schemas, keyed by method. */
const inputRequestSchemas2026 = {
	"elicitation/create": z.object({
		method: z.literal("elicitation/create"),
		params: ElicitRequestParamsSchema$1
	}),
	"sampling/createMessage": z.object({
		method: z.literal("sampling/createMessage"),
		params: CreateMessageRequestParamsSchema$1
	}),
	"roots/list": z.object({
		method: z.literal("roots/list"),
		params: z.looseObject({}).optional()
	})
};
/** Embedded (bare) response schemas, keyed by the request method they answer. */
const inputResponseSchemas2026 = {
	"elicitation/create": ElicitResultSchema$1,
	"sampling/createMessage": CreateMessageResultSchema$1,
	"roots/list": ListRootsResultSchema$1
};
function isInputRequestMethod2026(method) {
	return INPUT_REQUEST_METHODS_2026.includes(method);
}
function getInputRequestSchema2026(method) {
	return isInputRequestMethod2026(method) ? inputRequestSchemas2026[method] : void 0;
}
function getInputResponseSchema2026(method) {
	return isInputRequestMethod2026(method) ? inputResponseSchemas2026[method] : void 0;
}

//#endregion
//#region ../core-internal/src/wire/rev2026-07-28/registry.ts
/** The 2026-era request-method set (registry membership = the deletion story). */
function hasRequestMethod2026(method) {
	return Object.prototype.hasOwnProperty.call(dispatchRequestSchemas, method);
}
/** The 2026-era notification-method set. */
function hasNotificationMethod2026(method) {
	return Object.prototype.hasOwnProperty.call(notificationSchemas2026, method);
}
/** Result-map membership (same key set as the request map on this era). */
function hasResultMethod2026(method) {
	return Object.prototype.hasOwnProperty.call(dispatchResultSchemas, method);
}
function getRequestSchema2026(method) {
	return hasRequestMethod2026(method) ? dispatchRequestSchemas[method] : void 0;
}
function getResultSchema2026(method) {
	return hasResultMethod2026(method) ? dispatchResultSchemas[method] : void 0;
}
function getNotificationSchema2026(method) {
	return hasNotificationMethod2026(method) ? notificationSchemas2026[method] : void 0;
}
/** Registry method lists (for the spec-method universe and the CI registry-diff oracle). */
const rev2026RequestMethods = Object.keys(dispatchRequestSchemas);
const rev2026NotificationMethods = Object.keys(notificationSchemas2026);

//#endregion
//#region ../core-internal/src/wire/rev2026-07-28/codec.ts
function isPlainObject$4(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Tri-state wrap of an optional Zod schema lookup (the function-only contract). */
function triState(schema, raw) {
	if (schema === void 0) return {
		ok: false,
		reason: "not-in-era"
	};
	const parsed = schema.safeParse(raw);
	return parsed.success ? {
		ok: true,
		value: parsed.data
	} : {
		ok: false,
		reason: "invalid",
		message: String(parsed.error)
	};
}
const NOT_IN_ERA = {
	ok: false,
	reason: "not-in-era"
};
/** The reserved `_meta` keys an envelope must carry on this era (in reporting order). */
const REQUIRED_ENVELOPE_KEYS = [
	PROTOCOL_VERSION_META_KEY,
	CLIENT_INFO_META_KEY,
	CLIENT_CAPABILITIES_META_KEY
];
/** Strip the known deleted-field set from an outbound result (Q1-SD3 iii). */
function enforceDeletedFields(method, result) {
	let next = result;
	let copied = false;
	const copy = () => {
		if (!copied) {
			next = { ...next };
			copied = true;
		}
		return next;
	};
	const tools = result.tools;
	if (method === "tools/list" && Array.isArray(tools) && tools.some((tool) => isPlainObject$4(tool) && "execution" in tool)) copy().tools = tools.map((tool) => {
		if (!isPlainObject$4(tool) || !("execution" in tool)) return tool;
		const rest = { ...tool };
		delete rest["execution"];
		return rest;
	});
	const capabilities = result.capabilities;
	if (isPlainObject$4(capabilities) && "tasks" in capabilities) {
		const rest = { ...capabilities };
		delete rest["tasks"];
		copy().capabilities = rest;
	}
	return next;
}
const rev2026Codec = {
	era: "2026-07-28",
	hasRequestMethod: hasRequestMethod2026,
	hasNotificationMethod: hasNotificationMethod2026,
	hasInputRequestMethod: (method) => getInputRequestSchema2026(method) !== void 0,
	validateRequest: (method, raw) => triState(getRequestSchema2026(method), raw),
	validateResult: (method, raw) => triState(getResultSchema2026(method), raw),
	validateNotification: (method, raw) => triState(getNotificationSchema2026(method), raw),
	validateInputRequest: (method, raw) => triState(getInputRequestSchema2026(method), raw),
	validateInputResponse: (method, raw) => triState(getInputResponseSchema2026(method), raw),
	samplingResultVariant: () => NOT_IN_ERA,
	outboundEnvelope(material) {
		return {
			[PROTOCOL_VERSION_META_KEY]: material.protocolVersion,
			[CLIENT_INFO_META_KEY]: material.clientInfo,
			[CLIENT_CAPABILITIES_META_KEY]: material.clientCapabilities,
			...material.logLevel !== void 0 && { [LOG_LEVEL_META_KEY]: material.logLevel }
		};
	},
	validateEnvelopeMeta(meta) {
		const issues = [];
		for (const key of REQUIRED_ENVELOPE_KEYS) if (!(key in meta)) issues.push({
			key,
			problem: "missing"
		});
		const parsed = RequestMetaEnvelopeSchema.safeParse(meta);
		if (!parsed.success) for (const issue of parsed.error.issues) {
			const path = issue.path.map(String);
			const key = path.length > 0 ? path.join(".") : "_meta";
			if (path.length === 1 && issues.some((existing) => existing.key === key && existing.problem === "missing")) continue;
			issues.push({
				key,
				problem: issue.message
			});
		}
		return issues;
	},
	projectCallToolResult: (result) => appendTextFallbackForNonObject(result),
	inputRequestSchema: getInputRequestSchema2026,
	decodeResult(method, raw) {
		if (!isPlainObject$4(raw)) return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: not an object`, { method })
		};
		const rawResultType = raw["resultType"];
		if (rawResultType === void 0) return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: missing required resultType — servers implementing protocol revision 2026-07-28 MUST include it (the absent-means-complete bridge applies only to earlier-revision servers)`, {
				method,
				violation: "missing-resultType"
			})
		};
		if (typeof rawResultType !== "string") return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: non-string resultType`, {
				method,
				resultType: rawResultType
			})
		};
		if (rawResultType === "input_required") {
			const rawInputRequests = raw["inputRequests"];
			const inputRequests = isPlainObject$4(rawInputRequests) ? rawInputRequests : {};
			const requestState = raw["requestState"];
			if (Object.keys(inputRequests).length === 0 && typeof requestState !== "string") return {
				kind: "invalid",
				error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: input_required carries neither inputRequests nor requestState (every input_required result must include at least one of the two)`, {
					method,
					violation: "input-required-missing-both"
				})
			};
			return {
				kind: "input_required",
				inputRequests,
				...typeof requestState === "string" && { requestState }
			};
		}
		if (rawResultType !== "complete") return {
			kind: "invalid",
			error: new SdkError(SdkErrorCode.UnsupportedResultType, `Unsupported result type '${rawResultType}' for ${method}`, {
				resultType: rawResultType,
				method
			})
		};
		const wireSchema = Object.hasOwn(WIRE_RESULT_SCHEMAS, method) ? WIRE_RESULT_SCHEMAS[method] : void 0;
		if (wireSchema !== void 0) {
			const parsed = wireSchema.safeParse(raw);
			if (!parsed.success) return {
				kind: "invalid",
				error: new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${method}: ${parsed.error}`, { method })
			};
		}
		const lifted = { ...raw };
		delete lifted["resultType"];
		return {
			kind: "complete",
			result: lifted
		};
	},
	encodeResult(method, result) {
		return fillCacheFields(method, stampResultType(method, enforceDeletedFields(method, result)));
	},
	encodeErrorCode: (code) => code === -32002 ? -32602 : code,
	checkInboundEnvelope(material) {
		if (material.envelope === void 0) return "Request is missing the required _meta envelope for protocol revision 2026-07-28 (io.modelcontextprotocol/protocolVersion, io.modelcontextprotocol/clientInfo, io.modelcontextprotocol/clientCapabilities)";
		const parsed = RequestMetaEnvelopeSchema.safeParse(material.envelope);
		if (!parsed.success) return `Invalid _meta envelope for protocol revision 2026-07-28: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`;
	}
};
/** Wire-true result wrappers consulted by decode step 2, keyed by method. */
const WIRE_RESULT_SCHEMAS = {
	"tools/call": CallToolResultSchema$1,
	"tools/list": ListToolsResultSchema$1,
	"prompts/get": GetPromptResultSchema$1,
	"prompts/list": ListPromptsResultSchema$1,
	"resources/list": ListResourcesResultSchema$1,
	"resources/templates/list": ListResourceTemplatesResultSchema$1,
	"resources/read": ReadResourceResultSchema$1,
	"completion/complete": CompleteResultSchema$1,
	"server/discover": DiscoverResultSchema$1
};

//#endregion
//#region ../core-internal/src/wire/codec.ts
/**
* The modern wire revision literal. Internal only — deliberately NOT a public
* constant (G-D2-4: no public modern-version constant ships before era-aware
* list semantics exist).
*/
const MODERN_WIRE_REVISION = "2026-07-28";
/**
* Era resolution, many-to-one (Q1-SD1): every modern-era revision
* (`>= 2026-07-28`) → the 2026-era codec; every legacy revision (the five
* `SUPPORTED_PROTOCOL_VERSIONS`) and `undefined`/unknown → the 2025-era
* codec (the DV-13 default posture — hand-constructed instances and
* unclassified traffic are legacy-era). This is the same era predicate the
* rest of the SDK uses ({@link isModernProtocolVersion}); a pinned modern
* revision other than the literal '2026-07-28' must still resolve modern.
*/
function codecForVersion(version) {
	return version !== void 0 && isModernProtocolVersion(version) ? rev2026Codec : rev2025Codec;
}
/**
* The wire era an edge classification names (Q2 — produced at the
* transport/entry edge; this layer only CONSUMES it). The dispatch funnel no
* longer resolves a codec FROM the classification: era is instance state, and
* a classified inbound message is VALIDATED against the instance era — a
* mismatch is an entry/routing error, never a per-message era switch. The
* exact `revision` wins over the coarse era flag when both are present.
*/
function classifiedWireEra(classification) {
	if (classification.revision !== void 0) return codecForVersion(classification.revision).era;
	return classification.era === "modern" ? rev2026Codec.era : rev2025Codec.era;
}
/**
* The derived spec-method universe: the union of every codec registry. A
* method in this set is era-gated at dispatch and send time; a method outside
* it is a consumer-owned extension method (era-blind, schema-explicit).
* Derived from the registries — never hand-curated (the LEGACY_ONLY_METHODS
* table class is exactly what registry membership replaces).
*/
function isSpecRequestMethod(method) {
	return ALL_CODECS.some((codec) => codec.hasRequestMethod(method));
}
function isSpecNotificationMethod(method) {
	return ALL_CODECS.some((codec) => codec.hasNotificationMethod(method));
}
const ALL_CODECS = [rev2025Codec, rev2026Codec];

//#endregion
//#region ../core-internal/src/shared/envelope.ts
/**
* Per-request `_meta` envelope claim helpers (protocol revision 2026-07-28).
*
* Pure, value-returning helpers used by the inbound HTTP classifier
* (`classifyInboundRequest`): claim detection and envelope validation with
* self-identifying issues. The envelope schema itself stays the wire layer's
* single source of truth (`RequestMetaEnvelopeSchema`); this module only maps
* its outcomes into the shapes the validation ladder emits.
*
* Claim detection is deliberately narrow: a message claims the 2026-07-28
* envelope mechanism if and only if the reserved protocol-version `_meta` key
* is present in `params._meta`. Other reserved keys (client info, client
* capabilities, log level), a bare `progressToken`, or unrelated keys under
* the `io.modelcontextprotocol/` prefix do NOT constitute a claim on their
* own — but once the claim key is present, a malformed envelope is a
* validation error, never a silent fall back to legacy handling.
*
* The wire-exact envelope schema, the required-key set, and the per-key issue
* mapping live in the wire layer (the 2026-era codec's `validateEnvelopeMeta`).
* This module never reaches into a per-revision wire module directly.
*/
function isPlainObject$3(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** The `_meta` object of a message's params, when present. */
function requestMetaOf(params) {
	if (!isPlainObject$3(params)) return void 0;
	const meta = params["_meta"];
	return isPlainObject$3(meta) ? meta : void 0;
}
/**
* Whether a message's params carry the per-request envelope claim: the
* reserved protocol-version `_meta` key is present (regardless of whether the
* rest of the envelope is valid — validation is a separate, later step).
*/
function hasEnvelopeClaim(params) {
	const meta = requestMetaOf(params);
	return meta !== void 0 && PROTOCOL_VERSION_META_KEY in meta;
}
/**
* The protocol version named by a message's envelope claim, when the claim is
* present and carries a string value. A present claim with a non-string value
* still counts as a claim ({@linkcode hasEnvelopeClaim}); it surfaces as a
* validation issue instead of a version.
*/
function envelopeClaimVersion(params) {
	const value = requestMetaOf(params)?.[PROTOCOL_VERSION_META_KEY];
	return typeof value === "string" ? value : void 0;
}
/**
* Validates a request's `_meta` object as a 2026-07-28 per-request envelope
* and reports problems as self-identifying issues (which key, what problem).
*
* Returns an empty array when the envelope is valid. Missing required keys are
* reported first (as `problem: 'missing'`), then schema violations inside
* present keys, in a stable order.
*/
function validateEnvelopeMeta(meta) {
	return codecForVersion(MODERN_WIRE_REVISION).validateEnvelopeMeta(meta);
}

//#endregion
//#region ../core-internal/src/types/schemas.ts
var schemas_exports = /* @__PURE__ */ __exportAll({
	AnnotationsSchema: () => AnnotationsSchema,
	AudioContentSchema: () => AudioContentSchema,
	BaseMetadataSchema: () => BaseMetadataSchema,
	BaseRequestParamsSchema: () => BaseRequestParamsSchema,
	BlobResourceContentsSchema: () => BlobResourceContentsSchema,
	BooleanSchemaSchema: () => BooleanSchemaSchema,
	CallToolRequestParamsSchema: () => CallToolRequestParamsSchema,
	CallToolRequestSchema: () => CallToolRequestSchema,
	CallToolResultSchema: () => CallToolResultSchema,
	CancelTaskRequestSchema: () => CancelTaskRequestSchema,
	CancelTaskResultSchema: () => CancelTaskResultSchema,
	CancelledNotificationParamsSchema: () => CancelledNotificationParamsSchema,
	CancelledNotificationSchema: () => CancelledNotificationSchema,
	ClientCapabilitiesSchema: () => ClientCapabilitiesSchema,
	ClientNotificationSchema: () => ClientNotificationSchema,
	ClientRequestSchema: () => ClientRequestSchema,
	ClientResultSchema: () => ClientResultSchema,
	ClientTasksCapabilitySchema: () => ClientTasksCapabilitySchema,
	CompatibilityCallToolResultSchema: () => CompatibilityCallToolResultSchema,
	CompleteRequestParamsSchema: () => CompleteRequestParamsSchema,
	CompleteRequestSchema: () => CompleteRequestSchema,
	CompleteResultSchema: () => CompleteResultSchema,
	ContentBlockSchema: () => ContentBlockSchema,
	CreateMessageRequestParamsSchema: () => CreateMessageRequestParamsSchema,
	CreateMessageRequestSchema: () => CreateMessageRequestSchema,
	CreateMessageResultSchema: () => CreateMessageResultSchema,
	CreateMessageResultWithToolsSchema: () => CreateMessageResultWithToolsSchema,
	CreateTaskResultSchema: () => CreateTaskResultSchema,
	CursorSchema: () => CursorSchema,
	DiscoverRequestSchema: () => DiscoverRequestSchema,
	DiscoverResultSchema: () => DiscoverResultSchema,
	ElicitRequestFormParamsSchema: () => ElicitRequestFormParamsSchema,
	ElicitRequestParamsSchema: () => ElicitRequestParamsSchema,
	ElicitRequestSchema: () => ElicitRequestSchema,
	ElicitRequestURLParamsSchema: () => ElicitRequestURLParamsSchema,
	ElicitResultSchema: () => ElicitResultSchema,
	ElicitationCompleteNotificationParamsSchema: () => ElicitationCompleteNotificationParamsSchema,
	ElicitationCompleteNotificationSchema: () => ElicitationCompleteNotificationSchema,
	EmbeddedResourceSchema: () => EmbeddedResourceSchema,
	EmptyResultSchema: () => EmptyResultSchema,
	EnumSchemaSchema: () => EnumSchemaSchema,
	GetPromptRequestParamsSchema: () => GetPromptRequestParamsSchema,
	GetPromptRequestSchema: () => GetPromptRequestSchema,
	GetPromptResultSchema: () => GetPromptResultSchema,
	GetTaskPayloadRequestSchema: () => GetTaskPayloadRequestSchema,
	GetTaskPayloadResultSchema: () => GetTaskPayloadResultSchema,
	GetTaskRequestSchema: () => GetTaskRequestSchema,
	GetTaskResultSchema: () => GetTaskResultSchema,
	IconSchema: () => IconSchema,
	IconsSchema: () => IconsSchema,
	ImageContentSchema: () => ImageContentSchema,
	ImplementationSchema: () => ImplementationSchema,
	InitializeRequestParamsSchema: () => InitializeRequestParamsSchema,
	InitializeRequestSchema: () => InitializeRequestSchema,
	InitializeResultSchema: () => InitializeResultSchema,
	InitializedNotificationSchema: () => InitializedNotificationSchema,
	JSONArraySchema: () => JSONArraySchema,
	JSONObjectSchema: () => JSONObjectSchema,
	JSONRPCErrorResponseSchema: () => JSONRPCErrorResponseSchema,
	JSONRPCMessageSchema: () => JSONRPCMessageSchema,
	JSONRPCNotificationSchema: () => JSONRPCNotificationSchema,
	JSONRPCRequestSchema: () => JSONRPCRequestSchema,
	JSONRPCResponseSchema: () => JSONRPCResponseSchema,
	JSONRPCResultResponseSchema: () => JSONRPCResultResponseSchema,
	JSONValueSchema: () => JSONValueSchema,
	LegacyTitledEnumSchemaSchema: () => LegacyTitledEnumSchemaSchema,
	ListChangedOptionsBaseSchema: () => ListChangedOptionsBaseSchema,
	ListPromptsRequestSchema: () => ListPromptsRequestSchema,
	ListPromptsResultSchema: () => ListPromptsResultSchema,
	ListResourceTemplatesRequestSchema: () => ListResourceTemplatesRequestSchema,
	ListResourceTemplatesResultSchema: () => ListResourceTemplatesResultSchema,
	ListResourcesRequestSchema: () => ListResourcesRequestSchema,
	ListResourcesResultSchema: () => ListResourcesResultSchema,
	ListRootsRequestSchema: () => ListRootsRequestSchema,
	ListRootsResultSchema: () => ListRootsResultSchema,
	ListTasksRequestSchema: () => ListTasksRequestSchema,
	ListTasksResultSchema: () => ListTasksResultSchema,
	ListToolsRequestSchema: () => ListToolsRequestSchema,
	ListToolsResultSchema: () => ListToolsResultSchema,
	LoggingLevelSchema: () => LoggingLevelSchema,
	LoggingMessageNotificationParamsSchema: () => LoggingMessageNotificationParamsSchema,
	LoggingMessageNotificationSchema: () => LoggingMessageNotificationSchema,
	ModelHintSchema: () => ModelHintSchema,
	ModelPreferencesSchema: () => ModelPreferencesSchema,
	MultiSelectEnumSchemaSchema: () => MultiSelectEnumSchemaSchema,
	NotificationSchema: () => NotificationSchema,
	NotificationsParamsSchema: () => NotificationsParamsSchema,
	NumberSchemaSchema: () => NumberSchemaSchema,
	PaginatedRequestParamsSchema: () => PaginatedRequestParamsSchema,
	PaginatedRequestSchema: () => PaginatedRequestSchema,
	PaginatedResultSchema: () => PaginatedResultSchema,
	PingRequestSchema: () => PingRequestSchema,
	PrimitiveSchemaDefinitionSchema: () => PrimitiveSchemaDefinitionSchema,
	ProgressNotificationParamsSchema: () => ProgressNotificationParamsSchema,
	ProgressNotificationSchema: () => ProgressNotificationSchema,
	ProgressSchema: () => ProgressSchema,
	ProgressTokenSchema: () => ProgressTokenSchema,
	PromptArgumentSchema: () => PromptArgumentSchema,
	PromptListChangedNotificationSchema: () => PromptListChangedNotificationSchema,
	PromptMessageSchema: () => PromptMessageSchema,
	PromptReferenceSchema: () => PromptReferenceSchema,
	PromptSchema: () => PromptSchema,
	ReadResourceRequestParamsSchema: () => ReadResourceRequestParamsSchema,
	ReadResourceRequestSchema: () => ReadResourceRequestSchema,
	ReadResourceResultSchema: () => ReadResourceResultSchema,
	RelatedTaskMetadataSchema: () => RelatedTaskMetadataSchema,
	RequestIdSchema: () => RequestIdSchema,
	RequestMetaSchema: () => RequestMetaSchema,
	RequestSchema: () => RequestSchema,
	ResourceContentsSchema: () => ResourceContentsSchema,
	ResourceLinkSchema: () => ResourceLinkSchema,
	ResourceListChangedNotificationSchema: () => ResourceListChangedNotificationSchema,
	ResourceRequestParamsSchema: () => ResourceRequestParamsSchema,
	ResourceSchema: () => ResourceSchema,
	ResourceTemplateReferenceSchema: () => ResourceTemplateReferenceSchema,
	ResourceTemplateSchema: () => ResourceTemplateSchema,
	ResourceUpdatedNotificationParamsSchema: () => ResourceUpdatedNotificationParamsSchema,
	ResourceUpdatedNotificationSchema: () => ResourceUpdatedNotificationSchema,
	ResultSchema: () => ResultSchema,
	RoleSchema: () => RoleSchema,
	RootSchema: () => RootSchema,
	RootsListChangedNotificationSchema: () => RootsListChangedNotificationSchema,
	SamplingContentSchema: () => SamplingContentSchema,
	SamplingMessageContentBlockSchema: () => SamplingMessageContentBlockSchema,
	SamplingMessageSchema: () => SamplingMessageSchema,
	ServerCapabilitiesSchema: () => ServerCapabilitiesSchema,
	ServerNotificationSchema: () => ServerNotificationSchema,
	ServerRequestSchema: () => ServerRequestSchema,
	ServerResultSchema: () => ServerResultSchema,
	ServerTasksCapabilitySchema: () => ServerTasksCapabilitySchema,
	SetLevelRequestParamsSchema: () => SetLevelRequestParamsSchema,
	SetLevelRequestSchema: () => SetLevelRequestSchema,
	SingleSelectEnumSchemaSchema: () => SingleSelectEnumSchemaSchema,
	StringSchemaSchema: () => StringSchemaSchema,
	SubscribeRequestParamsSchema: () => SubscribeRequestParamsSchema,
	SubscribeRequestSchema: () => SubscribeRequestSchema,
	SubscriptionFilterSchema: () => SubscriptionFilterSchema,
	SubscriptionsAcknowledgedNotificationParamsSchema: () => SubscriptionsAcknowledgedNotificationParamsSchema,
	SubscriptionsAcknowledgedNotificationSchema: () => SubscriptionsAcknowledgedNotificationSchema,
	SubscriptionsListenRequestParamsSchema: () => SubscriptionsListenRequestParamsSchema,
	SubscriptionsListenRequestSchema: () => SubscriptionsListenRequestSchema,
	SubscriptionsListenResultMetaSchema: () => SubscriptionsListenResultMetaSchema,
	SubscriptionsListenResultSchema: () => SubscriptionsListenResultSchema,
	TaskAugmentedRequestParamsSchema: () => TaskAugmentedRequestParamsSchema,
	TaskCreationParamsSchema: () => TaskCreationParamsSchema,
	TaskMetadataSchema: () => TaskMetadataSchema,
	TaskSchema: () => TaskSchema,
	TaskStatusNotificationParamsSchema: () => TaskStatusNotificationParamsSchema,
	TaskStatusNotificationSchema: () => TaskStatusNotificationSchema,
	TaskStatusSchema: () => TaskStatusSchema,
	TextContentSchema: () => TextContentSchema,
	TextResourceContentsSchema: () => TextResourceContentsSchema,
	TitledMultiSelectEnumSchemaSchema: () => TitledMultiSelectEnumSchemaSchema,
	TitledSingleSelectEnumSchemaSchema: () => TitledSingleSelectEnumSchemaSchema,
	ToolAnnotationsSchema: () => ToolAnnotationsSchema,
	ToolChoiceSchema: () => ToolChoiceSchema,
	ToolExecutionSchema: () => ToolExecutionSchema,
	ToolListChangedNotificationSchema: () => ToolListChangedNotificationSchema,
	ToolResultContentSchema: () => ToolResultContentSchema,
	ToolSchema: () => ToolSchema,
	ToolUseContentSchema: () => ToolUseContentSchema,
	UnsubscribeRequestParamsSchema: () => UnsubscribeRequestParamsSchema,
	UnsubscribeRequestSchema: () => UnsubscribeRequestSchema,
	UntitledMultiSelectEnumSchemaSchema: () => UntitledMultiSelectEnumSchemaSchema,
	UntitledSingleSelectEnumSchemaSchema: () => UntitledSingleSelectEnumSchemaSchema
});
const JSONValueSchema = z.lazy(() => z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.record(z.string(), JSONValueSchema),
	z.array(JSONValueSchema)
]));
const JSONObjectSchema = z.record(z.string(), JSONValueSchema);
const JSONArraySchema = z.array(JSONValueSchema);
/**
* A progress token, used to associate progress notifications with the original request.
*/
const ProgressTokenSchema = z.union([z.string(), z.number().int()]);
/**
* An opaque token used to represent a cursor for pagination.
*/
const CursorSchema = z.string();
/** @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only. */
const TaskMetadataSchema = z.object({ ttl: z.number().optional() });
/**
* Metadata for associating messages with a task.
* Include this in the `_meta` field under the key `io.modelcontextprotocol/related-task`.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const RelatedTaskMetadataSchema = z.object({ taskId: z.string() });
const RequestMetaSchema = z.looseObject({
	progressToken: ProgressTokenSchema.optional(),
	[RELATED_TASK_META_KEY]: RelatedTaskMetadataSchema.optional()
});
/**
* Common params for any request.
*/
const BaseRequestParamsSchema = z.object({ _meta: RequestMetaSchema.optional() });
/**
* Common params for any task-augmented request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskAugmentedRequestParamsSchema = BaseRequestParamsSchema.extend({ task: TaskMetadataSchema.optional() });
const RequestSchema = z.object({
	method: z.string(),
	params: BaseRequestParamsSchema.loose().optional()
});
const NotificationsParamsSchema = z.object({ _meta: RequestMetaSchema.optional() });
const NotificationSchema = z.object({
	method: z.string(),
	params: NotificationsParamsSchema.loose().optional()
});
const ResultSchema = z.looseObject({ _meta: RequestMetaSchema.optional() });
/**
* A uniquely identifying ID for a request in JSON-RPC.
*/
const RequestIdSchema = z.union([z.string(), z.number().int()]);
/**
* A request that expects a response.
*/
const JSONRPCRequestSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	id: RequestIdSchema,
	...RequestSchema.shape
}).strict();
/**
* A notification which does not expect a response.
*/
const JSONRPCNotificationSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	...NotificationSchema.shape
}).strict();
/**
* A successful (non-error) response to a request.
*/
const JSONRPCResultResponseSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	id: RequestIdSchema,
	result: ResultSchema
}).strict();
/**
* A response to a request that indicates an error occurred.
*/
const JSONRPCErrorResponseSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	id: RequestIdSchema.optional(),
	error: z.object({
		code: z.number().int(),
		message: z.string(),
		data: z.unknown().optional()
	})
}).strict();
const JSONRPCMessageSchema = z.union([
	JSONRPCRequestSchema,
	JSONRPCNotificationSchema,
	JSONRPCResultResponseSchema,
	JSONRPCErrorResponseSchema
]);
const JSONRPCResponseSchema = z.union([JSONRPCResultResponseSchema, JSONRPCErrorResponseSchema]);
/**
* A response that indicates success but carries no data.
*/
const EmptyResultSchema = ResultSchema.strict();
const CancelledNotificationParamsSchema = NotificationsParamsSchema.extend({
	requestId: RequestIdSchema.optional(),
	reason: z.string().optional()
});
/**
* This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
*
* The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
*
* This notification indicates that the result will be unused, so any associated processing SHOULD cease.
*
* A client MUST NOT attempt to cancel its {@linkcode InitializeRequest | initialize} request.
*/
const CancelledNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/cancelled"),
	params: CancelledNotificationParamsSchema
});
/**
* Icon schema for use in {@link Tool | tools}, {@link Prompt | prompts}, {@link Resource | resources}, and {@link Implementation | implementations}.
*/
const IconSchema = z.object({
	src: z.string(),
	mimeType: z.string().optional(),
	sizes: z.array(z.string()).optional(),
	theme: z.enum(["light", "dark"]).optional()
});
/**
* Base schema to add `icons` property.
*
*/
const IconsSchema = z.object({ icons: z.array(IconSchema).optional() });
/**
* Base metadata interface for common properties across {@link Resource | resources}, {@link Tool | tools}, {@link Prompt | prompts}, and {@link Implementation | implementations}.
*/
const BaseMetadataSchema = z.object({
	name: z.string(),
	title: z.string().optional()
});
/**
* Describes the name and version of an MCP implementation.
*/
const ImplementationSchema = BaseMetadataSchema.extend({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	version: z.string(),
	websiteUrl: z.string().optional(),
	description: z.string().optional()
});
const FormElicitationCapabilitySchema = z.intersection(z.object({ applyDefaults: z.boolean().optional() }), JSONObjectSchema);
const ElicitationCapabilitySchema = z.preprocess((value) => {
	if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return { form: {} };
	return value;
}, z.intersection(z.object({
	form: FormElicitationCapabilitySchema.optional(),
	url: JSONObjectSchema.optional()
}), JSONObjectSchema.optional()));
/**
* Task capabilities for clients, indicating which request types support task creation.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ClientTasksCapabilitySchema = z.looseObject({
	list: JSONObjectSchema.optional(),
	cancel: JSONObjectSchema.optional(),
	requests: z.looseObject({
		sampling: z.looseObject({ createMessage: JSONObjectSchema.optional() }).optional(),
		elicitation: z.looseObject({ create: JSONObjectSchema.optional() }).optional()
	}).optional()
});
/**
* Task capabilities for servers, indicating which request types support task creation.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ServerTasksCapabilitySchema = z.looseObject({
	list: JSONObjectSchema.optional(),
	cancel: JSONObjectSchema.optional(),
	requests: z.looseObject({ tools: z.looseObject({ call: JSONObjectSchema.optional() }).optional() }).optional()
});
/**
* Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
*/
const ClientCapabilitiesSchema = z.object({
	experimental: z.record(z.string(), JSONObjectSchema).optional(),
	sampling: z.object({
		context: JSONObjectSchema.optional(),
		tools: JSONObjectSchema.optional()
	}).optional(),
	elicitation: ElicitationCapabilitySchema.optional(),
	roots: z.object({ listChanged: z.boolean().optional() }).optional(),
	tasks: ClientTasksCapabilitySchema.optional(),
	extensions: z.record(z.string(), JSONObjectSchema).optional()
});
const InitializeRequestParamsSchema = BaseRequestParamsSchema.extend({
	protocolVersion: z.string(),
	capabilities: ClientCapabilitiesSchema,
	clientInfo: ImplementationSchema
});
/**
* This request is sent from the client to the server when it first connects, asking it to begin initialization.
*/
const InitializeRequestSchema = RequestSchema.extend({
	method: z.literal("initialize"),
	params: InitializeRequestParamsSchema
});
/**
* Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
*/
const ServerCapabilitiesSchema = z.object({
	experimental: z.record(z.string(), JSONObjectSchema).optional(),
	logging: JSONObjectSchema.optional(),
	completions: JSONObjectSchema.optional(),
	prompts: z.object({ listChanged: z.boolean().optional() }).optional(),
	resources: z.object({
		subscribe: z.boolean().optional(),
		listChanged: z.boolean().optional()
	}).optional(),
	tools: z.object({ listChanged: z.boolean().optional() }).optional(),
	tasks: ServerTasksCapabilitySchema.optional(),
	extensions: z.record(z.string(), JSONObjectSchema).optional()
});
/**
* After receiving an initialize request from the client, the server sends this response.
*/
const InitializeResultSchema = ResultSchema.extend({
	protocolVersion: z.string(),
	capabilities: ServerCapabilitiesSchema,
	serverInfo: ImplementationSchema,
	instructions: z.string().optional()
});
/**
* This notification is sent from the client to the server after initialization has finished.
*/
const InitializedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/initialized"),
	params: NotificationsParamsSchema.optional()
});
/**
* A request from the client asking the server to advertise its supported protocol
* versions, capabilities, and other metadata (protocol revision 2026-07-28). Servers
* MUST implement `server/discover`. Clients MAY call it but are not required to —
* version negotiation can also happen inline via the per-request `_meta` envelope.
*/
const DiscoverRequestSchema = RequestSchema.extend({
	method: z.literal("server/discover"),
	params: BaseRequestParamsSchema.optional()
});
/**
* The result returned by the server for a `server/discover` request.
*/
const DiscoverResultSchema = ResultSchema.extend({
	supportedVersions: z.array(z.string()),
	capabilities: ServerCapabilitiesSchema,
	serverInfo: ImplementationSchema,
	instructions: z.string().optional()
});
/**
* A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
*/
const PingRequestSchema = RequestSchema.extend({
	method: z.literal("ping"),
	params: BaseRequestParamsSchema.optional()
});
const ProgressSchema = z.object({
	progress: z.number(),
	total: z.optional(z.number()),
	message: z.optional(z.string())
});
const ProgressNotificationParamsSchema = z.object({
	...NotificationsParamsSchema.shape,
	...ProgressSchema.shape,
	progressToken: ProgressTokenSchema
});
/**
* An out-of-band notification used to inform the receiver of a progress update for a long-running request.
*
* @category notifications/progress
*/
const ProgressNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/progress"),
	params: ProgressNotificationParamsSchema
});
const PaginatedRequestParamsSchema = BaseRequestParamsSchema.extend({ cursor: CursorSchema.optional() });
const PaginatedRequestSchema = RequestSchema.extend({ params: PaginatedRequestParamsSchema.optional() });
const PaginatedResultSchema = ResultSchema.extend({ nextCursor: CursorSchema.optional() });
/**
* The contents of a specific resource or sub-resource.
*/
const ResourceContentsSchema = z.object({
	uri: z.string(),
	mimeType: z.optional(z.string()),
	_meta: z.record(z.string(), z.unknown()).optional()
});
const TextResourceContentsSchema = ResourceContentsSchema.extend({ text: z.string() });
/**
* A Zod schema for validating Base64 strings that is more performant and
* robust for very large inputs than the default regex-based check. It avoids
* stack overflows by using the native `atob` function for validation.
*/
const Base64Schema = z.string().refine((val) => {
	try {
		atob(val);
		return true;
	} catch {
		return false;
	}
}, { message: "Invalid Base64 string" });
const BlobResourceContentsSchema = ResourceContentsSchema.extend({ blob: Base64Schema });
/**
* The sender or recipient of messages and data in a conversation.
*/
const RoleSchema = z.enum(["user", "assistant"]);
/**
* Optional annotations providing clients additional context about a resource.
*/
const AnnotationsSchema = z.object({
	audience: z.array(RoleSchema).optional(),
	priority: z.number().min(0).max(1).optional(),
	lastModified: z.iso.datetime({ offset: true }).optional()
});
/**
* A known resource that the server is capable of reading.
*/
const ResourceSchema = z.object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	uri: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string()),
	size: z.optional(z.number()),
	annotations: AnnotationsSchema.optional(),
	_meta: z.optional(z.looseObject({}))
});
/**
* A template description for resources available on the server.
*/
const ResourceTemplateSchema = z.object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	uriTemplate: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string()),
	annotations: AnnotationsSchema.optional(),
	_meta: z.optional(z.looseObject({}))
});
/**
* Sent from the client to request a list of resources the server has.
*/
const ListResourcesRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("resources/list") });
/**
* The server's response to a {@linkcode ListResourcesRequest | resources/list} request from the client.
*/
const ListResourcesResultSchema = PaginatedResultSchema.extend({ resources: z.array(ResourceSchema) });
/**
* Sent from the client to request a list of resource templates the server has.
*/
const ListResourceTemplatesRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("resources/templates/list") });
/**
* The server's response to a {@linkcode ListResourceTemplatesRequest | resources/templates/list} request from the client.
*/
const ListResourceTemplatesResultSchema = PaginatedResultSchema.extend({ resourceTemplates: z.array(ResourceTemplateSchema) });
const ResourceRequestParamsSchema = BaseRequestParamsSchema.extend({ uri: z.string() });
/**
* Parameters for a {@linkcode ReadResourceRequest | resources/read} request.
*/
const ReadResourceRequestParamsSchema = ResourceRequestParamsSchema;
/**
* Sent from the client to the server, to read a specific resource URI.
*/
const ReadResourceRequestSchema = RequestSchema.extend({
	method: z.literal("resources/read"),
	params: ReadResourceRequestParamsSchema
});
/**
* The server's response to a {@linkcode ReadResourceRequest | resources/read} request from the client.
*/
const ReadResourceResultSchema = ResultSchema.extend({ contents: z.array(z.union([TextResourceContentsSchema, BlobResourceContentsSchema])) });
/**
* An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
*/
const ResourceListChangedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/resources/list_changed"),
	params: NotificationsParamsSchema.optional()
});
const SubscribeRequestParamsSchema = ResourceRequestParamsSchema;
/**
* Sent from the client to request `resources/updated` notifications from the server whenever a particular resource changes.
*/
const SubscribeRequestSchema = RequestSchema.extend({
	method: z.literal("resources/subscribe"),
	params: SubscribeRequestParamsSchema
});
const UnsubscribeRequestParamsSchema = ResourceRequestParamsSchema;
/**
* Sent from the client to request cancellation of {@linkcode ResourceUpdatedNotification | resources/updated} notifications from the server. This should follow a previous {@linkcode SubscribeRequest | resources/subscribe} request.
*/
const UnsubscribeRequestSchema = RequestSchema.extend({
	method: z.literal("resources/unsubscribe"),
	params: UnsubscribeRequestParamsSchema
});
/**
* The set of notification types a client opts in to on a `subscriptions/listen`
* request. Each type is opt-in; the server MUST NOT send a notification type
* the client has not explicitly requested here.
*/
const SubscriptionFilterSchema = z.object({
	toolsListChanged: z.boolean().optional(),
	promptsListChanged: z.boolean().optional(),
	resourcesListChanged: z.boolean().optional(),
	resourceSubscriptions: z.array(z.string()).optional()
});
const SubscriptionsListenRequestParamsSchema = BaseRequestParamsSchema.extend({ notifications: SubscriptionFilterSchema });
/**
* Sent from the client to open a long-lived channel for receiving notifications
* outside the context of a specific request (protocol revision 2026-07-28).
* Replaces the previous HTTP GET endpoint and `resources/subscribe`.
*/
const SubscriptionsListenRequestSchema = RequestSchema.extend({
	method: z.literal("subscriptions/listen"),
	params: SubscriptionsListenRequestParamsSchema
});
const SubscriptionsAcknowledgedNotificationParamsSchema = NotificationsParamsSchema.extend({ notifications: SubscriptionFilterSchema });
/**
* Sent by the server as the first message on a `subscriptions/listen` stream
* to acknowledge that the subscription has been established and report which
* notification types it agreed to honor (protocol revision 2026-07-28).
*/
const SubscriptionsAcknowledgedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/subscriptions/acknowledged"),
	params: SubscriptionsAcknowledgedNotificationParamsSchema
});
/**
* `_meta` for a {@linkcode SubscriptionsListenResult}: the listen request's
* JSON-RPC ID under the canonical subscription-id key (mirroring the same key
* on every notification delivered on the stream).
*/
const SubscriptionsListenResultMetaSchema = z.looseObject({ [SUBSCRIPTION_ID_META_KEY]: RequestIdSchema });
/**
* The response to a `subscriptions/listen` request, signalling that the
* subscription has ended gracefully (for example, during server shutdown).
* Because the listen stream is long-lived, this result is sent only when the
* server tears the subscription down; an abrupt transport close carries no
* response. The result body is otherwise empty.
*/
const SubscriptionsListenResultSchema = ResultSchema.extend({ _meta: SubscriptionsListenResultMetaSchema });
/**
* Parameters for a {@linkcode ResourceUpdatedNotification | notifications/resources/updated} notification.
*/
const ResourceUpdatedNotificationParamsSchema = NotificationsParamsSchema.extend({ uri: z.string() });
/**
* A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a {@linkcode SubscribeRequest | resources/subscribe} request.
*/
const ResourceUpdatedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/resources/updated"),
	params: ResourceUpdatedNotificationParamsSchema
});
/**
* Describes an argument that a prompt can accept.
*/
const PromptArgumentSchema = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	required: z.optional(z.boolean())
});
/**
* A prompt or prompt template that the server offers.
*/
const PromptSchema = z.object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	description: z.optional(z.string()),
	arguments: z.optional(z.array(PromptArgumentSchema)),
	_meta: z.optional(z.looseObject({}))
});
/**
* Sent from the client to request a list of prompts and prompt templates the server has.
*/
const ListPromptsRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("prompts/list") });
/**
* The server's response to a {@linkcode ListPromptsRequest | prompts/list} request from the client.
*/
const ListPromptsResultSchema = PaginatedResultSchema.extend({ prompts: z.array(PromptSchema) });
/**
* Parameters for a {@linkcode GetPromptRequest | prompts/get} request.
*/
const GetPromptRequestParamsSchema = BaseRequestParamsSchema.extend({
	name: z.string(),
	arguments: z.record(z.string(), z.string()).optional()
});
/**
* Used by the client to get a prompt provided by the server.
*/
const GetPromptRequestSchema = RequestSchema.extend({
	method: z.literal("prompts/get"),
	params: GetPromptRequestParamsSchema
});
/**
* Text provided to or from an LLM.
*/
const TextContentSchema = z.object({
	type: z.literal("text"),
	text: z.string(),
	annotations: AnnotationsSchema.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* An image provided to or from an LLM.
*/
const ImageContentSchema = z.object({
	type: z.literal("image"),
	data: Base64Schema,
	mimeType: z.string(),
	annotations: AnnotationsSchema.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Audio content provided to or from an LLM.
*/
const AudioContentSchema = z.object({
	type: z.literal("audio"),
	data: Base64Schema,
	mimeType: z.string(),
	annotations: AnnotationsSchema.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* A tool call request from an assistant (LLM).
* Represents the assistant's request to use a tool.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ToolUseContentSchema = z.object({
	type: z.literal("tool_use"),
	name: z.string(),
	id: z.string(),
	input: z.record(z.string(), z.unknown()),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* The contents of a resource, embedded into a prompt or tool call result.
*/
const EmbeddedResourceSchema = z.object({
	type: z.literal("resource"),
	resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
	annotations: AnnotationsSchema.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* A resource that the server is capable of reading, included in a prompt or tool call result.
*
* Note: resource links returned by tools are not guaranteed to appear in the results of {@linkcode ListResourcesRequest | resources/list} requests.
*/
const ResourceLinkSchema = ResourceSchema.extend({ type: z.literal("resource_link") });
/**
* A content block that can be used in prompts and tool results.
*/
const ContentBlockSchema = z.union([
	TextContentSchema,
	ImageContentSchema,
	AudioContentSchema,
	ResourceLinkSchema,
	EmbeddedResourceSchema
]);
/**
* Describes a message returned as part of a prompt.
*/
const PromptMessageSchema = z.object({
	role: RoleSchema,
	content: ContentBlockSchema
});
/**
* The server's response to a {@linkcode GetPromptRequest | prompts/get} request from the client.
*/
const GetPromptResultSchema = ResultSchema.extend({
	description: z.string().optional(),
	messages: z.array(PromptMessageSchema)
});
/**
* An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
const PromptListChangedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/prompts/list_changed"),
	params: NotificationsParamsSchema.optional()
});
/**
* Additional properties describing a `Tool` to clients.
*
* NOTE: all properties in {@linkcode ToolAnnotations} are **hints**.
* They are not guaranteed to provide a faithful description of
* tool behavior (including descriptive properties like `title`).
*
* Clients should never make tool use decisions based on `ToolAnnotations`
* received from untrusted servers.
*/
const ToolAnnotationsSchema = z.object({
	title: z.string().optional(),
	readOnlyHint: z.boolean().optional(),
	destructiveHint: z.boolean().optional(),
	idempotentHint: z.boolean().optional(),
	openWorldHint: z.boolean().optional()
});
/**
* Execution-related properties for a tool.
*/
const ToolExecutionSchema = z.object({ taskSupport: z.enum([
	"required",
	"optional",
	"forbidden"
]).optional() });
/**
* Definition for a tool the client can call.
*/
const ToolSchema = z.object({
	...BaseMetadataSchema.shape,
	...IconsSchema.shape,
	description: z.string().optional(),
	inputSchema: z.object({
		type: z.literal("object"),
		properties: z.record(z.string(), JSONValueSchema).optional(),
		required: z.array(z.string()).optional()
	}).catchall(z.unknown()),
	outputSchema: z.looseObject({ $schema: z.string().optional() }).optional(),
	annotations: ToolAnnotationsSchema.optional(),
	execution: ToolExecutionSchema.optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Sent from the client to request a list of tools the server has.
*/
const ListToolsRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("tools/list") });
/**
* The server's response to a {@linkcode ListToolsRequest | tools/list} request from the client.
*/
const ListToolsResultSchema = PaginatedResultSchema.extend({ tools: z.array(ToolSchema) });
/**
* The server's response to a tool call.
*/
const CallToolResultSchema = ResultSchema.extend({
	content: z.array(ContentBlockSchema),
	structuredContent: z.unknown().optional(),
	isError: z.boolean().optional()
});
/**
* {@linkcode CallToolResultSchema} extended with backwards compatibility to protocol version 2024-10-07.
*/
const CompatibilityCallToolResultSchema = CallToolResultSchema.or(ResultSchema.extend({ toolResult: z.unknown() }));
/**
* Parameters for a `tools/call` request.
*/
const CallToolRequestParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	name: z.string(),
	arguments: z.record(z.string(), z.unknown()).optional()
});
/**
* Used by the client to invoke a tool provided by the server.
*/
const CallToolRequestSchema = RequestSchema.extend({
	method: z.literal("tools/call"),
	params: CallToolRequestParamsSchema
});
/**
* An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
const ToolListChangedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/tools/list_changed"),
	params: NotificationsParamsSchema.optional()
});
/**
* Base schema for list changed subscription options (without callback).
* Used internally for Zod validation of `autoRefresh` and `debounceMs`.
*/
const ListChangedOptionsBaseSchema = z.object({
	autoRefresh: z.boolean().default(true),
	debounceMs: z.number().int().nonnegative().default(300)
});
/**
* The severity of a log message.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const LoggingLevelSchema = z.enum([
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency"
]);
/**
* Parameters for a `logging/setLevel` request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const SetLevelRequestParamsSchema = BaseRequestParamsSchema.extend({ level: LoggingLevelSchema });
/**
* A request from the client to the server, to enable or adjust logging.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const SetLevelRequestSchema = RequestSchema.extend({
	method: z.literal("logging/setLevel"),
	params: SetLevelRequestParamsSchema
});
/**
* Parameters for a `notifications/message` notification.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const LoggingMessageNotificationParamsSchema = NotificationsParamsSchema.extend({
	level: LoggingLevelSchema,
	logger: z.string().optional(),
	data: z.unknown()
});
/**
* Notification of a log message passed from server to client. If no `logging/setLevel` request has been sent from the client, the server MAY decide which messages to send automatically.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to stderr logging
* (STDIO servers) or OpenTelemetry.
*/
const LoggingMessageNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/message"),
	params: LoggingMessageNotificationParamsSchema
});
/**
* Hints to use for model selection.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ModelHintSchema = z.object({ name: z.string().optional() });
/**
* The server's preferences for model selection, requested of the client during sampling.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ModelPreferencesSchema = z.object({
	hints: z.array(ModelHintSchema).optional(),
	costPriority: z.number().min(0).max(1).optional(),
	speedPriority: z.number().min(0).max(1).optional(),
	intelligencePriority: z.number().min(0).max(1).optional()
});
/**
* Controls tool usage behavior in sampling requests.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ToolChoiceSchema = z.object({ mode: z.enum([
	"auto",
	"required",
	"none"
]).optional() });
/**
* The result of a tool execution, provided by the user (server).
* Represents the outcome of invoking a tool requested via `ToolUseContent`.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const ToolResultContentSchema = z.object({
	type: z.literal("tool_result"),
	toolUseId: z.string().describe("The unique identifier for the corresponding tool call."),
	content: z.array(ContentBlockSchema),
	structuredContent: z.unknown().optional(),
	isError: z.boolean().optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Basic content types for sampling responses (without tool use).
* Used for backwards-compatible {@linkcode CreateMessageResult} when tools are not used.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const SamplingContentSchema = z.discriminatedUnion("type", [
	TextContentSchema,
	ImageContentSchema,
	AudioContentSchema
]);
/**
* Content block types allowed in sampling messages.
* This includes text, image, audio, tool use requests, and tool results.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const SamplingMessageContentBlockSchema = z.discriminatedUnion("type", [
	TextContentSchema,
	ImageContentSchema,
	AudioContentSchema,
	ToolUseContentSchema,
	ToolResultContentSchema
]);
/**
* Describes a message issued to or received from an LLM API.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const SamplingMessageSchema = z.object({
	role: RoleSchema,
	content: z.union([SamplingMessageContentBlockSchema, z.array(SamplingMessageContentBlockSchema)]),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Parameters for a `sampling/createMessage` request.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageRequestParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	messages: z.array(SamplingMessageSchema),
	modelPreferences: ModelPreferencesSchema.optional(),
	systemPrompt: z.string().optional(),
	includeContext: z.enum([
		"none",
		"thisServer",
		"allServers"
	]).optional(),
	temperature: z.number().optional(),
	maxTokens: z.number().int(),
	stopSequences: z.array(z.string()).optional(),
	metadata: JSONObjectSchema.optional(),
	tools: z.array(ToolSchema).optional(),
	toolChoice: ToolChoiceSchema.optional()
});
/**
* A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageRequestSchema = RequestSchema.extend({
	method: z.literal("sampling/createMessage"),
	params: CreateMessageRequestParamsSchema
});
/**
* The client's response to a `sampling/create_message` request from the server.
* This is the backwards-compatible version that returns single content (no arrays).
* Used when the request does not include tools.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageResultSchema = ResultSchema.extend({
	model: z.string(),
	stopReason: z.optional(z.enum([
		"endTurn",
		"stopSequence",
		"maxTokens"
	]).or(z.string())),
	role: RoleSchema,
	content: SamplingContentSchema
});
/**
* The client's response to a `sampling/create_message` request when tools were provided.
* This version supports array content for tool use flows.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to calling LLM
* provider APIs directly.
*/
const CreateMessageResultWithToolsSchema = ResultSchema.extend({
	model: z.string(),
	stopReason: z.optional(z.enum([
		"endTurn",
		"stopSequence",
		"maxTokens",
		"toolUse"
	]).or(z.string())),
	role: RoleSchema,
	content: z.union([SamplingMessageContentBlockSchema, z.array(SamplingMessageContentBlockSchema)])
});
/**
* Primitive schema definition for boolean fields.
*/
const BooleanSchemaSchema = z.object({
	type: z.literal("boolean"),
	title: z.string().optional(),
	description: z.string().optional(),
	default: z.boolean().optional()
});
/**
* Primitive schema definition for string fields.
*/
const StringSchemaSchema = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	minLength: z.number().optional(),
	maxLength: z.number().optional(),
	format: z.enum([
		"email",
		"uri",
		"date",
		"date-time"
	]).optional(),
	default: z.string().optional()
});
/**
* Primitive schema definition for number fields.
*/
const NumberSchemaSchema = z.object({
	type: z.enum(["number", "integer"]),
	title: z.string().optional(),
	description: z.string().optional(),
	minimum: z.number().optional(),
	maximum: z.number().optional(),
	default: z.number().optional()
});
/**
* Schema for single-selection enumeration without display titles for options.
*/
const UntitledSingleSelectEnumSchemaSchema = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	enum: z.array(z.string()),
	default: z.string().optional()
});
/**
* Schema for single-selection enumeration with display titles for each option.
*/
const TitledSingleSelectEnumSchemaSchema = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	oneOf: z.array(z.object({
		const: z.string(),
		title: z.string()
	})),
	default: z.string().optional()
});
/**
* Use {@linkcode TitledSingleSelectEnumSchema} instead.
* This interface will be removed in a future version.
*/
const LegacyTitledEnumSchemaSchema = z.object({
	type: z.literal("string"),
	title: z.string().optional(),
	description: z.string().optional(),
	enum: z.array(z.string()),
	enumNames: z.array(z.string()).optional(),
	default: z.string().optional()
});
const SingleSelectEnumSchemaSchema = z.union([UntitledSingleSelectEnumSchemaSchema, TitledSingleSelectEnumSchemaSchema]);
/**
* Schema for multiple-selection enumeration without display titles for options.
*/
const UntitledMultiSelectEnumSchemaSchema = z.object({
	type: z.literal("array"),
	title: z.string().optional(),
	description: z.string().optional(),
	minItems: z.number().optional(),
	maxItems: z.number().optional(),
	items: z.object({
		type: z.literal("string"),
		enum: z.array(z.string())
	}),
	default: z.array(z.string()).optional()
});
/**
* Schema for multiple-selection enumeration with display titles for each option.
*/
const TitledMultiSelectEnumSchemaSchema = z.object({
	type: z.literal("array"),
	title: z.string().optional(),
	description: z.string().optional(),
	minItems: z.number().optional(),
	maxItems: z.number().optional(),
	items: z.object({ anyOf: z.array(z.object({
		const: z.string(),
		title: z.string()
	})) }),
	default: z.array(z.string()).optional()
});
/**
* Combined schema for multiple-selection enumeration
*/
const MultiSelectEnumSchemaSchema = z.union([UntitledMultiSelectEnumSchemaSchema, TitledMultiSelectEnumSchemaSchema]);
/**
* Primitive schema definition for enum fields.
*/
const EnumSchemaSchema = z.union([
	LegacyTitledEnumSchemaSchema,
	SingleSelectEnumSchemaSchema,
	MultiSelectEnumSchemaSchema
]);
/**
* Union of all primitive schema definitions.
*/
const PrimitiveSchemaDefinitionSchema = z.union([
	EnumSchemaSchema,
	BooleanSchemaSchema,
	StringSchemaSchema,
	NumberSchemaSchema
]);
/**
* Parameters for an `elicitation/create` request for form-based elicitation.
*/
const ElicitRequestFormParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	mode: z.literal("form").optional(),
	message: z.string(),
	requestedSchema: z.object({
		type: z.literal("object"),
		properties: z.record(z.string(), PrimitiveSchemaDefinitionSchema),
		required: z.array(z.string()).optional()
	}).catchall(z.unknown())
});
/**
* Parameters for an {@linkcode ElicitRequest | elicitation/create} request for URL-based elicitation.
*/
const ElicitRequestURLParamsSchema = TaskAugmentedRequestParamsSchema.extend({
	mode: z.literal("url"),
	message: z.string(),
	elicitationId: z.string(),
	url: z.string().url()
});
/**
* The parameters for a request to elicit additional information from the user via the client.
*/
const ElicitRequestParamsSchema = z.union([ElicitRequestFormParamsSchema, ElicitRequestURLParamsSchema]);
/**
* A request from the server to elicit user input via the client.
* The client should present the message and form fields to the user (form mode)
* or navigate to a URL (URL mode).
*/
const ElicitRequestSchema = RequestSchema.extend({
	method: z.literal("elicitation/create"),
	params: ElicitRequestParamsSchema
});
/**
* Parameters for a {@linkcode ElicitationCompleteNotification | notifications/elicitation/complete} notification.
*
* @deprecated Removed from the spec by #2891 (2026-07-28). The client learns the outcome
* of an out-of-band interaction by retrying the original request; no server-initiated
* completion signal exists in the 2026-07-28 revision. Kept here for the 2025-era flow
* only. The 2026-07-28 wire codec excludes this notification.
* @category notifications/elicitation/complete
*/
const ElicitationCompleteNotificationParamsSchema = NotificationsParamsSchema.extend({ elicitationId: z.string() });
/**
* A notification from the server to the client, informing it of a completion of an out-of-band elicitation request.
*
* @deprecated Removed from the spec by #2891 (2026-07-28). The client learns the outcome
* of an out-of-band interaction by retrying the original request; no server-initiated
* completion signal exists in the 2026-07-28 revision. Kept here for the 2025-era flow
* only. The 2026-07-28 wire codec excludes this notification.
* @category notifications/elicitation/complete
*/
const ElicitationCompleteNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/elicitation/complete"),
	params: ElicitationCompleteNotificationParamsSchema
});
/**
* The client's response to an {@linkcode ElicitRequest | elicitation/create} request from the server.
*/
const ElicitResultSchema = ResultSchema.extend({
	action: z.enum([
		"accept",
		"decline",
		"cancel"
	]),
	content: z.preprocess((val) => val === null ? void 0 : val, z.record(z.string(), z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.array(z.string())
	])).optional())
});
/**
* A reference to a resource or resource template definition.
*/
const ResourceTemplateReferenceSchema = z.object({
	type: z.literal("ref/resource"),
	uri: z.string()
});
/**
* Identifies a prompt.
*/
const PromptReferenceSchema = z.object({
	type: z.literal("ref/prompt"),
	name: z.string()
});
/**
* Parameters for a {@linkcode CompleteRequest | completion/complete} request.
*/
const CompleteRequestParamsSchema = BaseRequestParamsSchema.extend({
	ref: z.union([PromptReferenceSchema, ResourceTemplateReferenceSchema]),
	argument: z.object({
		name: z.string(),
		value: z.string()
	}),
	context: z.object({ arguments: z.record(z.string(), z.string()).optional() }).optional()
});
/**
* A request from the client to the server, to ask for completion options.
*/
const CompleteRequestSchema = RequestSchema.extend({
	method: z.literal("completion/complete"),
	params: CompleteRequestParamsSchema
});
/**
* The server's response to a {@linkcode CompleteRequest | completion/complete} request
*/
const CompleteResultSchema = ResultSchema.extend({ completion: z.looseObject({
	values: z.array(z.string()).max(100),
	total: z.optional(z.number().int()),
	hasMore: z.optional(z.boolean())
}) });
/**
* Represents a root directory or file that the server can operate on.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const RootSchema = z.object({
	uri: z.string().startsWith("file://"),
	name: z.string().optional(),
	_meta: z.record(z.string(), z.unknown()).optional()
});
/**
* Sent from the server to request a list of root URIs from the client.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const ListRootsRequestSchema = RequestSchema.extend({
	method: z.literal("roots/list"),
	params: BaseRequestParamsSchema.optional()
});
/**
* The client's response to a `roots/list` request from the server.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const ListRootsResultSchema = ResultSchema.extend({ roots: z.array(RootSchema) });
/**
* A notification from the client to the server, informing it that the list of roots has changed.
*
* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577); remains
* in the specification for at least twelve months. Migrate to passing paths via
* tool parameters, resource URIs, or configuration.
*/
const RootsListChangedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/roots/list_changed"),
	params: NotificationsParamsSchema.optional()
});
/**
* Task creation parameters, used to ask that the server create a task to represent a request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskCreationParamsSchema = z.looseObject({
	ttl: z.number().optional(),
	pollInterval: z.number().optional()
});
/**
* The status of a task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskStatusSchema = z.enum([
	"working",
	"input_required",
	"completed",
	"failed",
	"cancelled"
]);
/**
* A pollable state object associated with a request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskSchema = z.object({
	taskId: z.string(),
	status: TaskStatusSchema,
	ttl: z.union([z.number(), z.null()]),
	createdAt: z.string(),
	lastUpdatedAt: z.string(),
	pollInterval: z.optional(z.number()),
	statusMessage: z.optional(z.string())
});
/**
* Result returned when a task is created, containing the task data wrapped in a `task` field.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const CreateTaskResultSchema = ResultSchema.extend({ task: TaskSchema });
/**
* Parameters for task status notification.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskStatusNotificationParamsSchema = NotificationsParamsSchema.merge(TaskSchema);
/**
* A notification sent when a task's status changes.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const TaskStatusNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/tasks/status"),
	params: TaskStatusNotificationParamsSchema
});
/**
* A request to get the state of a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskRequestSchema = RequestSchema.extend({
	method: z.literal("tasks/get"),
	params: BaseRequestParamsSchema.extend({ taskId: z.string() })
});
/**
* The response to a {@linkcode GetTaskRequest | tasks/get} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskResultSchema = ResultSchema.merge(TaskSchema);
/**
* A request to get the result of a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskPayloadRequestSchema = RequestSchema.extend({
	method: z.literal("tasks/result"),
	params: BaseRequestParamsSchema.extend({ taskId: z.string() })
});
/**
* The response to a `tasks/result` request.
* The structure matches the result type of the original request.
* For example, a {@linkcode CallToolRequest | tools/call} task would return the `CallToolResult` structure.
*
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const GetTaskPayloadResultSchema = ResultSchema.loose();
/**
* A request to list tasks.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ListTasksRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("tasks/list") });
/**
* The response to a {@linkcode ListTasksRequest | tasks/list} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const ListTasksResultSchema = PaginatedResultSchema.extend({ tasks: z.array(TaskSchema) });
/**
* A request to cancel a specific task.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const CancelTaskRequestSchema = RequestSchema.extend({
	method: z.literal("tasks/cancel"),
	params: BaseRequestParamsSchema.extend({ taskId: z.string() })
});
/**
* The response to a {@linkcode CancelTaskRequest | tasks/cancel} request.
*
* @deprecated 2025-11-25 wire vocabulary with no SDK runtime; kept importable for interoperability only.
*/
const CancelTaskResultSchema = ResultSchema.merge(TaskSchema);
const ClientRequestSchema = z.union([
	PingRequestSchema,
	InitializeRequestSchema,
	DiscoverRequestSchema,
	CompleteRequestSchema,
	SetLevelRequestSchema,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListResourceTemplatesRequestSchema,
	ReadResourceRequestSchema,
	SubscribeRequestSchema,
	UnsubscribeRequestSchema,
	SubscriptionsListenRequestSchema,
	CallToolRequestSchema,
	ListToolsRequestSchema
]);
const ClientNotificationSchema = z.union([
	CancelledNotificationSchema,
	ProgressNotificationSchema,
	InitializedNotificationSchema,
	RootsListChangedNotificationSchema
]);
const ClientResultSchema = z.union([
	EmptyResultSchema,
	CreateMessageResultSchema,
	CreateMessageResultWithToolsSchema,
	ElicitResultSchema,
	ListRootsResultSchema
]);
const ServerRequestSchema = z.union([
	PingRequestSchema,
	CreateMessageRequestSchema,
	ElicitRequestSchema,
	ListRootsRequestSchema
]);
const ServerNotificationSchema = z.union([
	CancelledNotificationSchema,
	ProgressNotificationSchema,
	LoggingMessageNotificationSchema,
	ResourceUpdatedNotificationSchema,
	ResourceListChangedNotificationSchema,
	ToolListChangedNotificationSchema,
	PromptListChangedNotificationSchema,
	SubscriptionsAcknowledgedNotificationSchema,
	ElicitationCompleteNotificationSchema
]);
const ServerResultSchema = z.union([
	EmptyResultSchema,
	InitializeResultSchema,
	DiscoverResultSchema,
	CompleteResultSchema,
	GetPromptResultSchema,
	ListPromptsResultSchema,
	ListResourcesResultSchema,
	ListResourceTemplatesResultSchema,
	ReadResourceResultSchema,
	CallToolResultSchema,
	ListToolsResultSchema,
	SubscriptionsListenResultSchema
]);

//#endregion
//#region ../core-internal/src/types/guards.ts
/**
* Validates and parses an unknown value as a JSON-RPC message.
*
* Use this to validate incoming messages in custom transport implementations.
* Throws if the value does not conform to the JSON-RPC message schema.
*
* @param value - The value to validate (typically a parsed JSON object).
* @returns The validated {@linkcode JSONRPCMessage}.
* @throws If validation fails.
*/
function parseJSONRPCMessage(value) {
	return JSONRPCMessageSchema.parse(value);
}
const isJSONRPCRequest = (value) => JSONRPCRequestSchema.safeParse(value).success;
const isJSONRPCNotification = (value) => JSONRPCNotificationSchema.safeParse(value).success;
/**
* Checks if a value is a valid {@linkcode JSONRPCResultResponse}.
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode JSONRPCResultResponse}, false otherwise.
*/
const isJSONRPCResultResponse = (value) => JSONRPCResultResponseSchema.safeParse(value).success;
/**
* Checks if a value is a valid {@linkcode JSONRPCErrorResponse}.
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode JSONRPCErrorResponse}, false otherwise.
*/
const isJSONRPCErrorResponse = (value) => JSONRPCErrorResponseSchema.safeParse(value).success;
/**
* Checks if a value is a valid {@linkcode JSONRPCResponse} (either a result or error response).
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode JSONRPCResponse}, false otherwise.
*/
const isJSONRPCResponse = (value) => JSONRPCResponseSchema.safeParse(value).success;
/**
* Checks if a value is a valid {@linkcode CallToolResult}.
*
* This is a consumer-side VALUE check against the neutral model, not a wire
* validator: a raw wire object that additionally carries wire-only members
* (e.g. `resultType`) still passes through the loose index signature. Use a
* transport-level parse to validate raw wire traffic.
*
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode CallToolResult}, false otherwise.
*/
const isCallToolResult = (value) => {
	if (typeof value !== "object" || value === null || !("content" in value)) return false;
	return CallToolResultSchema.safeParse(value).success;
};
/**
* Checks whether a value is an input-required result (protocol revision
* 2026-07-28): the multi-round-trip return shape discriminated by
* `resultType: 'input_required'`.
*
* This is a discriminator check, not a full validator — the at-least-one rule
* (`inputRequests` or `requestState`) is enforced by the `inputRequired()`
* builder and re-checked by the server seam for hand-built values.
*
* @param value - The value to check.
* @returns True if the value carries the `input_required` discriminator.
*/
const isInputRequiredResult = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && value.resultType === "input_required";
/**
* Checks if a value is a valid {@linkcode TaskAugmentedRequestParams}.
* @param value - The value to check.
*
* @returns True if the value is a valid {@linkcode TaskAugmentedRequestParams}, false otherwise.
*
* @deprecated Recognizes 2025-11-25 task wire vocabulary, which has no SDK
* runtime; kept importable for interoperability only.
*/
const isTaskAugmentedRequestParams = (value) => TaskAugmentedRequestParamsSchema.safeParse(value).success;
const isInitializeRequest = (value) => InitializeRequestSchema.safeParse(value).success;
const isInitializedNotification = (value) => InitializedNotificationSchema.safeParse(value).success;
function assertCompleteRequestPrompt(request) {
	if (request.params.ref.type !== "ref/prompt") throw new TypeError(`Expected CompleteRequestPrompt, but got ${request.params.ref.type}`);
}
function assertCompleteRequestResourceTemplate(request) {
	if (request.params.ref.type !== "ref/resource") throw new TypeError(`Expected CompleteRequestResourceTemplate, but got ${request.params.ref.type}`);
}

//#endregion
//#region ../core-internal/src/shared/mcpParamHeaders.ts
/** The fixed prefix every custom-parameter header carries. */
const MCP_PARAM_HEADER_PREFIX = "Mcp-Param-";
/** The schema-extension property name a tool's `inputSchema` carries. */
const X_MCP_HEADER_KEY = "x-mcp-header";
/**
* RFC 9110 §5.1 `token` syntax (`1*tchar`). Rejects empty, space, control
* characters (including CR/LF), and the listed delimiters.
*/
const RFC9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/**
* JSON Schema `type` values the spec admits on an `x-mcp-header` property.
*
* The spec text names `integer`, `string`, `boolean` and explicitly excludes
* `number`. The published conformance referee at the pinned release ships its
* `http-custom-headers` scenario with two `type: "number"` `x-mcp-header`
* parameters and expects the client to mirror them, so `number` is accepted
* here so that the conformance gate passes; the discrepancy is tracked
* upstream. Everything else (`object`, `array`, `null`, absent) is rejected.
*/
const PERMITTED_X_MCP_HEADER_TYPES = new Set([
	"string",
	"integer",
	"boolean",
	"number"
]);
/**
* Scan a tool's JSON-serialized `inputSchema` for `x-mcp-header` declarations
* and validate every constraint the spec places on them. Returns either the
* collected declarations (possibly empty) or the first violated constraint.
*
* The walk descends through `properties` at any depth (the spec's "any nesting
* depth" clause). The static-reachability MUST is enforced as a structural
* sweep: every position the chain MUST NOT pass through (`items`/
* `additionalProperties`, `oneOf`/`anyOf`/`allOf`/`not`, `if`/`then`/`else`,
* `$defs`, `$ref` targets within `$defs`) is visited too, and an
* `x-mcp-header` found anywhere on that path invalidates the schema — "an
* annotation anywhere else makes the tool definition invalid".
*/
function scanXMcpHeaderDeclarations(inputSchema) {
	const declarations = [];
	const seenLower = /* @__PURE__ */ new Map();
	const visit = (node, path, reachable) => {
		if (node === null || typeof node !== "object") return void 0;
		const schema = node;
		if (X_MCP_HEADER_KEY in schema) {
			if (!reachable || path.length === 0) return `${pathName(path)}: x-mcp-header is only permitted on properties statically reachable via a chain of 'properties' keys (not under items, additionalProperties, oneOf/anyOf/allOf/not, if/then/else, or $ref)`;
			const raw = schema[X_MCP_HEADER_KEY];
			if (typeof raw !== "string" || raw.length === 0) return `${pathName(path)}: x-mcp-header MUST be a non-empty string`;
			if (!RFC9110_TOKEN.test(raw)) return `${pathName(path)}: x-mcp-header '${raw}' is not a valid RFC 9110 token (no spaces, control characters or HTTP delimiters)`;
			const type = typeof schema.type === "string" ? schema.type : void 0;
			if (type === void 0 || !PERMITTED_X_MCP_HEADER_TYPES.has(type)) return `${pathName(path)}: x-mcp-header is only permitted on primitive-typed properties (string, integer, boolean); got ${type ?? "<none>"}`;
			const lower = raw.toLowerCase();
			const prior = seenLower.get(lower);
			if (prior !== void 0) return `x-mcp-header '${raw}' is not case-insensitively unique (also declared as '${prior}')`;
			seenLower.set(lower, raw);
			declarations.push({
				path,
				headerName: raw,
				type
			});
		}
		const properties = schema.properties;
		if (properties !== null && typeof properties === "object") for (const [key, child] of Object.entries(properties)) {
			const fault$1 = visit(child, [...path, key], reachable);
			if (fault$1 !== void 0) return fault$1;
		}
		for (const k of NON_REACHABLE_SUBSCHEMA_KEYWORDS) {
			const sub = schema[k];
			if (sub === void 0) continue;
			const branches = Array.isArray(sub) ? sub : sub !== null && typeof sub === "object" && OBJECT_VALUED_SUBSCHEMA_KEYWORDS.has(k) ? Object.values(sub) : [sub];
			for (const branch of branches) {
				const fault$1 = visit(branch, [...path, `<${k}>`], false);
				if (fault$1 !== void 0) return fault$1;
			}
		}
	};
	const fault = visit(inputSchema, [], true);
	return fault === void 0 ? {
		valid: true,
		declarations
	} : {
		valid: false,
		reason: fault
	};
}
/**
* JSON Schema keywords whose subschemas the SEP-2243 static-reachability
* constraint excludes from the `properties`-only chain. An `x-mcp-header`
* found under any of these invalidates the tool definition.
*/
const NON_REACHABLE_SUBSCHEMA_KEYWORDS = [
	"items",
	"prefixItems",
	"contains",
	"additionalProperties",
	"unevaluatedProperties",
	"unevaluatedItems",
	"propertyNames",
	"patternProperties",
	"dependentSchemas",
	"oneOf",
	"anyOf",
	"allOf",
	"not",
	"if",
	"then",
	"else",
	"$defs",
	"definitions"
];
/**
* Subschema-carrying keywords whose value is a `name → subschema` object
* (not a single subschema or array of subschemas). The visit branches over
* `Object.values()` for these.
*/
const OBJECT_VALUED_SUBSCHEMA_KEYWORDS = new Set([
	"patternProperties",
	"dependentSchemas",
	"$defs",
	"definitions"
]);
function pathName(path) {
	return path.length === 0 ? "<root>" : path.join(".");
}
const BASE64_SENTINEL_PREFIX = "=?base64?";
const BASE64_SENTINEL_SUFFIX = "?=";
const BASE64_CANONICAL = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CANONICAL_DECIMAL = /^-?\d+(\.\d+)?$/;
/**
* Convert a primitive argument value to its string representation per the
* spec's type-conversion rules: strings pass through, integers and numbers
* become their decimal string, booleans become lowercase `'true'` / `'false'`.
* Non-finite numbers and integers outside the safe range are refused (the
* caller treats `undefined` as "do not emit a header for this value").
*/
function mcpParamPrimitiveToString(value) {
	if (typeof value === "string") return value;
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return void 0;
		if (Number.isInteger(value) && !Number.isSafeInteger(value)) return void 0;
		return String(value);
	}
}
function base64ToUtf8(b64) {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i);
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
/**
* Decode an `Mcp-Param-*` header value: when it carries the Base64 sentinel,
* the payload is decoded as UTF-8; otherwise the value is returned as-is.
* Returns `undefined` when the sentinel is present but the payload is not
* canonical Base64 (or not valid UTF-8) — the spec requires servers to reject
* such values.
*/
function decodeMcpParamValue(value) {
	if (!(value.startsWith(BASE64_SENTINEL_PREFIX) && value.endsWith(BASE64_SENTINEL_SUFFIX))) return value;
	const b64 = value.slice(9, value.length - 2);
	if (!BASE64_CANONICAL.test(b64)) return void 0;
	try {
		return base64ToUtf8(b64);
	} catch {
		return;
	}
}
function valueAtPath(root, path) {
	let node = root;
	for (const key of path) {
		if (node === null || typeof node !== "object") return void 0;
		node = node[key];
	}
	return node;
}
/**
* The header/body comparison the server performs at tool-resolution time.
*
* For each `x-mcp-header` declaration on the named tool: when the body
* `arguments` carries a value, the matching `Mcp-Param-{Name}` header MUST be
* present and decode to an equal value; when the body value is `null` or
* absent the server MUST NOT expect the header (a present header is ignored).
* A sentinel-carrying header whose payload is not canonical Base64 / valid
* UTF-8 is rejected as invalid characters.
*
* Integer-typed declarations are compared numerically (the spec's SHOULD —
* `42.0` and `42` are equal); everything else is compared as decoded strings.
*
* Returns `undefined` when every check passes, or an
* {@linkcode InboundLadderRejection} carrying the same `-32020`
* (`HeaderMismatch`) shape the inbound classifier emits for the
* standard-header cross-checks — `400 Bad Request` with the disagreeing pair
* in `data.mismatch`.
*/
function validateMcpParamHeaders(declarations, args, headers) {
	for (const decl of declarations) {
		const headerKey = `${MCP_PARAM_HEADER_PREFIX}${decl.headerName}`;
		const headerValue = headers.get(headerKey);
		const bodyRaw = valueAtPath(args, decl.path);
		if (bodyRaw === void 0 || bodyRaw === null) continue;
		const bodyString = mcpParamPrimitiveToString(bodyRaw);
		if (bodyString === void 0) continue;
		if (headerValue === null) return paramHeaderMismatchRejection("param-header-missing", headerKey, `the body carries ${pathName(decl.path)}=${JSON.stringify(bodyRaw)} but the ${headerKey} header is absent`);
		const decoded = decodeMcpParamValue(headerValue);
		if (decoded === void 0) return paramHeaderMismatchRejection("param-header-invalid-encoding", headerKey, `the ${headerKey} header carries an invalid Base64 sentinel value`);
		if (!((decl.type === "integer" || decl.type === "number") && CANONICAL_DECIMAL.test(decoded) && typeof bodyRaw === "number" ? Number(decoded) === bodyRaw : decoded === bodyString)) return paramHeaderMismatchRejection("param-header-mismatch", headerKey, `the ${headerKey} header decodes to ${JSON.stringify(decoded)} but the body carries ${pathName(decl.path)}=${JSON.stringify(bodyRaw)}`);
	}
}
/**
* Build the `-32020` (`HeaderMismatch`) rejection for an `Mcp-Param-*`
* disagreement. Same shape as the inbound classifier's standard-header
* cross-check mismatch (HTTP `400`, `data.mismatch` naming the disagreeing
* pair, `settled: true`); only the rung differs because this check runs at the
* pre-dispatch step against a known tool's schema rather than at the edge.
*/
function paramHeaderMismatchRejection(cell, header, body) {
	return {
		kind: "reject",
		rung: "param-header-validation",
		cell,
		httpStatus: 400,
		code: HEADER_MISMATCH_ERROR_CODE,
		message: `Bad Request: the request headers and body disagree: ${body}`,
		data: { mismatch: {
			header,
			body
		} },
		settled: true
	};
}

//#endregion
//#region ../core-internal/src/shared/inboundClassification.ts
/**
* Inbound HTTP request classification and the inbound validation ladder
* (protocol revision 2026-07-28).
*
* `classifyInboundRequest` is the body-primary era predicate for an HTTP
* entry that serves both protocol eras on one endpoint. It is evaluated
* exactly once, at the entry boundary, on the already-parsed request body:
*
* - `initialize` is a legacy-era request by definition (the modern era has no
*   `initialize` handshake) — unless it carries a valid envelope claim naming
*   a modern revision, in which case the claim wins and the request is
*   classified like any other enveloped request (the modern era then answers
*   it with method-not-found, exactly like every other method it does not
*   define).
* - A request whose `params._meta` carries the reserved protocol-version key
*   claims the per-request envelope mechanism and classifies into the era the
*   named revision belongs to (a malformed envelope behind a present claim is
*   a validation error, never a silent fall back to legacy handling).
* - A request without a claim is legacy-era traffic.
* - The `MCP-Protocol-Version` header is a cross-check only: it never
*   upgrades or downgrades a body-derived classification, and a disagreement
*   between header and body is an explicit ladder outcome.
* - Notifications carry no envelope claim of their own under the current
*   spec, so for notification POSTs without a body claim the modern header is
*   determinative; the `Mcp-Method` header is validated against the body when
*   the message classifies modern and is never enforced on legacy traffic.
*   A notification that does carry a claim is treated body-primary like a
*   request, and a malformed claim is rejected the same way a request's
*   malformed claim is — never silently resolved against the header.
*   The notification-POST header cross-checks here are an SDK-defensive
*   posture, not a spec requirement: the spec leaves header rules for posted
*   notifications undefined (core client notifications do not occur over
*   Streamable HTTP); applying the request rules symmetrically is what an
*   ecosystem custom-notification POST expects, and the −32020 cells stay
*   passing for them.
* - `GET`/`DELETE` (and any other non-`POST` method) are body-less 2025-era
*   session operations: the modern era is `POST`-only, so they are routed to
*   legacy serving when it is configured and rejected otherwise.
* - Array (batch) bodies are classified element-wise: an array containing a
*   modern-claiming or invalid element is rejected, an all-legacy array is
*   legacy traffic unchanged, and a single-element array is still an array.
*
* The classifier returns plain values (it never throws and never touches a
* transport): a routing outcome (`legacy`/`modern`) or a ladder rejection
* carrying the JSON-RPC error to emit and the HTTP status to emit it with.
* Legacy routing outcomes deliberately carry NO `MessageClassification` —
* legacy and hand-wired traffic is never classified, which keeps its
* dispatch behavior byte-identical to today's.
*
* Error codes for the modern-path rejection cells follow the published
* conformance suite (and the spec text it asserts):
*
* - A header/body cross-check mismatch (the `MCP-Protocol-Version` header
*   disagreeing with the body, or the `Mcp-Method` header disagreeing with the
*   body method) is rejected with `-32020` (`HeaderMismatch`) on HTTP 400.
* - A request whose protocol-version header names a modern revision but whose
*   body carries no `_meta` envelope claim — including an envelope present but
*   missing the required protocol-version key — is rejected with `-32602`
*   (invalid params) naming the missing key(s), on HTTP 400.
*
* Should a future spec revision or conformance release change these
* assignments, the affected cells are re-derived against that release; the
* `settled` flag on {@linkcode InboundLadderRejection} stays available to mark
* a cell provisional again while such a change is in flight.
*/
/**
* The error code emitted for header/body cross-check mismatches: the
* `MCP-Protocol-Version` header disagreeing with the body's envelope claim (or
* with the body's classification), and the `Mcp-Method` header disagreeing
* with the body method.
*
* `-32020` is the draft schema's `HEADER_MISMATCH` constant (the SEP-2243
* `HeaderMismatch` code; the spec requires HTTP 400 for it), as also asserted
* by the published conformance suite for header-validation failures. It has no
* {@linkcode ProtocolErrorCode} member because it is not part of the 2025-era
* wire vocabulary; the validation ladder is its only emitter.
*/
const HEADER_MISMATCH_ERROR_CODE = -32020;
/**
* The inbound validation ladder, expressed as data rather than control flow.
*
* The edge rungs are evaluated by {@linkcode classifyInboundRequest}; the
* dispatch rungs are evaluated by the protocol layer once the classified
* message is injected into a per-request server instance (the era registry
* gate, the envelope requiredness check, and per-method params validation).
* The client-capability rung is evaluated by the HTTP entry itself,
* pre-dispatch, on the validated envelope the classifier produced — see that
* rung's rationale for the ordering caveat. The order is the precedence: a
* request that fails several rungs is answered by the earliest one.
*/
const INBOUND_VALIDATION_LADDER = [
	{
		rung: "http-method",
		order: 1,
		evaluatedAt: "edge",
		codes: [-32e3],
		conformance: [],
		rationale: "The modern era is POST-only; GET/DELETE are body-less 2025-era session operations and are method-routed to legacy serving (405 when legacy serving is not configured), before any body is read."
	},
	{
		rung: "jsonrpc-shape",
		order: 2,
		evaluatedAt: "edge",
		codes: [ProtocolErrorCode.InvalidRequest],
		conformance: ["server-stateless"],
		rationale: "The body must be a JSON-RPC request or notification: posted responses and batch arrays containing a modern or invalid element are rejected before classification (element-wise batch rule); all-legacy arrays stay legacy traffic."
	},
	{
		rung: "era-classification",
		order: 3,
		evaluatedAt: "edge",
		codes: [HEADER_MISMATCH_ERROR_CODE, ProtocolErrorCode.UnsupportedProtocolVersion],
		conformance: [
			"server-stateless",
			"http-header-validation",
			"http-custom-header-server-validation"
		],
		rationale: "Body-primary era classification with the protocol-version header as a cross-check; a header/body disagreement is rejected with -32020 (HeaderMismatch), and an envelope-less request on a modern-only endpoint is answered with the unsupported-protocol-version error naming the supported revisions."
	},
	{
		rung: "envelope",
		order: 4,
		evaluatedAt: "edge",
		codes: [ProtocolErrorCode.InvalidParams],
		conformance: ["server-stateless"],
		rationale: "A present envelope claim with a malformed envelope — and a missing envelope on a request whose protocol-version header names a modern revision — is an invalid-params rejection naming the offending or missing key(s); never a silent fall back to legacy handling. This is the only place an invalid-params rejection maps to HTTP 400."
	},
	{
		rung: "method-registry",
		order: 5,
		evaluatedAt: "dispatch",
		codes: [ProtocolErrorCode.MethodNotFound],
		conformance: ["server-stateless"],
		rationale: "Method existence outranks parameter validity: a method absent from the negotiated revision’s registry (or with no handler installed) answers method-not-found before params or capabilities are looked at."
	},
	{
		rung: "request-params",
		order: 6,
		evaluatedAt: "dispatch",
		codes: [ProtocolErrorCode.InvalidParams],
		conformance: [],
		rationale: "Per-method params validation; emitted in-band by the dispatch layer (HTTP 200), never via the ladder status table."
	},
	{
		rung: "standard-header-validation",
		order: 7,
		evaluatedAt: "pre-dispatch",
		codes: [HEADER_MISMATCH_ERROR_CODE],
		conformance: ["http-header-validation"],
		rationale: "SEP-2243 standard `Mcp-Method` / `Mcp-Name` headers — presence, sentinel decoding, and `Mcp-Name` ↔ body cross-check — are validated by the HTTP entry on a modern-classified request after the supported-revision gate and before dispatch. The classifier’s own header-mismatch cells (protocol-version, `Mcp-Method` mismatch) stay on the edge `era-classification` rung; this rung carries the entry-layer presence/`Mcp-Name` half. Evaluated before the capability gate, the factory call, and the `Mcp-Param-*` rung so a request that fails several rungs is answered by the standard-header rung first. The documented order (after method-registry 5 and request-params 6) is NOT the observed precedence: serveModern evaluates this rung immediately after the supported-revision gate, so a request that also fails a dispatch rung is answered here before the dispatch rungs (5–6) are consulted."
	},
	{
		rung: "client-capabilities",
		order: 8,
		evaluatedAt: "pre-dispatch",
		codes: [ProtocolErrorCode.MissingRequiredClientCapability],
		conformance: ["server-stateless"],
		rationale: "The capability requirement is checked by the HTTP entry, pre-dispatch, against the validated envelope the classifier produced — pinning the spec-mandated HTTP 400 independently of how dispatch- and handler-produced errors are mapped. The documented order (after method resolution and params validation) is preserved observably only while the requirement table is empty: once a served method gains a requirement entry, a request that is missing the capability and would also fail a dispatch rung is answered by this gate first, so the entry must consult the method registry before the gate if the documented precedence is to stay observable."
	},
	{
		rung: "param-header-validation",
		order: 9,
		evaluatedAt: "pre-dispatch",
		codes: [HEADER_MISMATCH_ERROR_CODE],
		conformance: ["http-custom-header-server-validation"],
		rationale: "SEP-2243 `Mcp-Param-*` headers are validated against the named tool’s `x-mcp-header` declarations and the body `arguments` after the tool registry is known and before dispatch reaches the handler; a missing/disagreeing/malformed header is rejected 400 / -32020 with the same shape as the standard-header cross-checks. The documented order (after method resolution and params validation) is preserved observably only when the body `arguments` would otherwise validate: the check runs pre-dispatch, so a `tools/call` that fails BOTH this rung and a dispatch-time rung (e.g. order-6 `request-params`, -32602) is answered by this gate first with 400 / -32020, not by the earlier-ordered rung."
	}
];
/**
* HTTP status for ladder-originated JSON-RPC error codes.
*
* Keyed on origin, not on the bare code: this table only applies to errors
* the ladder (or a pre-handler protocol gate) produced. Errors produced by
* request handlers — whatever their code — stay in-band on HTTP 200, and are
* never mapped to an HTTP status by this table; in particular `-32603` and
* domain-specific codes never become a blanket 500.
*
* `-32602` (invalid params) deliberately has NO entry: the only invalid-params
* rejection that maps to HTTP 400 is the classifier's own envelope rung
* short-circuit, which carries its HTTP status directly. A dispatch- or
* handler-produced invalid-params error is always in-band.
*/
const LADDER_ERROR_HTTP_STATUS = {
	[ProtocolErrorCode.ParseError]: 400,
	[ProtocolErrorCode.InvalidRequest]: 400,
	[ProtocolErrorCode.MethodNotFound]: 404,
	[ProtocolErrorCode.UnsupportedProtocolVersion]: 400,
	[ProtocolErrorCode.MissingRequiredClientCapability]: 400,
	[HEADER_MISMATCH_ERROR_CODE]: 400
};
/**
* The HTTP status to answer a JSON-RPC error with, keyed on the error's
* origin. `in-band` errors (anything produced by a request handler) are
* always HTTP 200 — the JSON-RPC error response is the payload, not an HTTP
* failure. `ladder` errors map through {@linkcode LADDER_ERROR_HTTP_STATUS}.
*/
function httpStatusForErrorCode(code, origin) {
	if (origin === "in-band") return 200;
	return LADDER_ERROR_HTTP_STATUS[code] ?? 400;
}
function rejection(rung, cell, httpStatus, error, settled) {
	return {
		kind: "reject",
		rung,
		cell,
		httpStatus,
		code: error.code,
		message: error.message,
		...error.data !== void 0 && { data: error.data },
		settled
	};
}
function crossCheckMismatch(cell, header, body, rung = "era-classification") {
	return rejection(rung, cell, 400, new ProtocolError(HEADER_MISMATCH_ERROR_CODE, `Bad Request: the request headers and body disagree: ${body}`, { mismatch: {
		header,
		body
	} }), true);
}
/**
* The methods whose body carries a `params.name` / `params.uri` value the
* `Mcp-Name` header must mirror, and which body field supplies it (SEP-2243
* § Standard Request Headers, `Required For` column).
*/
const MCP_NAME_HEADER_SOURCE = {
	"tools/call": "name",
	"prompts/get": "name",
	"resources/read": "uri"
};
/**
* SEP-2243 standard-header server-side validation, evaluated by the HTTP
* entry on a modern-classified request immediately after
* {@linkcode classifyInboundRequest} returns a modern route.
*
* Returns the `-32020` (`HeaderMismatch`) ladder rejection (HTTP `400`,
* `standard-header-validation` rung — the same shape
* {@linkcode classifyInboundRequest} already emits on the edge
* `era-classification` rung for the `MCP-Protocol-Version` and
* `Mcp-Method` *mismatch* cells) when:
*
* - the required `Mcp-Method` header is absent;
* - the required `Mcp-Name` header is absent on a `tools/call`,
*   `prompts/get`, or `resources/read` request whose body carries the
*   `params.name` / `params.uri` value the header mirrors;
* - the `Mcp-Name` header carries an invalid `=?base64?…?=` sentinel; or
* - the (decoded) `Mcp-Name` value disagrees with the body's
*   `params.name` / `params.uri`.
*
* Returns `undefined` (pass) for notifications (the spec table reads
* "All requests"), for methods that have no `Mcp-Name` source, and when the
* headers agree with the body. Never enforced on legacy traffic — the entry
* only calls this on a modern route.
*
* Kept separate from {@linkcode classifyInboundRequest} so that a body-only
* call to the classifier (no headers passed) keeps routing a modern request
* unchanged: the classifier remains a pure body-primary router, and this
* function is the presence/`Mcp-Name` half of the standard-header rung the
* entry layers on top.
*/
function validateStandardRequestHeaders(request, route) {
	if (route.messageKind !== "request") return;
	const method = route.message.method;
	if (request.mcpMethodHeader === void 0) return crossCheckMismatch("method-header-missing", "(missing)", `the body names method ${method} but the required Mcp-Method header is absent`, "standard-header-validation");
	const sourceField = Object.hasOwn(MCP_NAME_HEADER_SOURCE, method) ? MCP_NAME_HEADER_SOURCE[method] : void 0;
	if (sourceField === void 0) return;
	const sourceValue = route.message.params?.[sourceField];
	const bodyValue = typeof sourceValue === "string" ? sourceValue : void 0;
	if (request.mcpNameHeader === void 0) {
		if (bodyValue === void 0) return;
		return crossCheckMismatch("name-header-missing", "(missing)", `the body carries params.${sourceField}="${bodyValue}" but the required Mcp-Name header is absent`, "standard-header-validation");
	}
	const decoded = decodeMcpParamValue(request.mcpNameHeader);
	if (decoded === void 0) return crossCheckMismatch("name-header-invalid-encoding", request.mcpNameHeader, "the Mcp-Name header carries an invalid Base64 sentinel value", "standard-header-validation");
	if (bodyValue !== void 0 && decoded !== bodyValue) return crossCheckMismatch("name-header-mismatch", request.mcpNameHeader, `the body carries params.${sourceField}="${bodyValue}" but the Mcp-Name header names "${decoded}"`, "standard-header-validation");
}
function isPlainObject$2(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function classificationForClaim(claimedVersion) {
	if (claimedVersion === void 0) return { era: "modern" };
	return {
		era: isModernProtocolVersion(claimedVersion) ? "modern" : "legacy",
		revision: claimedVersion
	};
}
/**
* Whether a request's params carry a per-request envelope claim that is both
* well-formed and names a modern protocol revision.
*
* Used by the `initialize` precedence rule: only such a claim overrides the
* `initialize` ⇒ legacy-handshake classification — a request carrying a valid
* modern envelope is a modern request regardless of its method name, and the
* modern era then answers `initialize` exactly like any other method it does
* not define (method-not-found). A malformed claim, or one naming a pre-2026
* revision, keeps the legacy-handshake routing unchanged.
*
* Exported on the core internal barrel for the stdio serving entry, which
* applies the same precedence rule to a connection's opening message; not
* public API.
*/
function carriesValidModernEnvelopeClaim(params) {
	if (!hasEnvelopeClaim(params)) return false;
	const claimedVersion = envelopeClaimVersion(params);
	if (claimedVersion === void 0 || !isModernProtocolVersion(claimedVersion)) return false;
	const meta = requestMetaOf(params);
	return meta !== void 0 && validateEnvelopeMeta(meta).length === 0;
}
function classifyBatch(body) {
	if (body.length === 0) return rejection("jsonrpc-shape", "empty-batch", 400, new ProtocolError(ProtocolErrorCode.InvalidRequest, "Bad Request: empty JSON-RPC batch"), true);
	for (const element of body) {
		if (hasEnvelopeClaim(isPlainObject$2(element) ? element["params"] : void 0)) return rejection("jsonrpc-shape", "batch-with-modern-element", 400, new ProtocolError(ProtocolErrorCode.InvalidRequest, "Bad Request: JSON-RPC batches may not contain requests for protocol revision 2026-07-28 or later"), true);
		if (!(isJSONRPCRequest(element) || isJSONRPCNotification(element) || isJSONRPCResultResponse(element) || isJSONRPCErrorResponse(element))) return rejection("jsonrpc-shape", "batch-with-invalid-element", 400, new ProtocolError(ProtocolErrorCode.InvalidRequest, "Bad Request: JSON-RPC batch contains an invalid message"), true);
	}
	return {
		kind: "legacy",
		reason: "batch"
	};
}
function classifyRequestBody(request, body) {
	const params = body.params;
	const method = body.method;
	const headerVersion = request.protocolVersionHeader;
	const headerNamesModern = headerVersion !== void 0 && isModernProtocolVersion(headerVersion);
	if (method === "initialize" && !carriesValidModernEnvelopeClaim(params)) {
		if (headerNamesModern) return crossCheckMismatch("initialize-with-modern-header", headerVersion, "an initialize request (legacy handshake) was sent with a modern MCP-Protocol-Version header");
		const requestedVersion = isPlainObject$2(params) && typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : void 0;
		return {
			kind: "legacy",
			reason: "initialize",
			...requestedVersion !== void 0 && { requestedVersion }
		};
	}
	if (hasEnvelopeClaim(params)) {
		const meta = requestMetaOf(params);
		const firstIssue = (meta === void 0 ? [] : validateEnvelopeMeta(meta))[0];
		if (firstIssue !== void 0) return rejection("envelope", "envelope-invalid", 400, new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid _meta envelope for protocol revision 2026-07-28: ${firstIssue.key}: ${firstIssue.problem}`, { envelope: firstIssue }), true);
		const claimedVersion = envelopeClaimVersion(params);
		if (headerVersion !== void 0 && claimedVersion !== void 0 && headerVersion !== claimedVersion) return crossCheckMismatch("header-body-version-mismatch", headerVersion, `the body envelope names protocol version ${claimedVersion} but the MCP-Protocol-Version header names ${headerVersion}`);
		if (request.mcpMethodHeader !== void 0 && request.mcpMethodHeader !== method) return crossCheckMismatch("method-header-mismatch", request.mcpMethodHeader, `the body names method ${method} but the Mcp-Method header names ${request.mcpMethodHeader}`);
		return {
			kind: "modern",
			messageKind: "request",
			message: body,
			classification: classificationForClaim(claimedVersion)
		};
	}
	if (headerNamesModern) {
		const meta = requestMetaOf(params);
		const missingFromEnvelope = validateEnvelopeMeta(meta ?? {}).filter((issue) => issue.problem === "missing").map((issue) => issue.key);
		const missing = meta === void 0 ? ["_meta"] : missingFromEnvelope.length > 0 ? missingFromEnvelope : [PROTOCOL_VERSION_META_KEY];
		return rejection("envelope", "modern-header-without-claim", 400, new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid params: the MCP-Protocol-Version header names protocol revision ${headerVersion}, but the request is missing the required per-request envelope key(s): ${missing.join(", ")}`, { envelope: { missing } }), true);
	}
	return {
		kind: "legacy",
		reason: "no-claim",
		...headerVersion !== void 0 && { requestedVersion: headerVersion }
	};
}
function classifyNotificationBody(request, body) {
	const params = body.params;
	const method = body.method;
	const headerVersion = request.protocolVersionHeader;
	const headerNamesModern = headerVersion !== void 0 && isModernProtocolVersion(headerVersion);
	if (hasEnvelopeClaim(params)) {
		const claimedVersion = envelopeClaimVersion(params);
		if (claimedVersion === void 0) {
			const meta = requestMetaOf(params);
			const claimIssue = (meta === void 0 ? [] : validateEnvelopeMeta(meta)).find((issue) => issue.key === PROTOCOL_VERSION_META_KEY) ?? {
				key: PROTOCOL_VERSION_META_KEY,
				problem: "expected a protocol version string"
			};
			return rejection("envelope", "notification-envelope-invalid", 400, new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid _meta envelope for protocol revision 2026-07-28: ${claimIssue.key}: ${claimIssue.problem}`, { envelope: claimIssue }), true);
		}
		if (headerVersion !== void 0 && headerVersion !== claimedVersion) return crossCheckMismatch("notification-header-body-version-mismatch", headerVersion, `the notification envelope names protocol version ${claimedVersion} but the MCP-Protocol-Version header names ${headerVersion}`);
		const classification = classificationForClaim(claimedVersion);
		if (classification.era === "modern" && request.mcpMethodHeader !== void 0 && request.mcpMethodHeader !== method) return crossCheckMismatch("notification-method-header-mismatch", request.mcpMethodHeader, `the notification body names method ${method} but the Mcp-Method header names ${request.mcpMethodHeader}`);
		return {
			kind: "modern",
			messageKind: "notification",
			message: body,
			classification
		};
	}
	if (headerNamesModern) {
		if (request.mcpMethodHeader !== void 0 && request.mcpMethodHeader !== method) return crossCheckMismatch("notification-method-header-mismatch", request.mcpMethodHeader, `the notification body names method ${method} but the Mcp-Method header names ${request.mcpMethodHeader}`);
		return {
			kind: "modern",
			messageKind: "notification",
			message: body,
			classification: {
				era: "modern",
				revision: headerVersion
			}
		};
	}
	return {
		kind: "legacy",
		reason: "notification",
		...headerVersion !== void 0 && { requestedVersion: headerVersion }
	};
}
/**
* Classifies one inbound HTTP request for dual-era serving.
*
* The body-primary predicate, evaluated once at the entry boundary: see the
* module documentation for the rules. Returns a routing outcome (`legacy` or
* `modern`) or a ladder rejection; it never throws.
*/
function classifyInboundRequest(request) {
	if (request.httpMethod.toUpperCase() !== "POST") return {
		kind: "legacy",
		reason: "http-method"
	};
	const body = request.body;
	if (Array.isArray(body)) return classifyBatch(body);
	if (isJSONRPCResultResponse(body) || isJSONRPCErrorResponse(body)) return {
		kind: "legacy",
		reason: "response"
	};
	if (isPlainObject$2(body) && isJSONRPCRequest(body)) return classifyRequestBody(request, body);
	if (isPlainObject$2(body) && isJSONRPCNotification(body)) return classifyNotificationBody(request, body);
	return rejection("jsonrpc-shape", "invalid-json-rpc-body", 400, new ProtocolError(ProtocolErrorCode.InvalidRequest, "Bad Request: the request body is not a valid JSON-RPC message"), true);
}
/**
* The rejection a modern-only endpoint (no legacy serving configured)
* answers a legacy-classified request with.
*
* - Envelope-less requests (including `initialize`) are answered with the
*   unsupported-protocol-version error carrying the endpoint's supported
*   versions and echoing the version the request named (when it named one —
*   `requested` is omitted rather than fabricated when the request named no
*   version at all), so a legacy client can discover what the endpoint serves
*   from the error alone.
* - Posted responses and batch arrays are invalid requests on the modern era.
* - Non-`POST` methods are not allowed.
* - Legacy-classified notifications return `undefined`: the caller answers
*   202 with no body and does not dispatch the notification (accept-and-drop).
*/
function modernOnlyStrictRejection(route, supportedVersions) {
	switch (route.reason) {
		case "http-method": return rejection("http-method", "modern-only-method-not-allowed", 405, new ProtocolError(-32e3, "Method not allowed."), true);
		case "batch": return rejection("jsonrpc-shape", "modern-only-batch-not-supported", 400, new ProtocolError(ProtocolErrorCode.InvalidRequest, "Bad Request: JSON-RPC batches are not supported by this endpoint"), true);
		case "response": return rejection("jsonrpc-shape", "modern-only-response-post", 400, new ProtocolError(ProtocolErrorCode.InvalidRequest, "Bad Request: JSON-RPC responses cannot be posted to this endpoint"), true);
		case "notification": return;
		case "initialize":
		case "no-claim": {
			const requested = route.requestedVersion;
			return rejection("era-classification", "modern-only-missing-envelope", 400, requested === void 0 ? new ProtocolError(ProtocolErrorCode.UnsupportedProtocolVersion, "Unsupported protocol version: the request did not name a protocol version", { supported: [...supportedVersions] }) : new UnsupportedProtocolVersionError({
				supported: [...supportedVersions],
				requested
			}), true);
		}
	}
}

//#endregion
//#region ../core-internal/src/shared/inputRequired.ts
function buildInputRequired(spec) {
	const hasInputRequests = spec.inputRequests !== void 0 && Object.keys(spec.inputRequests).length > 0;
	const hasRequestState = typeof spec.requestState === "string";
	if (!hasInputRequests && !hasRequestState) throw new TypeError("inputRequired() requires at least one of inputRequests (with at least one entry) or requestState (spec: every InputRequiredResult MUST include at least one of the two)");
	return {
		resultType: "input_required",
		...spec.inputRequests !== void 0 && { inputRequests: spec.inputRequests },
		...spec.requestState !== void 0 && { requestState: spec.requestState }
	};
}
/**
* Builder for the input-required return value of multi-round-trip handlers,
* with per-kind constructors for the embedded requests
* (`inputRequired.elicit`, `inputRequired.elicitUrl`,
* `inputRequired.createMessage`, `inputRequired.listRoots`).
*
* @example Write-once tool requesting confirmation
* ```ts
* server.registerTool('deploy', { inputSchema: z.object({ env: z.string() }) }, async ({ env }, ctx) => {
*     const confirmed = acceptedContent<{ confirm: boolean }>(ctx.mcpReq.inputResponses, 'confirm');
*     if (!confirmed) {
*         return inputRequired({
*             inputRequests: {
*                 confirm: inputRequired.elicit({
*                     message: `Deploy to ${env}?`,
*                     requestedSchema: { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] }
*                 })
*             }
*         });
*     }
*     return { content: [{ type: 'text', text: `deployed to ${env}` }] };
* });
* ```
*/
const inputRequired = Object.assign(buildInputRequired, {
	elicit(params) {
		return {
			method: "elicitation/create",
			params: {
				...params,
				mode: "form"
			}
		};
	},
	elicitUrl(params) {
		return {
			method: "elicitation/create",
			params: {
				...params,
				mode: "url"
			}
		};
	},
	createMessage(params) {
		return {
			method: "sampling/createMessage",
			params
		};
	},
	listRoots() {
		return { method: "roots/list" };
	}
});
function acceptedContent(responses, key, schema) {
	const view = inputResponse(responses, key);
	if (view.kind !== "elicit" || view.action !== "accept" || view.content === void 0) return void 0;
	if (schema === void 0) return view.content;
	const outcome = schema["~standard"].validate(view.content);
	if (outcome instanceof Promise) throw new TypeError("acceptedContent(responses, key, schema) requires a synchronously-validating schema");
	return outcome.issues === void 0 ? outcome.value : void 0;
}
/**
* Reads one entry of a retried request's `inputResponses`
* (`ctx.mcpReq.inputResponses`) as a discriminated view, covering
* decline/cancel detection and the non-elicitation response kinds that
* {@linkcode acceptedContent} does not surface.
*
* The values arrive from the client and are not re-validated here — treat
* them as untrusted input (validate elicitation content with the
* schema-aware {@linkcode acceptedContent} overload where it matters).
*/
function inputResponse(responses, key) {
	if (responses === void 0 || typeof responses !== "object" || responses === null) return { kind: "missing" };
	const entry = responses[key];
	if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return { kind: "missing" };
	const candidate = entry;
	if (candidate["action"] === "accept" || candidate["action"] === "decline" || candidate["action"] === "cancel") {
		const content = candidate["content"];
		return {
			kind: "elicit",
			action: candidate["action"],
			...content !== null && typeof content === "object" && !Array.isArray(content) && { content }
		};
	}
	if (Array.isArray(candidate["roots"])) return {
		kind: "roots",
		roots: candidate["roots"]
	};
	if (typeof candidate["role"] === "string" && candidate["content"] !== void 0) return {
		kind: "sampling",
		result: candidate
	};
	return { kind: "missing" };
}

//#endregion
//#region ../core-internal/src/shared/inputRequiredDriver.ts
/**
* The multi-round-trip auto-fulfilment driver (protocol revision 2026-07-28).
*
* When a request to one of the multi-round-trip methods comes back as
* `input_required`, the driver fulfils the embedded input requests by
* dispatching them to the client's already-registered handlers (elicitation,
* sampling, roots — one generic engine, no per-feature API), then retries the
* original request with the collected `inputResponses` and a byte-exact echo
* of `requestState`, on a fresh request id, until the server returns a
* complete result or the round cap is exhausted.
*
* The driver is a LAYER OVER THE MANUAL PATH: each retry is issued with the
* same primitive a manual caller uses (`allowInputRequired` semantics — the
* retry hands back the next `input_required` payload instead of recursing),
* so the loop, the cap, and the pacing live in one place and disabling
* auto-fulfilment (`inputRequired.autoFulfill: false`) simply skips this
* module. Timeouts ride the EXISTING knobs: the per-leg `timeout` applies to
* every wire leg unchanged, and `maxTotalTimeout` bounds the whole flow by
* shrinking the budget passed to each leg — no new timer system.
*/
/**
* Fixed pacing applied before retrying a requestState-only (load-shedding)
* leg — a leg that carries no embedded input requests, so nothing slows the
* loop down naturally. Counted in the same round cap.
*/
const REQUEST_STATE_ONLY_LEG_PACING_MS = 250;
/**
* The message both multi-round-trip loops emit when the round cap is
* exhausted — the client driver as a typed error, the server-side legacy
* shim as its per-family failure. One formatter so the texts cannot drift
* (hosts and models read the tool-result copy verbatim).
*/
function inputRequiredRoundsExceededMessage(method, maxRounds) {
	return `Multi-round-trip request '${method}' still required input after ${maxRounds} rounds (inputRequired.maxRounds)`;
}
/**
* Abortable delay: resolves after `ms`, or rejects with the signal's reason
* (wrapped in an `SdkError` when it isn't already one) if the signal aborts
* first. Aborting after resolution is a no-op. Shared with the server-side
* legacy shim (the pacing semantics must match per era).
*/
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason instanceof SdkError ? signal.reason : new SdkError(SdkErrorCode.RequestTimeout, String(signal.reason)));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason instanceof SdkError ? signal.reason : new SdkError(SdkErrorCode.RequestTimeout, String(signal?.reason)));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* A per-round abort linked to the caller's signal: the embedded sibling
* dispatches share it, so the first failure (or a caller abort) cancels the
* others instead of leaving them running. Shared with the server-side legacy
* shim (the abort-linkage semantics must match per era).
*/
function linkedRoundAbort(outer) {
	const controller = new AbortController();
	const onOuterAbort = () => controller.abort(outer?.reason);
	outer?.addEventListener("abort", onOuterAbort, { once: true });
	if (outer?.aborted) controller.abort(outer.reason);
	return {
		signal: controller.signal,
		abort: (reason) => controller.abort(reason),
		dispose: () => outer?.removeEventListener("abort", onOuterAbort)
	};
}

//#endregion
//#region ../core-internal/src/types/specTypeSchema.ts
/**
* Explicit allowlist of protocol Zod schemas that correspond to a public spec type in `types.ts`.
*
* This intentionally excludes internal helper schemas exported from `schemas.ts` that have no
* matching public type (e.g. `ListChangedOptionsBaseSchema`, `BaseRequestParamsSchema`,
* `NotificationsParamsSchema`, `ClientTasksCapabilitySchema`, `ServerTasksCapabilitySchema`).
* Keeping the list explicit means new public spec types must be added here deliberately, and
* internals never leak into `SpecTypeName`.
*
* `ResourceTemplateSchema` is included; its public type is exported as `ResourceTemplateType`
* (the bare name collides with the server package's `ResourceTemplate` class), so
* `SpecTypes['ResourceTemplate']` is structurally equal to `ResourceTemplateType` rather than to
* a type literally named `ResourceTemplate`.
*/
const SPEC_SCHEMA_KEYS = [
	"AnnotationsSchema",
	"AudioContentSchema",
	"BaseMetadataSchema",
	"BlobResourceContentsSchema",
	"BooleanSchemaSchema",
	"CallToolRequestSchema",
	"CallToolRequestParamsSchema",
	"CallToolResultSchema",
	"CancelledNotificationSchema",
	"CancelledNotificationParamsSchema",
	"CancelTaskRequestSchema",
	"CancelTaskResultSchema",
	"ClientCapabilitiesSchema",
	"ClientNotificationSchema",
	"ClientRequestSchema",
	"ClientResultSchema",
	"CompatibilityCallToolResultSchema",
	"CompleteRequestSchema",
	"CompleteRequestParamsSchema",
	"CompleteResultSchema",
	"ContentBlockSchema",
	"CreateMessageRequestSchema",
	"CreateMessageRequestParamsSchema",
	"CreateMessageResultSchema",
	"CreateMessageResultWithToolsSchema",
	"CreateTaskResultSchema",
	"CursorSchema",
	"DiscoverRequestSchema",
	"DiscoverResultSchema",
	"ElicitationCompleteNotificationSchema",
	"ElicitationCompleteNotificationParamsSchema",
	"ElicitRequestSchema",
	"ElicitRequestFormParamsSchema",
	"ElicitRequestParamsSchema",
	"ElicitRequestURLParamsSchema",
	"ElicitResultSchema",
	"EmbeddedResourceSchema",
	"EmptyResultSchema",
	"EnumSchemaSchema",
	"GetPromptRequestSchema",
	"GetPromptRequestParamsSchema",
	"GetPromptResultSchema",
	"GetTaskPayloadRequestSchema",
	"GetTaskPayloadResultSchema",
	"GetTaskRequestSchema",
	"GetTaskResultSchema",
	"IconSchema",
	"IconsSchema",
	"ImageContentSchema",
	"ImplementationSchema",
	"InitializedNotificationSchema",
	"InitializeRequestSchema",
	"InitializeRequestParamsSchema",
	"InitializeResultSchema",
	"JSONArraySchema",
	"JSONObjectSchema",
	"JSONRPCErrorResponseSchema",
	"JSONRPCMessageSchema",
	"JSONRPCNotificationSchema",
	"JSONRPCRequestSchema",
	"JSONRPCResponseSchema",
	"JSONRPCResultResponseSchema",
	"JSONValueSchema",
	"LegacyTitledEnumSchemaSchema",
	"ListPromptsRequestSchema",
	"ListPromptsResultSchema",
	"ListResourcesRequestSchema",
	"ListResourcesResultSchema",
	"ListResourceTemplatesRequestSchema",
	"ListResourceTemplatesResultSchema",
	"ListRootsRequestSchema",
	"ListRootsResultSchema",
	"ListTasksRequestSchema",
	"ListTasksResultSchema",
	"ListToolsRequestSchema",
	"ListToolsResultSchema",
	"LoggingLevelSchema",
	"LoggingMessageNotificationSchema",
	"LoggingMessageNotificationParamsSchema",
	"ModelHintSchema",
	"ModelPreferencesSchema",
	"MultiSelectEnumSchemaSchema",
	"NotificationSchema",
	"NumberSchemaSchema",
	"PaginatedRequestSchema",
	"PaginatedRequestParamsSchema",
	"PaginatedResultSchema",
	"PingRequestSchema",
	"PrimitiveSchemaDefinitionSchema",
	"ProgressSchema",
	"ProgressNotificationSchema",
	"ProgressNotificationParamsSchema",
	"ProgressTokenSchema",
	"PromptSchema",
	"PromptArgumentSchema",
	"PromptListChangedNotificationSchema",
	"PromptMessageSchema",
	"PromptReferenceSchema",
	"ReadResourceRequestSchema",
	"ReadResourceRequestParamsSchema",
	"ReadResourceResultSchema",
	"RelatedTaskMetadataSchema",
	"RequestSchema",
	"RequestIdSchema",
	"RequestMetaSchema",
	"ResourceSchema",
	"ResourceContentsSchema",
	"ResourceLinkSchema",
	"ResourceListChangedNotificationSchema",
	"ResourceRequestParamsSchema",
	"ResourceTemplateSchema",
	"ResourceTemplateReferenceSchema",
	"ResourceUpdatedNotificationSchema",
	"ResourceUpdatedNotificationParamsSchema",
	"ResultSchema",
	"RoleSchema",
	"RootSchema",
	"RootsListChangedNotificationSchema",
	"SamplingContentSchema",
	"SamplingMessageSchema",
	"SamplingMessageContentBlockSchema",
	"ServerCapabilitiesSchema",
	"ServerNotificationSchema",
	"ServerRequestSchema",
	"ServerResultSchema",
	"SetLevelRequestSchema",
	"SetLevelRequestParamsSchema",
	"SingleSelectEnumSchemaSchema",
	"StringSchemaSchema",
	"SubscribeRequestSchema",
	"SubscribeRequestParamsSchema",
	"SubscriptionFilterSchema",
	"SubscriptionsAcknowledgedNotificationSchema",
	"SubscriptionsAcknowledgedNotificationParamsSchema",
	"SubscriptionsListenRequestSchema",
	"SubscriptionsListenRequestParamsSchema",
	"SubscriptionsListenResultSchema",
	"SubscriptionsListenResultMetaSchema",
	"TaskAugmentedRequestParamsSchema",
	"TaskCreationParamsSchema",
	"TaskMetadataSchema",
	"TaskSchema",
	"TaskStatusSchema",
	"TaskStatusNotificationSchema",
	"TaskStatusNotificationParamsSchema",
	"TextContentSchema",
	"TextResourceContentsSchema",
	"TitledMultiSelectEnumSchemaSchema",
	"TitledSingleSelectEnumSchemaSchema",
	"ToolSchema",
	"ToolAnnotationsSchema",
	"ToolChoiceSchema",
	"ToolExecutionSchema",
	"ToolListChangedNotificationSchema",
	"ToolResultContentSchema",
	"ToolUseContentSchema",
	"UnsubscribeRequestSchema",
	"UnsubscribeRequestParamsSchema",
	"UntitledMultiSelectEnumSchemaSchema",
	"UntitledSingleSelectEnumSchemaSchema"
];
const authSchemas = {
	IdJagTokenExchangeResponseSchema,
	OAuthClientInformationFullSchema,
	OAuthClientInformationSchema,
	OAuthClientMetadataSchema,
	OAuthClientRegistrationErrorSchema,
	OAuthErrorResponseSchema,
	OAuthMetadataSchema,
	OAuthProtectedResourceMetadataSchema,
	OAuthTokenRevocationRequestSchema,
	OAuthTokensSchema,
	OpenIdProviderDiscoveryMetadataSchema,
	OpenIdProviderMetadataSchema
};
const _specTypeSchemas = {};
const _isSpecType = {};
function register(key, schema) {
	const name = key.slice(0, -6);
	_specTypeSchemas[name] = schema;
	_isSpecType[name] = (v) => schema.safeParse(v).success;
}
for (const key of SPEC_SCHEMA_KEYS) register(key, schemas_exports[key]);
for (const [key, schema] of Object.entries(authSchemas)) register(key, schema);
/**
* Runtime validators for every MCP spec type, keyed by type name.
*
* Use this when you need to validate a spec-defined shape at a boundary the SDK does not own, for
* example an extension's custom-method payload that embeds a `CallToolResult`, or a value read from
* storage that should be a `Tool`.
*
* Each entry implements the Standard Schema interface, so it composes with any
* Standard-Schema-aware library. For a simple boolean check, use {@linkcode isSpecType} instead.
*
* @example
* ```ts source="./specTypeSchema.examples.ts#specTypeSchemas_basicUsage"
* const result = specTypeSchemas.CallToolResult['~standard'].validate(untrusted);
* if (result.issues === undefined) {
*     // result.value is CallToolResult
* }
* ```
*/
const specTypeSchemas = Object.freeze(_specTypeSchemas);
/**
* Type predicates for every MCP spec type, keyed by type name.
*
* Returns `true` if the value satisfies the schema's input type (`z.input<>`, before defaults and
* transforms are applied), and narrows to that input type. For schemas with `.default()` or
* `.preprocess()`, this may accept values that do not structurally match the named output type;
* for example `isSpecType.CallToolResult({})` is `true` because `content` has a default. Use
* `specTypeSchemas.X['~standard'].validate(value)` when you need the validated output value.
*
* Each guard is a standalone function, so it can be passed directly as a callback.
*
* @example
* ```ts source="./specTypeSchema.examples.ts#isSpecType_basicUsage"
* if (isSpecType.ContentBlock(value)) {
*     // value is ContentBlock
* }
*
* const blocks = mixed.filter(isSpecType.ContentBlock);
* ```
*/
const isSpecType = Object.freeze(_isSpecType);

//#endregion
//#region ../core-internal/src/util/standardSchema.ts
/**
* Standard Schema utilities for user-provided schemas.
* Supports Zod v4, Valibot, ArkType, and other Standard Schema implementations.
* @see https://standardschema.dev
*/
function isStandardSchema(schema) {
	if (schema == null) return false;
	const schemaType = typeof schema;
	if (schemaType !== "object" && schemaType !== "function") return false;
	if (!("~standard" in schema)) return false;
	return typeof schema["~standard"]?.validate === "function";
}
let warnedZodFallback = false;
/**
* Converts a StandardSchema to JSON Schema for use as an MCP tool/prompt schema.
*
* MCP requires `type: "object"` at the root of tool `inputSchema` and prompt
* argument schemas; `outputSchema` may have any JSON Schema root (SEP-2106).
* Zod's discriminated unions emit `{oneOf: [...]}` without a top-level `type`,
* so for `io: 'input'` this function defaults `type` to `"object"` when absent
* and throws on an explicit non-object `type` (e.g. `z.string()`). For
* `io: 'output'` a non-object root is returned as-is; the `"object"` default is
* applied only when the root is provably object-shaped.
*/
function standardSchemaToJsonSchema(schema, io = "input") {
	const std = schema["~standard"];
	let result;
	if (std.jsonSchema) result = std.jsonSchema[io]({ target: "draft-2020-12" });
	else if (std.vendor === "zod") {
		if (!("_zod" in schema)) throw new Error("Schema appears to be from zod 3, which the SDK cannot convert to JSON Schema. Upgrade to zod >=4.2.0, or wrap your JSON Schema with fromJsonSchema().");
		if (!warnedZodFallback) {
			warnedZodFallback = true;
			console.warn("[mcp-sdk] Your zod version does not implement `~standard.jsonSchema` (added in zod 4.2.0). Falling back to z.toJSONSchema(). Upgrade to zod >=4.2.0 to silence this warning.");
		}
		result = z.toJSONSchema(schema, {
			target: "draft-2020-12",
			io
		});
	} else throw new Error(`Schema library "${std.vendor}" does not implement StandardJSONSchemaV1 (\`~standard.jsonSchema\`). Upgrade to a version that does, or wrap your JSON Schema with fromJsonSchema().`);
	if (io === "output") {
		if (result.type !== void 0) return result;
		return isProvablyObjectShapedRoot(result) ? {
			type: "object",
			...result
		} : result;
	}
	if (result.type !== void 0 && result.type !== "object") throw new Error(`MCP tool and prompt schemas must describe objects (got type: ${JSON.stringify(result.type)}). Wrap your schema in z.object({...}) or equivalent.`);
	return {
		type: "object",
		...result
	};
}
/**
* A typeless JSON Schema root is "provably object-shaped" when either it carries object keywords
* directly (`properties`/`patternProperties`/`additionalProperties`/`required`), or it is a
* composition (`oneOf`/`anyOf`/`allOf`) whose every member is itself `type:'object'` or recursively
* provably object-shaped (e.g. a nested `discriminatedUnion`). `$ref` is not followed. Used to
* decide whether stamping `type:'object'` is safe (redundant-but-valid) versus self-contradictory.
*/
function isProvablyObjectShapedRoot(schema) {
	if ("properties" in schema || "patternProperties" in schema || "additionalProperties" in schema || "required" in schema) return true;
	for (const key of [
		"oneOf",
		"anyOf",
		"allOf"
	]) {
		const members = schema[key];
		if (Array.isArray(members) && members.length > 0) return members.every((m) => m !== null && typeof m === "object" && (m.type === "object" || isProvablyObjectShapedRoot(m)));
	}
	return false;
}
function formatIssue(issue) {
	if (!issue.path?.length) return issue.message;
	return `${issue.path.map((p) => String(typeof p === "object" ? p.key : p)).join(".")}: ${issue.message}`;
}
async function validateStandardSchema(schema, data) {
	const result = await schema["~standard"].validate(data);
	if (result.issues && result.issues.length > 0) return {
		success: false,
		error: result.issues.map((i) => formatIssue(i)).join(", ")
	};
	return {
		success: true,
		data: result.value
	};
}
function promptArgumentsFromStandardSchema(schema) {
	const jsonSchema = standardSchemaToJsonSchema(schema, "input");
	const properties = jsonSchema.properties || {};
	const required = jsonSchema.required || [];
	return Object.entries(properties).map(([name, prop]) => ({
		name,
		description: prop?.description,
		required: required.includes(name)
	}));
}

//#endregion
//#region ../core-internal/src/wire/bootstrap.ts
function bootstrapOutboundCodec(method) {
	switch (method) {
		case "initialize":
		case "notifications/initialized": return codecForVersion(void 0);
		case "server/discover": return codecForVersion(MODERN_WIRE_REVISION);
		default: return;
	}
}

//#endregion
//#region ../core-internal/src/shared/protocol.ts
/**
* The default request timeout, in milliseconds.
*/
const DEFAULT_REQUEST_TIMEOUT_MSEC = 6e4;
/**
* The reserved per-request `_meta` envelope keys (protocol revision
* 2026-07-28). The protocol layer lifts these out of inbound `_meta` before
* handlers run and surfaces them at `ctx.mcpReq.envelope` — they are
* wire-level bookkeeping, not handler material.
*/
const RESERVED_ENVELOPE_META_KEYS = [
	PROTOCOL_VERSION_META_KEY,
	CLIENT_INFO_META_KEY,
	CLIENT_CAPABILITIES_META_KEY,
	LOG_LEVEL_META_KEY
];
/**
* Top-level params members carrying multi-round-trip driver material
* (protocol revision 2026-07-28). The spec reserves these names on
* client-initiated REQUESTS only — notification params keep them untouched
* (a vendor notification may legitimately use the same names).
*/
const RETRY_PARAMS_KEYS = ["inputResponses", "requestState"];
/**
* Lift wire-only material out of an inbound message so handlers see exactly
* the 2025-era shape, and surface it for the protocol layer (requests: via
* `ctx.mcpReq`). What counts as wire-only depends on the message kind: the
* reserved envelope `_meta` keys are reserved on every message, while the
* multi-round-trip retry fields (`inputResponses`/`requestState`) are
* reserved on client-initiated requests only — so notifications get only the
* envelope lift, and their top-level params stay untouched. Messages without
* wire-only material are returned unchanged (same reference).
*/
function liftWireOnlyMaterial(message, kind) {
	const params = message.params;
	if (!isPlainObject$1(params)) return {
		message,
		lifted: {}
	};
	const meta = params._meta;
	const envelopeKeys = isPlainObject$1(meta) ? RESERVED_ENVELOPE_META_KEYS.filter((key) => key in meta) : [];
	const retryKeys = kind === "request" ? RETRY_PARAMS_KEYS.filter((key) => key in params) : [];
	if (envelopeKeys.length === 0 && retryKeys.length === 0) return {
		message,
		lifted: {}
	};
	const lifted = {};
	const nextParams = { ...params };
	if (envelopeKeys.length > 0 && isPlainObject$1(meta)) {
		const envelope = {};
		const nextMeta = { ...meta };
		for (const key of envelopeKeys) {
			envelope[key] = meta[key];
			delete nextMeta[key];
		}
		lifted.envelope = envelope;
		if (Object.keys(nextMeta).length > 0) nextParams._meta = nextMeta;
		else delete nextParams._meta;
	}
	for (const key of retryKeys) {
		if (key === "inputResponses") lifted.inputResponses = nextParams[key];
		if (key === "requestState") lifted.requestState = nextParams[key];
		delete nextParams[key];
	}
	return {
		message: {
			...message,
			params: nextParams
		},
		lifted
	};
}
/**
* Standard Schema adapter over the era codec's `validateResult` function (the
* function-only WireCodec contract exposes no schema objects). Used by the
* spec-method `request()` overload so the request funnel keeps a single
* `StandardSchemaV1`-shaped validation seam for both spec and explicit-schema
* paths.
*
* Returns `undefined` when the method has no result entry on this era's
* registry — the caller maps that to the synchronous "pass a result schema"
* TypeError, exactly matching the pre-function-only behavior the
* typedMapAlignment suite pins (the result map deliberately excludes the
* `tasks/*` methods, so the spec-method overload refuses them up front).
*/
function codecResultValidator(codec, method) {
	const probe = codec.validateResult(method, void 0);
	if (!probe.ok && probe.reason === "not-in-era") return void 0;
	return { "~standard": {
		version: 1,
		vendor: "mcp-wire-codec",
		validate(value) {
			const outcome = codec.validateResult(method, value);
			if (outcome.ok) return { value: outcome.value };
			return { issues: [{ message: outcome.reason === "invalid" ? outcome.message : `not-in-era: ${method}` }] };
		}
	} };
}
/**
* Builds the `ctx.mcpReq.requestState` accessor for a resolved value. The
* `as T` below is the one place {@linkcode RequestStateAccessor}'s
* caller-asserted typing is implemented — no implementation can produce an
* arbitrary `T` from a runtime value honestly.
*/
function requestStateAccessor(value) {
	return () => value;
}
/** Shared no-state accessor: the common case allocates nothing per request. */
const NO_REQUEST_STATE = requestStateAccessor(void 0);
/**
* Returns a context whose `requestState` accessor reads the given value —
* how the server seam hands a verify hook's decoded payload (or the legacy
* shim's per-round echo) to the handler without mutating the original
* context.
*/
function withRequestStateValue(ctx, value) {
	return {
		...ctx,
		mcpReq: {
			...ctx.mcpReq,
			requestState: requestStateAccessor(value)
		}
	};
}
let writeNegotiatedProtocolVersion;
/**
* Package-internal write channel for a {@linkcode Protocol} instance's
* negotiated protocol version, for callers outside the class hierarchy:
* tests and the (future) modern-era server entry that marks a factory
* instance modern at binding time. Exported on the core internal barrel
* only — never public API.
*/
function setNegotiatedProtocolVersion(instance, version) {
	writeNegotiatedProtocolVersion(instance, version);
}
/**
* Implements MCP protocol framing on top of a pluggable transport, including
* features like request/response linking, notifications, and progress.
*
* `Protocol` is abstract; `Client` and `Server` are the concrete role-specific
* implementations most code should use.
*/
var Protocol = class {
	_transport;
	_requestMessageId = 0;
	_requestHandlers = /* @__PURE__ */ new Map();
	_requestHandlerAbortControllers = /* @__PURE__ */ new Map();
	_notificationHandlers = /* @__PURE__ */ new Map();
	_responseHandlers = /* @__PURE__ */ new Map();
	_progressHandlers = /* @__PURE__ */ new Map();
	_timeoutInfo = /* @__PURE__ */ new Map();
	_pendingDebouncedNotifications = /* @__PURE__ */ new Set();
	/**
	* The protocol version negotiated for the current connection (`undefined`
	* before negotiation completes), which determines the wire era this
	* instance speaks. Set by the SDK's negotiation and initialize paths
	* (`Client.connect`, `Server._oninitialize`).
	*/
	_negotiatedProtocolVersion;
	static {
		writeNegotiatedProtocolVersion = (instance, version) => {
			instance._negotiatedProtocolVersion = version;
		};
	}
	_supportedProtocolVersions;
	/**
	* Callback for when the connection is closed for any reason.
	*
	* This is invoked when {@linkcode Protocol.close | close()} is called as well.
	*/
	onclose;
	/**
	* Callback for when an error occurs.
	*
	* Note that errors are not necessarily fatal; they are used for reporting any kind of exceptional condition out of band.
	*/
	onerror;
	/**
	* A handler to invoke for any request types that do not have their own handler installed.
	*/
	fallbackRequestHandler;
	/**
	* A handler to invoke for any notification types that do not have their own handler installed.
	*/
	fallbackNotificationHandler;
	constructor(_options) {
		this._options = _options;
		this._supportedProtocolVersions = _options?.supportedProtocolVersions ?? SUPPORTED_PROTOCOL_VERSIONS;
		this.setNotificationHandler("notifications/cancelled", (notification) => {
			this._oncancel(notification);
		});
		this.setNotificationHandler("notifications/progress", (notification) => {
			this._onprogress(notification);
		});
		this.setRequestHandler("ping", (_request) => ({}));
	}
	/**
	* Drop consult for inbound messages whose transport did not classify them
	* at the edge — long-lived channels such as stdio, where a role class may
	* need to decline traffic the negotiated era has no answer for (the
	* client-side inbound-request drop on modern-era connections: the
	* 2026-07-28 era has no server→client request channel, and on stdio the
	* client must never write JSON-RPC responses).
	*
	* Consulted ONLY when the transport supplied no
	* {@linkcode MessageExtraInfo.classification}: edge-classified traffic
	* never reaches the hook. Returning `'drop'` discards the message without
	* writing any response (requests are surfaced via `onerror`). The base
	* implementation returns `undefined`: unclassified traffic keeps today's
	* dispatch path unchanged. Era selection never happens here — era is
	* instance state, owned by the serving entry that constructed and
	* connected the instance.
	*/
	_shouldDropInbound(_message) {}
	/**
	* The per-request `_meta` envelope this instance attaches to every outgoing
	* request and notification, when one applies. The base implementation
	* returns `undefined` (no envelope — the 2025-era posture, so legacy-era
	* outbound traffic is byte-identical to a build without this seam).
	* `Client` overrides it on a connection that negotiated a modern (2026-07-28+)
	* era to return the reserved protocol-version / client-info /
	* client-capabilities keys. User-supplied `_meta` keys take precedence over
	* the auto-attached ones.
	*/
	_outboundMetaEnvelope() {}
	/**
	* Attach this instance's outbound `_meta` envelope (when one is configured)
	* to a request or notification. A no-op when the seam returns `undefined`
	* — the message returns by reference, so the legacy-era wire stays
	* byte-identical. User-supplied `_meta` keys are spread last so they win
	* over the auto-attached envelope keys.
	*/
	_envelopeOutbound(message) {
		const envelope = this._outboundMetaEnvelope();
		if (envelope === void 0) return message;
		const params = message.params ?? {};
		return {
			...message,
			params: {
				...params,
				_meta: {
					...envelope,
					...params._meta
				}
			}
		};
	}
	/**
	* Extension point for non-`complete` decoded results in the response
	* funnel: a result the wire codec discriminated into a kind other than
	* `'complete'` or `'invalid'` is handed here for the role class to
	* resolve. The base default surfaces it as a typed
	* {@linkcode SdkErrorCode.UnsupportedResultType} error (no retry).
	*
	* Intended consumers (named so the seam stays accountable):
	* - the `Client`'s multi-round-trip auto-fulfilment engine, which fulfils
	*   `'input_required'` results through the registered
	*   elicitation/sampling/roots handlers and retries via `flow.retry`;
	* - a future client-side terminal-result handler for
	*   `subscriptions/listen`, when the spec defines one.
	*
	* `Server` instances never receive `input_required` responses on their
	* outbound legs and leave the base behavior in place.
	*/
	_resolveNonCompleteResult(decoded, flow) {
		return Promise.reject(new SdkError(SdkErrorCode.UnsupportedResultType, `Unsupported result type '${decoded.kind}' for ${flow.request.method}`, {
			resultType: decoded.kind,
			method: flow.request.method
		}));
	}
	/**
	* Protected accessor for a registered request handler. Used by role
	* classes that dispatch synthesized requests through the same stored
	* handler chain (e.g. the `Client` fulfilling an embedded multi-round-trip
	* input request).
	*/
	_getRequestHandler(method) {
		return this._requestHandlers.get(method);
	}
	async _oncancel(notification) {
		if (!notification.params.requestId) return;
		this._requestHandlerAbortControllers.get(notification.params.requestId)?.abort(notification.params.reason);
	}
	_setupTimeout(messageId, timeout, maxTotalTimeout, onTimeout, resetTimeoutOnProgress = false) {
		this._timeoutInfo.set(messageId, {
			timeoutId: setTimeout(onTimeout, timeout),
			startTime: Date.now(),
			timeout,
			maxTotalTimeout,
			resetTimeoutOnProgress,
			onTimeout
		});
	}
	_resetTimeout(messageId) {
		const info = this._timeoutInfo.get(messageId);
		if (!info) return false;
		const totalElapsed = Date.now() - info.startTime;
		if (info.maxTotalTimeout && totalElapsed >= info.maxTotalTimeout) {
			this._timeoutInfo.delete(messageId);
			throw new SdkError(SdkErrorCode.RequestTimeout, "Maximum total timeout exceeded", {
				maxTotalTimeout: info.maxTotalTimeout,
				totalElapsed
			});
		}
		clearTimeout(info.timeoutId);
		info.timeoutId = setTimeout(info.onTimeout, info.timeout);
		return true;
	}
	_cleanupTimeout(messageId) {
		const info = this._timeoutInfo.get(messageId);
		if (info) {
			clearTimeout(info.timeoutId);
			this._timeoutInfo.delete(messageId);
		}
	}
	/**
	* Attaches to the given transport, starts it, and starts listening for messages.
	*
	* The caller assumes ownership of the {@linkcode Transport}, replacing any callbacks that have already been set, and expects that it is the only user of the {@linkcode Transport} instance going forward.
	*/
	async connect(transport) {
		this._transport = transport;
		const _onclose = this.transport?.onclose;
		this._transport.onclose = () => {
			try {
				_onclose?.();
			} finally {
				this._onclose();
			}
		};
		const _onerror = this.transport?.onerror;
		this._transport.onerror = (error) => {
			_onerror?.(error);
			this._onerror(error);
		};
		const _onmessage = this._transport?.onmessage;
		this._transport.onmessage = (message, extra) => {
			_onmessage?.(message, extra);
			if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) this._onresponse(message);
			else if (isJSONRPCRequest(message)) this._onrequest(message, extra);
			else if (isJSONRPCNotification(message)) this._onnotification(message, extra);
			else this._onerror(/* @__PURE__ */ new Error(`Unknown message type: ${JSON.stringify(message)}`));
		};
		transport.setSupportedProtocolVersions?.(this._supportedProtocolVersions);
		await this._transport.start();
	}
	/**
	* Transport-close hook. Subclass overrides MUST call `super._onclose()`
	* after their own cleanup — base teardown (response-handler settlement,
	* timeout clearing, in-flight request abort) does not run otherwise.
	*/
	_onclose() {
		const responseHandlers = this._responseHandlers;
		this._responseHandlers = /* @__PURE__ */ new Map();
		this._progressHandlers.clear();
		this._pendingDebouncedNotifications.clear();
		for (const info of this._timeoutInfo.values()) clearTimeout(info.timeoutId);
		this._timeoutInfo.clear();
		const requestHandlerAbortControllers = this._requestHandlerAbortControllers;
		this._requestHandlerAbortControllers = /* @__PURE__ */ new Map();
		const error = new SdkError(SdkErrorCode.ConnectionClosed, "Connection closed");
		this._transport = void 0;
		try {
			this.onclose?.();
		} finally {
			for (const handler of responseHandlers.values()) handler(error);
			for (const controller of requestHandlerAbortControllers.values()) controller.abort(error);
		}
	}
	_onerror(error) {
		this.onerror?.(error);
	}
	/**
	* Inbound-notification dispatch. Subclass overrides MUST delegate
	* unmatched traffic to `super._onnotification(rawNotification, extra)` —
	* an override that consumes only what it owns and falls through to base
	* dispatch for everything else.
	*/
	_onnotification(rawNotification, extra) {
		const { message: notification } = liftWireOnlyMaterial(rawNotification, "notification");
		const codec = this._negotiatedWireCodec();
		if (extra?.classification === void 0 && this._shouldDropInbound(rawNotification) === "drop") return;
		if (extra?.classification !== void 0) {
			const classified = classifiedWireEra(extra.classification);
			if (classified !== codec.era) {
				this._onerror(/* @__PURE__ */ new Error(`Era mismatch on inbound notification '${notification.method}': classified as ${classified} but this instance serves ${codec.era}`));
				return;
			}
		}
		if (isSpecNotificationMethod(notification.method) && !codec.hasNotificationMethod(notification.method)) return;
		const handler = this._notificationHandlers.get(notification.method);
		const fallback = this.fallbackNotificationHandler;
		if (handler === void 0 && fallback === void 0) return;
		Promise.resolve().then(() => handler === void 0 ? fallback(notification) : handler(notification, codec)).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Uncaught error in notification handler: ${error}`)));
	}
	_onrequest(rawRequest, extra) {
		const { message: request, lifted } = liftWireOnlyMaterial(rawRequest, "request");
		const codec = this._negotiatedWireCodec();
		if (extra?.classification === void 0 && this._shouldDropInbound(rawRequest) === "drop") {
			this._onerror(/* @__PURE__ */ new Error(`Dropped inbound request '${rawRequest.method}': not servable on this connection's protocol era`));
			return;
		}
		const capturedTransport = this._transport;
		const sendErrorResponse = (code, message, data) => {
			const errorResponse = {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code,
					message,
					...data !== void 0 && { data }
				}
			};
			capturedTransport?.send(errorResponse).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Failed to send an error response: ${error}`)));
		};
		if (extra?.classification !== void 0) {
			const classified = classifiedWireEra(extra.classification);
			if (classified !== codec.era) {
				this._onerror(/* @__PURE__ */ new Error(`Era mismatch on inbound request '${request.method}': classified as ${classified} but this instance serves ${codec.era}`));
				const requested = extra.classification.revision ?? classified;
				sendErrorResponse(ProtocolErrorCode.UnsupportedProtocolVersion, `Unsupported protocol version: ${requested}`, {
					supported: this._supportedProtocolVersions,
					requested
				});
				return;
			}
		}
		if (isSpecRequestMethod(request.method) && !codec.hasRequestMethod(request.method)) {
			sendErrorResponse(ProtocolErrorCode.MethodNotFound, "Method not found");
			return;
		}
		const handler = this._requestHandlers.get(request.method) ?? this.fallbackRequestHandler;
		if (handler === void 0) {
			sendErrorResponse(ProtocolErrorCode.MethodNotFound, "Method not found");
			return;
		}
		const envelopeError = codec.checkInboundEnvelope(lifted);
		if (envelopeError !== void 0) {
			sendErrorResponse(ProtocolErrorCode.InvalidParams, envelopeError);
			return;
		}
		const sendNotification = (notification, options) => this._notificationViaCodec(this._resolveOutboundCodec(notification.method), notification, {
			...options,
			relatedRequestId: request.id
		});
		const sendRequest = (r, resultSchema, options) => this._requestWithSchemaViaCodec(this._resolveOutboundCodec(r.method), r, resultSchema, {
			...options,
			relatedRequestId: request.id
		});
		const abortController = new AbortController();
		this._requestHandlerAbortControllers.set(request.id, abortController);
		const partitionedInputResponses = lifted.inputResponses === void 0 ? void 0 : partitionInputResponses(lifted.inputResponses);
		const baseCtx = {
			sessionId: capturedTransport?.sessionId,
			mcpReq: {
				id: request.id,
				method: request.method,
				_meta: request.params?._meta,
				...lifted.envelope !== void 0 && { envelope: lifted.envelope },
				...partitionedInputResponses !== void 0 && { inputResponses: partitionedInputResponses.accepted },
				...partitionedInputResponses !== void 0 && partitionedInputResponses.droppedKeys.length > 0 && { droppedInputResponseKeys: partitionedInputResponses.droppedKeys },
				requestState: lifted.requestState === void 0 ? NO_REQUEST_STATE : requestStateAccessor(lifted.requestState),
				signal: abortController.signal,
				send: ((r, schemaOrOptions, maybeOptions) => {
					const sendCodec = this._resolveOutboundCodec(r.method);
					this._assertOutboundRequestInEra(sendCodec, r.method);
					if (isStandardSchema(schemaOrOptions)) return sendRequest(r, schemaOrOptions, maybeOptions);
					const validate = codecResultValidator(sendCodec, r.method);
					if (validate === void 0) throw new TypeError(`'${r.method}' is not a spec method; pass a result schema as the second argument to ctx.mcpReq.send().`);
					return sendRequest(r, validate, schemaOrOptions);
				}),
				notify: sendNotification
			},
			http: extra?.authInfo ? { authInfo: extra.authInfo } : void 0
		};
		const ctx = this.buildContext(baseCtx, extra);
		Promise.resolve().then(() => handler(request, ctx)).then(async (result) => {
			if (abortController.signal.aborted) return;
			let encoded;
			try {
				encoded = codec.encodeResult(request.method, result);
			} catch (error) {
				this._onerror(/* @__PURE__ */ new Error(`Failed to encode result for ${request.method}: ${error}`));
				sendErrorResponse(ProtocolErrorCode.InternalError, "Internal error");
				return;
			}
			const response = {
				result: encoded,
				jsonrpc: "2.0",
				id: request.id
			};
			await capturedTransport?.send(response);
		}, async (error) => {
			if (abortController.signal.aborted) return;
			const thrownCode = Number.isSafeInteger(error["code"]) ? error["code"] : ProtocolErrorCode.InternalError;
			const errorResponse = {
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: codec.encodeErrorCode(thrownCode),
					message: error.message ?? "Internal error",
					...error["data"] !== void 0 && { data: error["data"] }
				}
			};
			await capturedTransport?.send(errorResponse);
		}).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Failed to send response: ${error}`))).finally(() => {
			if (this._requestHandlerAbortControllers.get(request.id) === abortController) this._requestHandlerAbortControllers.delete(request.id);
		});
	}
	_onprogress(notification) {
		const { progressToken, ...params } = notification.params;
		const messageId = Number(progressToken);
		const handler = this._progressHandlers.get(messageId);
		if (!handler) {
			this._onerror(/* @__PURE__ */ new Error(`Received a progress notification for an unknown token: ${JSON.stringify(notification)}`));
			return;
		}
		const responseHandler = this._responseHandlers.get(messageId);
		const timeoutInfo = this._timeoutInfo.get(messageId);
		if (timeoutInfo && responseHandler && timeoutInfo.resetTimeoutOnProgress) try {
			this._resetTimeout(messageId);
		} catch (error) {
			this._responseHandlers.delete(messageId);
			this._progressHandlers.delete(messageId);
			this._cleanupTimeout(messageId);
			responseHandler(error);
			return;
		}
		handler(params);
	}
	/**
	* Inbound-response dispatch. Subclass overrides MUST delegate unmatched
	* traffic to `super._onresponse(response)` — an override that consumes
	* only what it owns and falls through to base dispatch for everything
	* else.
	*/
	_onresponse(response) {
		const messageId = Number(response.id);
		const handler = this._responseHandlers.get(messageId);
		if (handler === void 0) {
			this._onerror(/* @__PURE__ */ new Error(`Received a response for an unknown message ID: ${JSON.stringify(response)}`));
			return;
		}
		this._responseHandlers.delete(messageId);
		this._cleanupTimeout(messageId);
		this._progressHandlers.delete(messageId);
		if (isJSONRPCResultResponse(response)) handler(response);
		else handler(ProtocolError.fromError(response.error.code, response.error.message, response.error.data));
	}
	get transport() {
		return this._transport;
	}
	/**
	* Closes the connection.
	*/
	async close() {
		await this._transport?.close();
	}
	request(request, schemaOrOptions, maybeOptions) {
		const codec = this._resolveOutboundCodec(request.method);
		this._assertOutboundRequestInEra(codec, request.method);
		if (isStandardSchema(schemaOrOptions)) return this._requestWithSchemaViaCodec(codec, request, schemaOrOptions, maybeOptions);
		const validate = codecResultValidator(codec, request.method);
		if (validate === void 0) throw new TypeError(`'${request.method}' is not a spec method; pass a result schema as the second argument to request().`);
		return this._requestWithSchemaViaCodec(codec, request, validate, schemaOrOptions);
	}
	/**
	* The wire codec for this instance's negotiated era — the phase-2 truth:
	* everything an established connection sends and receives resolves
	* through it. Legacy until a version has been negotiated.
	*/
	_negotiatedWireCodec() {
		return codecForVersion(this._negotiatedProtocolVersion);
	}
	/**
	* Protected accessor for the instance's negotiated wire codec, for role
	* classes (Client/Server/McpServer) routing era-dependent behavior
	* through the codec's function-only surface — `samplingResultVariant`,
	* `outboundEnvelope`, `projectCallToolResult` — instead of branching on
	* the protocol version themselves.
	*/
	_wireCodec() {
		return this._negotiatedWireCodec();
	}
	/**
	* Outbound codec resolution: while the negotiated version is still unset
	* (the negotiation window), lifecycle messages are bootstrap-pinned BY
	* METHOD — they self-identify their era (`initialize` IS the legacy
	* handshake, `server/discover` IS the modern probe). Once a version has
	* been negotiated, the instance era is authoritative for everything — a
	* negotiated session never re-routes a method onto the other era.
	*/
	_resolveOutboundCodec(method) {
		if (this._negotiatedProtocolVersion === void 0) {
			const pinned = bootstrapOutboundCodec(method);
			if (pinned) return pinned;
		}
		return this._negotiatedWireCodec();
	}
	/**
	* Era gate for outbound requests — deletions are physical in BOTH
	* directions: sending a spec method that the resolved era does not define
	* dies locally with a typed error before anything reaches the transport.
	* Methods outside the spec universe are consumer-owned extension methods
	* and stay era-blind.
	*/
	_assertOutboundRequestInEra(codec, method) {
		if (isSpecRequestMethod(method) && !codec.hasRequestMethod(method)) throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, `Method '${method}' is not supported by the negotiated protocol version (wire era ${codec.era})`, {
			method,
			era: codec.era
		});
	}
	/**
	* Sends a request and waits for a response, using the provided schema for
	* validation instead of the era registry's method-keyed entry.
	*
	* This is the internal implementation used by SDK methods whose result
	* schema cannot be expressed as a method-keyed registry entry — the one
	* surviving case is `server.createMessage`, whose result schema depends
	* on the REQUEST params (tools vs no tools) — and by callers passing
	* explicit compatibility schemas. Spec methods are still era-gated here:
	* an explicit schema never smuggles a deleted method onto the wire.
	*/
	_requestWithSchema(request, resultSchema, options) {
		const codec = this._resolveOutboundCodec(request.method);
		this._assertOutboundRequestInEra(codec, request.method);
		return this._requestWithSchemaViaCodec(codec, request, resultSchema, options);
	}
	/**
	* The request funnel proper, keyed by the resolved era codec: the codec
	* owns result decoding (raw-first `resultType` discrimination — V-1 —
	* and the era's lift posture) before the schema validation step.
	*/
	_requestWithSchemaViaCodec(codec, request, resultSchema, options) {
		const { relatedRequestId, resumptionToken, onresumptiontoken, headers } = options ?? {};
		const flowStartedAt = Date.now();
		let onAbort;
		let cleanupMessageId;
		return new Promise((resolve, reject) => {
			const earlyReject = (error) => {
				reject(error);
			};
			if (!this._transport) {
				earlyReject(/* @__PURE__ */ new Error("Not connected"));
				return;
			}
			if (this._options?.enforceStrictCapabilities === true) try {
				this.assertCapabilityForMethod(request.method);
			} catch (error) {
				earlyReject(error);
				return;
			}
			if (options?.signal?.aborted) {
				const reason = options.signal.reason;
				throw reason instanceof SdkError ? reason : new SdkError(SdkErrorCode.RequestTimeout, String(reason));
			}
			const requestAbort = codec.era === MODERN_WIRE_REVISION && this._transport.hasPerRequestStream === true ? new AbortController() : void 0;
			const messageId = this._requestMessageId++;
			cleanupMessageId = messageId;
			const jsonrpcRequest = {
				...request,
				jsonrpc: "2.0",
				id: messageId
			};
			if (options?.onprogress) {
				this._progressHandlers.set(messageId, options.onprogress);
				jsonrpcRequest.params = {
					...request.params,
					_meta: {
						...request.params?._meta,
						progressToken: messageId
					}
				};
			}
			const outbound = this._envelopeOutbound(jsonrpcRequest);
			let responseReceived = false;
			const cancel = (reason) => {
				if (responseReceived) return;
				this._progressHandlers.delete(messageId);
				if (requestAbort === void 0) this._transport?.send(this._envelopeOutbound({
					jsonrpc: "2.0",
					method: "notifications/cancelled",
					params: {
						requestId: messageId,
						reason: String(reason)
					}
				}), {
					relatedRequestId,
					resumptionToken,
					onresumptiontoken
				}).catch((error) => this._onerror(/* @__PURE__ */ new Error(`Failed to send cancellation: ${error}`)));
				else requestAbort.abort();
				reject(reason instanceof SdkError ? reason : new SdkError(SdkErrorCode.RequestTimeout, String(reason)));
			};
			this._responseHandlers.set(messageId, (response) => {
				if (options?.signal?.aborted) return;
				responseReceived = true;
				if (response instanceof Error) return reject(response);
				let decoded;
				try {
					decoded = codec.decodeResult(request.method, response.result);
				} catch (error) {
					return reject(error instanceof Error ? error : new Error(String(error)));
				}
				if (decoded.kind === "invalid") return reject(decoded.error);
				if (decoded.kind === "input_required") {
					if (options?.allowInputRequired === true) return resolve(manualInputRequiredValue(decoded));
					const flow = {
						codec,
						request,
						resultSchema,
						options,
						flowStartedAt,
						retry: (params, legOptions) => this._requestWithSchemaViaCodec(codec, params === void 0 ? { method: request.method } : {
							method: request.method,
							params
						}, resultSchema, legOptions)
					};
					return resolve(this._resolveNonCompleteResult(decoded, flow));
				}
				const result = decoded.result;
				validateStandardSchema(resultSchema, result).then((parseResult) => {
					if (parseResult.success) resolve(parseResult.data);
					else reject(new SdkError(SdkErrorCode.InvalidResult, `Invalid result for ${request.method}: ${parseResult.error}`));
				}, reject);
			});
			onAbort = () => cancel(options?.signal?.reason);
			options?.signal?.addEventListener("abort", onAbort, { once: true });
			const timeout = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT_MSEC;
			const timeoutHandler = () => cancel(new SdkError(SdkErrorCode.RequestTimeout, "Request timed out", { timeout }));
			this._setupTimeout(messageId, timeout, options?.maxTotalTimeout, timeoutHandler, options?.resetTimeoutOnProgress ?? false);
			this._transport.send(outbound, {
				relatedRequestId,
				resumptionToken,
				onresumptiontoken,
				headers,
				requestSignal: requestAbort?.signal
			}).catch((error) => {
				this._progressHandlers.delete(messageId);
				reject(error);
			});
		}).finally(() => {
			if (onAbort) options?.signal?.removeEventListener("abort", onAbort);
			if (cleanupMessageId !== void 0) {
				this._responseHandlers.delete(cleanupMessageId);
				this._cleanupTimeout(cleanupMessageId);
			}
		});
	}
	/**
	* Emits a notification, which is a one-way message that does not expect a response.
	*/
	async notification(notification, options) {
		return this._notificationViaCodec(this._resolveOutboundCodec(notification.method), notification, options);
	}
	/**
	* The notification funnel proper, keyed by the resolved era codec —
	* direct sends and related notifications (`ctx.mcpReq.notify`) alike
	* resolve through the instance's negotiated era at send time.
	*/
	async _notificationViaCodec(codec, notification, options) {
		if (!this._transport) throw new SdkError(SdkErrorCode.NotConnected, "Not connected");
		if (isSpecNotificationMethod(notification.method) && !codec.hasNotificationMethod(notification.method)) throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, `Notification '${notification.method}' is not supported by the negotiated protocol version (wire era ${codec.era})`, {
			method: notification.method,
			era: codec.era
		});
		this.assertNotificationCapability(notification.method);
		const jsonrpcNotification = this._envelopeOutbound({
			jsonrpc: "2.0",
			...notification
		});
		if ((this._options?.debouncedNotificationMethods ?? []).includes(notification.method) && !notification.params && !options?.relatedRequestId) {
			if (this._pendingDebouncedNotifications.has(notification.method)) return;
			this._pendingDebouncedNotifications.add(notification.method);
			Promise.resolve().then(() => {
				this._pendingDebouncedNotifications.delete(notification.method);
				if (!this._transport) return;
				this._transport?.send(jsonrpcNotification, options).catch((error) => this._onerror(error));
			});
			return;
		}
		await this._transport.send(jsonrpcNotification, options);
	}
	setRequestHandler(method, schemasOrHandler, maybeHandler) {
		this.assertRequestHandlerCapability(method);
		let stored;
		if (typeof schemasOrHandler === "function") {
			if (!isSpecRequestMethod(method)) throw new TypeError(`'${method}' is not a spec request method; pass schemas as the second argument to setRequestHandler().`);
			stored = (request, ctx) => {
				const dispatchCodec = this._negotiatedWireCodec();
				let outcome = dispatchCodec.validateRequest(method, request);
				if (!outcome.ok && outcome.reason === "not-in-era") outcome = dispatchCodec.validateInputRequest(method, request);
				if (!outcome.ok) {
					if (outcome.reason === "not-in-era") throw new ProtocolError(ProtocolErrorCode.InternalError, `No wire schema for ${method} in the resolved era`);
					throw new Error(outcome.message);
				}
				return Promise.resolve(schemasOrHandler(outcome.value, ctx));
			};
		} else if (maybeHandler) stored = async (request, ctx) => {
			const parsed = await validateStandardSchema(schemasOrHandler.params, { ...request.params });
			if (!parsed.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid params for ${method}: ${parsed.error}`);
			return maybeHandler(parsed.data, ctx);
		};
		else throw new TypeError("setRequestHandler: handler is required");
		this._requestHandlers.set(method, this._wrapHandler(method, stored));
	}
	/**
	* Hook for subclasses to wrap a registered request handler with role-specific
	* validation or behavior (e.g. `Server` validates `tools/call` results, `Client`
	* validates `elicitation/create` mode and result). Runs for both the 2-arg and
	* 3-arg registration paths. The default implementation is identity.
	*
	* Subclasses overriding this hook avoid redeclaring `setRequestHandler`'s overload set.
	*/
	_wrapHandler(_method, handler) {
		return handler;
	}
	/**
	* Removes the request handler for the given method.
	*/
	removeRequestHandler(method) {
		this._requestHandlers.delete(method);
	}
	/**
	* Asserts that a request handler has not already been set for the given method, in preparation for a new one being automatically installed.
	*/
	assertCanSetRequestHandler(method) {
		if (this._requestHandlers.has(method)) throw new Error(`A request handler for ${method} already exists, which would be overridden`);
	}
	setNotificationHandler(method, schemasOrHandler, maybeHandler) {
		if (typeof schemasOrHandler === "function") {
			if (!isSpecNotificationMethod(method)) throw new TypeError(`'${method}' is not a spec notification method; pass schemas as the second argument to setNotificationHandler().`);
			this._notificationHandlers.set(method, (notification, codec) => {
				const outcome = codec.validateNotification(method, notification);
				if (!outcome.ok) {
					if (outcome.reason === "not-in-era") throw new ProtocolError(ProtocolErrorCode.InternalError, `No wire schema for ${method} in the resolved era`);
					throw new Error(outcome.message);
				}
				return Promise.resolve(schemasOrHandler(outcome.value));
			});
			return;
		}
		if (!maybeHandler) throw new TypeError("setNotificationHandler: handler is required");
		this._notificationHandlers.set(method, async (notification) => {
			const parsed = await validateStandardSchema(schemasOrHandler.params, { ...notification.params });
			if (!parsed.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid params for notification ${method}: ${parsed.error}`);
			await maybeHandler(parsed.data, notification);
		});
	}
	/**
	* Removes the notification handler for the given method.
	*/
	removeNotificationHandler(method) {
		this._notificationHandlers.delete(method);
	}
};
function isPlainObject$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function mergeCapabilities(base, additional) {
	const result = { ...base };
	for (const key in additional) {
		const k = key;
		const addValue = additional[k];
		if (addValue === void 0) continue;
		const baseValue = result[k];
		result[k] = isPlainObject$1(baseValue) && isPlainObject$1(addValue) ? {
			...baseValue,
			...addValue
		} : addValue;
	}
	return result;
}

//#endregion
//#region ../core-internal/src/shared/inputRequiredEngine.ts
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Splits a retried request's `inputResponses` map into the BARE response
* entries the spec defines and everything else. The spec's embedded responses
* are the bare result objects (an `ElicitResult`, `CreateMessageResult`, or
* `ListRootsResult`); a wrapped `{method, result}` envelope (a shape some
* peers emit) is never accepted as a response — its key is recorded so the
* handler can re-issue the corresponding input request.
*/
function partitionInputResponses(inputResponses) {
	const accepted = {};
	const droppedKeys = [];
	if (!isPlainObject(inputResponses)) return {
		accepted,
		droppedKeys
	};
	for (const [key, entry] of Object.entries(inputResponses)) {
		if (!isPlainObject(entry) || "method" in entry || "result" in entry) {
			droppedKeys.push(key);
			continue;
		}
		accepted[key] = entry;
	}
	return {
		accepted,
		droppedKeys
	};
}
/**
* Builds the manual-mode {@linkcode InputRequiredResult} value from the
* codec's decoded payload — what an `allowInputRequired: true` caller
* receives instead of the auto-fulfilled complete result.
*/
function manualInputRequiredValue(decoded) {
	return {
		resultType: "input_required",
		inputRequests: decoded.inputRequests,
		...decoded.requestState !== void 0 && { requestState: decoded.requestState }
	};
}

//#endregion
//#region ../core-internal/src/shared/metadataUtils.ts
/**
* Utilities for working with {@linkcode BaseMetadata} objects.
*/
/**
* Gets the display name for an object with {@linkcode BaseMetadata}.
* For tools, the precedence is: `title` → {@linkcode index.ToolAnnotations | annotations}.`title` → `name`
* For other objects: `title` → `name`
* This implements the spec requirement: "if no title is provided, name should be used for display purposes"
*/
function getDisplayName(metadata) {
	if (metadata.title !== void 0 && metadata.title !== "") return metadata.title;
	if ("annotations" in metadata && metadata.annotations?.title) return metadata.annotations.title;
	return metadata.name;
}

//#endregion
//#region ../core-internal/src/shared/stdio.ts
const STDIO_DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024;
/**
* Buffers a continuous stdio stream into discrete JSON-RPC messages.
*/
var ReadBuffer = class {
	_buffer;
	_maxBufferSize;
	constructor(options) {
		this._maxBufferSize = options?.maxBufferSize ?? STDIO_DEFAULT_MAX_BUFFER_SIZE;
	}
	append(chunk) {
		if ((this._buffer?.length ?? 0) + chunk.length > this._maxBufferSize) {
			this.clear();
			throw new Error(`ReadBuffer exceeded maximum size of ${this._maxBufferSize} bytes`);
		}
		this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
	}
	readMessage() {
		while (this._buffer) {
			const index = this._buffer.indexOf("\n");
			if (index === -1) return null;
			const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
			this._buffer = this._buffer.subarray(index + 1);
			try {
				return deserializeMessage(line);
			} catch (error) {
				if (error instanceof SyntaxError) continue;
				throw error;
			}
		}
		return null;
	}
	clear() {
		this._buffer = void 0;
	}
};
function deserializeMessage(line) {
	return JSONRPCMessageSchema.parse(JSON.parse(line));
}
function serializeMessage(message) {
	return JSON.stringify(message) + "\n";
}

//#endregion
//#region ../core-internal/src/shared/toolNameValidation.ts
/**
* Tool name validation utilities according to SEP: Specify Format for Tool Names
*
* Tool names SHOULD be between 1 and 128 characters in length (inclusive).
* Tool names are case-sensitive.
* Allowed characters: uppercase and lowercase ASCII letters (`A-Z`, `a-z`), digits
* (`0-9`), underscore (`_`), dash (`-`), and dot (`.`).
* Tool names SHOULD NOT contain spaces, commas, or other special characters.
*
* @see {@link https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986 | SEP-986: Specify Format for Tool Names}
*/
/**
* Regular expression for valid tool names according to SEP-986 specification
*/
const TOOL_NAME_REGEX = /^[A-Za-z0-9._-]{1,128}$/;
/**
* Validates a tool name according to the SEP specification
* @param name - The tool name to validate
* @returns An object containing validation result and any warnings
*/
function validateToolName(name) {
	const warnings = [];
	if (name.length === 0) return {
		isValid: false,
		warnings: ["Tool name cannot be empty"]
	};
	if (name.length > 128) return {
		isValid: false,
		warnings: [`Tool name exceeds maximum length of 128 characters (current: ${name.length})`]
	};
	if (name.includes(" ")) warnings.push("Tool name contains spaces, which may cause parsing issues");
	if (name.includes(",")) warnings.push("Tool name contains commas, which may cause parsing issues");
	if (name.startsWith("-") || name.endsWith("-")) warnings.push("Tool name starts or ends with a dash, which may cause parsing issues in some contexts");
	if (name.startsWith(".") || name.endsWith(".")) warnings.push("Tool name starts or ends with a dot, which may cause parsing issues in some contexts");
	if (!TOOL_NAME_REGEX.test(name)) {
		const invalidChars = [...name].filter((char) => !/[A-Za-z0-9._-]/.test(char)).filter((char, index, arr) => arr.indexOf(char) === index);
		warnings.push(`Tool name contains invalid characters: ${invalidChars.map((c) => `"${c}"`).join(", ")}`, "Allowed characters are: A-Z, a-z, 0-9, underscore (_), dash (-), and dot (.)");
		return {
			isValid: false,
			warnings
		};
	}
	return {
		isValid: true,
		warnings
	};
}
/**
* Issues warnings for non-conforming tool names
* @param name - The tool name that triggered the warnings
* @param warnings - Array of warning messages
*/
function issueToolNameWarning(name, warnings) {
	if (warnings.length > 0) {
		console.warn(`Tool name validation warning for "${name}":`);
		for (const warning of warnings) console.warn(`  - ${warning}`);
		console.warn("Tool registration will proceed, but this may cause compatibility issues.");
		console.warn("Consider updating the tool name to conform to the MCP tool naming standard.");
		console.warn("See SEP: Specify Format for Tool Names (https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986) for more details.");
	}
}
/**
* Validates a tool name and issues warnings for non-conforming names
* @param name - The tool name to validate
* @returns `true` if the name is valid, `false` otherwise
*/
function validateAndWarnToolName(name) {
	const result = validateToolName(name);
	issueToolNameWarning(name, result.warnings);
	return result.isValid;
}

//#endregion
//#region ../core-internal/src/shared/transport.ts
/**
* Normalizes `HeadersInit` to a plain `Record<string, string>` for manipulation.
* Handles `Headers` objects, arrays of tuples, and plain objects.
*/
function normalizeHeaders(headers) {
	if (!headers) return {};
	if (headers instanceof Headers) return Object.fromEntries(headers.entries());
	if (Array.isArray(headers)) return Object.fromEntries(headers);
	return { ...headers };
}
/**
* Creates a fetch function that includes base `RequestInit` options.
* This ensures requests inherit settings like credentials, mode, headers, etc. from the base init.
*
* @param baseFetch - The base fetch function to wrap (defaults to global `fetch`)
* @param baseInit - The base `RequestInit` to merge with each request
* @returns A wrapped fetch function that merges base options with call-specific options
*/
function createFetchWithInit(baseFetch = fetch, baseInit) {
	if (!baseInit) return baseFetch;
	return async (url, init) => {
		return baseFetch(url, {
			...baseInit,
			...init,
			headers: init?.headers ? {
				...normalizeHeaders(baseInit.headers),
				...normalizeHeaders(init.headers)
			} : baseInit.headers
		});
	};
}

//#endregion
//#region ../core-internal/src/shared/uriTemplate.ts
const MAX_TEMPLATE_LENGTH = 1e6;
const MAX_VARIABLE_LENGTH = 1e6;
const MAX_TEMPLATE_EXPRESSIONS = 1e4;
const MAX_REGEX_LENGTH = 1e6;
var UriTemplate = class UriTemplate {
	/**
	* Returns true if the given string contains any URI template expressions.
	* A template expression is a sequence of characters enclosed in curly braces,
	* like `{foo}` or `{?bar}`.
	*/
	static isTemplate(str) {
		return /\{[^}\s]+\}/.test(str);
	}
	static validateLength(str, max, context) {
		if (str.length > max) throw new Error(`${context} exceeds maximum length of ${max} characters (got ${str.length})`);
	}
	template;
	parts;
	get variableNames() {
		return this.parts.flatMap((part) => typeof part === "string" ? [] : part.names);
	}
	constructor(template) {
		UriTemplate.validateLength(template, MAX_TEMPLATE_LENGTH, "Template");
		this.template = template;
		this.parts = this.parse(template);
	}
	toString() {
		return this.template;
	}
	parse(template) {
		const parts = [];
		let currentText = "";
		let i = 0;
		let expressionCount = 0;
		while (i < template.length) if (template[i] === "{") {
			if (currentText) {
				parts.push(currentText);
				currentText = "";
			}
			const end = template.indexOf("}", i);
			if (end === -1) throw new Error("Unclosed template expression");
			expressionCount++;
			if (expressionCount > MAX_TEMPLATE_EXPRESSIONS) throw new Error(`Template contains too many expressions (max ${MAX_TEMPLATE_EXPRESSIONS})`);
			const expr = template.slice(i + 1, end);
			const operator = this.getOperator(expr);
			const exploded = expr.includes("*");
			const names = this.getNames(expr);
			const name = names[0];
			for (const name$1 of names) UriTemplate.validateLength(name$1, MAX_VARIABLE_LENGTH, "Variable name");
			parts.push({
				name,
				operator,
				names,
				exploded
			});
			i = end + 1;
		} else {
			currentText += template[i];
			i++;
		}
		if (currentText) parts.push(currentText);
		return parts;
	}
	getOperator(expr) {
		return [
			"+",
			"#",
			".",
			"/",
			"?",
			"&"
		].find((op) => expr.startsWith(op)) || "";
	}
	getNames(expr) {
		const operator = this.getOperator(expr);
		return expr.slice(operator.length).split(",").map((name) => name.replace("*", "").trim()).filter((name) => name.length > 0);
	}
	encodeValue(value, operator) {
		UriTemplate.validateLength(value, MAX_VARIABLE_LENGTH, "Variable value");
		if (operator === "+" || operator === "#") return encodeURI(value);
		return encodeURIComponent(value);
	}
	expandPart(part, variables) {
		if (part.operator === "?" || part.operator === "&") {
			const pairs = part.names.map((name) => {
				const value$1 = variables[name];
				if (value$1 === void 0) return "";
				return `${name}=${Array.isArray(value$1) ? value$1.map((v) => this.encodeValue(v, part.operator)).join(",") : this.encodeValue(value$1.toString(), part.operator)}`;
			}).filter((pair) => pair.length > 0);
			if (pairs.length === 0) return "";
			return (part.operator === "?" ? "?" : "&") + pairs.join("&");
		}
		if (part.names.length > 1) {
			const values = part.names.map((name) => variables[name]).filter((v) => v !== void 0);
			if (values.length === 0) return "";
			return values.map((v) => Array.isArray(v) ? v[0] : v).join(",");
		}
		const value = variables[part.name];
		if (value === void 0) return "";
		const encoded = (Array.isArray(value) ? value : [value]).map((v) => this.encodeValue(v, part.operator));
		switch (part.operator) {
			case "": return encoded.join(",");
			case "+": return encoded.join(",");
			case "#": return "#" + encoded.join(",");
			case ".": return "." + encoded.join(".");
			case "/": return "/" + encoded.join("/");
			default: return encoded.join(",");
		}
	}
	expand(variables) {
		let result = "";
		let hasQueryParam = false;
		for (const part of this.parts) {
			if (typeof part === "string") {
				result += part;
				continue;
			}
			const expanded = this.expandPart(part, variables);
			if (!expanded) continue;
			result += (part.operator === "?" || part.operator === "&") && hasQueryParam ? expanded.replace("?", "&") : expanded;
			if (part.operator === "?" || part.operator === "&") hasQueryParam = true;
		}
		return result;
	}
	escapeRegExp(str) {
		return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
	}
	partToRegExp(part) {
		const patterns = [];
		for (const name$1 of part.names) UriTemplate.validateLength(name$1, MAX_VARIABLE_LENGTH, "Variable name");
		if (part.operator === "?" || part.operator === "&") {
			for (let i = 0; i < part.names.length; i++) {
				const name$1 = part.names[i];
				const prefix = i === 0 ? "\\" + part.operator : "&";
				patterns.push({
					pattern: prefix + this.escapeRegExp(name$1) + "=([^&]+)",
					name: name$1
				});
			}
			return patterns;
		}
		let pattern;
		const name = part.name;
		switch (part.operator) {
			case "":
				pattern = part.exploded ? "([^/,]+(?:,[^/,]+)*)" : "([^/,]+)";
				break;
			case "+":
			case "#":
				pattern = "(.+)";
				break;
			case ".":
				pattern = String.raw`\.([^/,]+)`;
				break;
			case "/":
				pattern = "/" + (part.exploded ? "([^/,]+(?:,[^/,]+)*)" : "([^/,]+)");
				break;
			default: pattern = "([^/]+)";
		}
		patterns.push({
			pattern,
			name
		});
		return patterns;
	}
	match(uri) {
		UriTemplate.validateLength(uri, MAX_TEMPLATE_LENGTH, "URI");
		let pattern = "^";
		const names = [];
		for (const part of this.parts) if (typeof part === "string") pattern += this.escapeRegExp(part);
		else {
			const patterns = this.partToRegExp(part);
			for (const { pattern: partPattern, name } of patterns) {
				pattern += partPattern;
				names.push({
					name,
					exploded: part.exploded
				});
			}
		}
		pattern += "$";
		UriTemplate.validateLength(pattern, MAX_REGEX_LENGTH, "Generated regex pattern");
		const regex = new RegExp(pattern);
		const match = uri.match(regex);
		if (!match) return null;
		const result = {};
		for (const [i, name_] of names.entries()) {
			const { name, exploded } = name_;
			const value = match[i + 1];
			const cleanName = name.replace("*", "");
			result[cleanName] = exploded && value.includes(",") ? value.split(",") : value;
		}
		return result;
	}
};

//#endregion
//#region ../core-internal/src/util/inMemory.ts
/**
* In-memory transport for creating clients and servers that talk to each other within the same process.
*
* Intended for testing and development. For production in-process connections, use
* `StreamableHTTPClientTransport` against a local server URL.
*/
var InMemoryTransport = class InMemoryTransport {
	_otherTransport;
	_messageQueue = [];
	_closed = false;
	onclose;
	onerror;
	onmessage;
	sessionId;
	/**
	* Creates a pair of linked in-memory transports that can communicate with each other. One should be passed to a {@linkcode @modelcontextprotocol/client!client/client.Client | Client} and one to a {@linkcode @modelcontextprotocol/server!server/server.Server | Server}.
	*/
	static createLinkedPair() {
		const clientTransport = new InMemoryTransport();
		const serverTransport = new InMemoryTransport();
		clientTransport._otherTransport = serverTransport;
		serverTransport._otherTransport = clientTransport;
		return [clientTransport, serverTransport];
	}
	async start() {
		while (this._messageQueue.length > 0) {
			const queuedMessage = this._messageQueue.shift();
			this.onmessage?.(queuedMessage.message, queuedMessage.extra);
		}
	}
	async close() {
		if (this._closed) return;
		this._closed = true;
		const other = this._otherTransport;
		this._otherTransport = void 0;
		try {
			await other?.close();
		} finally {
			this.onclose?.();
		}
	}
	/**
	* Sends a message with optional auth info.
	* This is useful for testing authentication scenarios.
	*/
	async send(message, options) {
		if (!this._otherTransport) throw new SdkError(SdkErrorCode.NotConnected, "Not connected");
		if (this._otherTransport.onmessage) this._otherTransport.onmessage(message, { authInfo: options?.authInfo });
		else this._otherTransport._messageQueue.push({
			message,
			extra: { authInfo: options?.authInfo }
		});
	}
};

//#endregion
//#region ../core-internal/src/util/schema.ts
/**
* Internal Zod schema utilities for protocol handling.
* These are used internally by the SDK for protocol message validation.
*/
/**
* Parses data against a Zod schema (synchronous).
* Returns a discriminated union with success/error.
*/
function parseSchema(schema, data) {
	return z.safeParse(schema, data);
}

//#endregion
//#region ../core-internal/src/util/zodCompat.ts
/**
* Zod-specific helpers for the v1-compat raw-shape shorthand on
* `registerTool`/`registerPrompt`. Kept separate from `standardSchema.ts` so
* that file stays library-agnostic per the Standard Schema spec.
*/
function isZodV4Schema(v) {
	return typeof v === "object" && v !== null && "_zod" in v;
}
function looksLikeZodV3(v) {
	return typeof v === "object" && v !== null && !("_zod" in v) && "_def" in v && typeof v._def?.typeName === "string";
}
/**
* Detects a "raw shape" — a plain object whose values are Zod field schemas,
* e.g. `{ name: z.string() }`. Powers the auto-wrap in
* {@linkcode normalizeRawShapeSchema}, which wraps with `z.object()`, so only
* Zod values are supported.
*
* @internal
*/
function isZodRawShape(obj) {
	if (typeof obj !== "object" || obj === null) return false;
	if (isStandardSchema(obj)) return false;
	const proto = Object.getPrototypeOf(obj);
	if (proto !== Object.prototype && proto !== null) return false;
	return Object.values(obj).every((v) => isZodV4Schema(v));
}
/**
* Accepts either a {@linkcode StandardSchemaWithJSON} or a raw Zod shape
* `{ field: z.string() }` and returns a {@linkcode StandardSchemaWithJSON}.
* Raw shapes are wrapped with `z.object()` so the rest of the pipeline sees a
* uniform schema type; already-wrapped schemas pass through unchanged.
*
* @internal
*/
function normalizeRawShapeSchema(schema) {
	if (schema === void 0) return void 0;
	if (isZodRawShape(schema)) return z.object(schema);
	if (typeof schema === "object" && schema !== null && !isStandardSchema(schema) && Object.values(schema).some((v) => looksLikeZodV3(v))) throw new TypeError("Raw-shape inputSchema/outputSchema/argsSchema fields must be Zod v4 schemas. Got a Zod v3 field schema. Import from `zod/v4` (or upgrade your zod import), or wrap with `z.object({...})` yourself.");
	if (!isStandardSchema(schema)) throw new TypeError("inputSchema/outputSchema/argsSchema must be a Standard Schema (e.g. z.object({...})) or a raw Zod shape ({ field: z.string() }).");
	return schema;
}

//#endregion
//#region ../core-internal/src/validators/fromJsonSchema.ts
/**
* Wrap a raw JSON Schema object as a {@linkcode StandardSchemaWithJSON} so it can be
* passed to `registerTool` / `registerPrompt`. Use this when you already have JSON
* Schema (e.g. from TypeBox, or hand-written) and want to register it without going
* through a Standard Schema library.
*
* The callback arguments will be typed `unknown` (raw JSON Schema has no TypeScript
* types attached). Cast at the call site, or use the generic `fromJsonSchema<MyType>(...)`.
*
* @param schema - A JSON Schema object describing the expected shape
* @param validator - A validator provider. When importing `fromJsonSchema` from
*   `@modelcontextprotocol/server` or `@modelcontextprotocol/client`, a runtime-appropriate
*   default is provided automatically (AJV on Node.js, CfWorker on edge runtimes).
*
* @example
* ```ts source="./fromJsonSchema.examples.ts#fromJsonSchema_basicUsage"
* const inputSchema = fromJsonSchema<{ name: string }>(
*     { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
*     validator
* );
* // Use with server.registerTool('greet', { inputSchema }, handler)
* ```
*/
function fromJsonSchema(schema, validator) {
	const check = validator.getValidator(schema);
	return { "~standard": {
		version: 1,
		vendor: "mcp",
		jsonSchema: {
			input: () => schema,
			output: () => schema
		},
		validate: (data) => {
			const result = check(data);
			return result.valid ? { value: result.data } : { issues: [{ message: result.errorMessage }] };
		}
	} };
}

//#endregion
//#region src/server/serverEventBus.ts
/**
* A `ServerEventBus` backed by an in-process listener set.
*
* `publish()` delivers synchronously to the live listener set (a listener
* unsubscribing itself mid-dispatch is safe; the entry's listen-router
* listeners never unsubscribe peers). A throwing listener does not stop
* delivery to the others.
*/
var InMemoryServerEventBus = class {
	_listeners = /* @__PURE__ */ new Set();
	/**
	* @param onerror - Optional callback for errors thrown by listeners
	*   during dispatch.
	*/
	constructor(onerror) {
		this.onerror = onerror;
	}
	publish(event) {
		for (const listener of this._listeners) try {
			listener(event);
		} catch (error) {
			this.onerror?.(error instanceof Error ? error : new Error(String(error)));
		}
	}
	subscribe(listener) {
		this._listeners.add(listener);
		let live = true;
		return () => {
			if (!live) return;
			live = false;
			this._listeners.delete(listener);
		};
	}
	/** The number of currently registered listeners (test/introspection only — the routers track capacity via their own open-subscription set). */
	get listenerCount() {
		return this._listeners.size;
	}
};
/** Build a {@linkcode ServerNotifier} over a bus. */
function createServerNotifier(bus) {
	return {
		toolsChanged: () => bus.publish({ kind: "tools_list_changed" }),
		promptsChanged: () => bus.publish({ kind: "prompts_list_changed" }),
		resourcesChanged: () => bus.publish({ kind: "resources_list_changed" }),
		resourceUpdated: (uri) => bus.publish({
			kind: "resource_updated",
			uri
		})
	};
}
/**
* Whether a `subscriptions/listen` filter accepts a given change event.
*
* Pure: no I/O, no mutation. The filter governs ONLY the four
* subscription-gated change types — non-gated notifications never reach the
* bus and are not modeled here.
*
* `resource_updated` matches only when `resourceSubscriptions` is present and
* contains the event's URI exactly (per the spec: "for these resource URIs").
*/
function listenFilterAccepts(filter, event) {
	switch (event.kind) {
		case "tools_list_changed": return filter.toolsListChanged === true;
		case "prompts_list_changed": return filter.promptsListChanged === true;
		case "resources_list_changed": return filter.resourcesListChanged === true;
		case "resource_updated": return filter.resourceSubscriptions !== void 0 && filter.resourceSubscriptions.includes(event.uri);
	}
}
/**
* The honored subset of a requested filter: keeps only the fields the client
* explicitly opted in to (drops `false` and absent fields), narrowed against
* the server's declared capabilities when supplied. The serving entry sends
* this back in `notifications/subscriptions/acknowledged` so the ack reflects
* what the server can actually deliver.
*
* - `toolsListChanged` is honored only when `capabilities.tools.listChanged`
*   is advertised; likewise `promptsListChanged` / `resourcesListChanged`.
* - `resourceSubscriptions` is honored only when
*   `capabilities.resources.subscribe` is advertised.
*
* `capabilities` is optional on this pure helper for test convenience only —
* both wired routers REQUIRE capabilities at the call site (the HTTP router's
* `serve()` takes a required parameter; `StdioListenRouter.serve()` throws
* before `setServerCapabilities()` was called), so the fail-open
* `undefined → honor everything` branch is never reachable on a wired entry.
*/
function honoredSubset(requested, capabilities) {
	const honored = {};
	const allow = (bit) => capabilities === void 0 || bit === true;
	if (requested.toolsListChanged === true && allow(capabilities?.tools?.listChanged)) honored.toolsListChanged = true;
	if (requested.promptsListChanged === true && allow(capabilities?.prompts?.listChanged)) honored.promptsListChanged = true;
	if (requested.resourcesListChanged === true && allow(capabilities?.resources?.listChanged)) honored.resourcesListChanged = true;
	if (requested.resourceSubscriptions !== void 0 && requested.resourceSubscriptions.length > 0 && allow(capabilities?.resources?.subscribe)) honored.resourceSubscriptions = [...requested.resourceSubscriptions];
	return honored;
}
/** Map a {@linkcode ServerEvent} onto its wire notification `{method, params}`. */
function serverEventToNotification(event) {
	switch (event.kind) {
		case "tools_list_changed": return { method: "notifications/tools/list_changed" };
		case "prompts_list_changed": return { method: "notifications/prompts/list_changed" };
		case "resources_list_changed": return { method: "notifications/resources/list_changed" };
		case "resource_updated": return {
			method: "notifications/resources/updated",
			params: { uri: event.uri }
		};
	}
}

//#endregion
//#region src/server/listenRouter.ts
/** Default SSE comment-frame keepalive interval for listen streams. */
const DEFAULT_LISTEN_KEEPALIVE_MS = 15e3;
/** Default capacity guard: refuse a new subscription when this many are already open. */
const DEFAULT_MAX_SUBSCRIPTIONS = 1024;
function jsonRpcError(id, code, message) {
	return Response.json({
		jsonrpc: "2.0",
		error: {
			code,
			message
		},
		id
	}, { status: 200 });
}
/** Stamp the subscription id onto a notification's `_meta`. Non-mutating. */
function stampSubscriptionId(notification, subscriptionId) {
	return {
		method: notification.method,
		params: {
			...notification.params,
			_meta: {
				...notification.params?._meta,
				[SUBSCRIPTION_ID_META_KEY]: subscriptionId
			}
		}
	};
}
/**
* Read the requested filter off a `subscriptions/listen` request body.
* Returns the validated filter, or `undefined` when `params.notifications`
* is absent or fails the schema (the caller answers `-32602` — the spec
* marks `notifications` REQUIRED on the listen request).
*/
function parseListenFilter(message) {
	const outcome = codecForVersion(MODERN_WIRE_REVISION).validateRequest("subscriptions/listen", message);
	return outcome.ok ? outcome.value.params?.notifications : void 0;
}
function createListenRouter(options) {
	const { bus, onerror } = options;
	const maxSubscriptions = options.maxSubscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS;
	const keepAliveMs = options.keepAliveMs ?? DEFAULT_LISTEN_KEEPALIVE_MS;
	const open = /* @__PURE__ */ new Set();
	function serve(message, signal, capabilities) {
		if (open.size >= maxSubscriptions) {
			onerror?.(/* @__PURE__ */ new Error(`subscriptions/listen refused: subscription limit reached (${maxSubscriptions})`));
			return jsonRpcError(message.id, -32603, "Subscription limit reached");
		}
		const filter = parseListenFilter(message);
		if (filter === void 0) return jsonRpcError(message.id, -32602, "Invalid params: 'notifications' is required and must be a valid SubscriptionFilter");
		const honored = honoredSubset(filter, capabilities);
		const subscriptionId = message.id;
		const encoder = new TextEncoder();
		let controller;
		let closed = false;
		let unsubscribe;
		let keepAliveTimer;
		let abortCleanup;
		const writeFrame = (frame) => {
			if (closed) return;
			try {
				controller.enqueue(encoder.encode(frame));
			} catch (error) {
				onerror?.(error instanceof Error ? error : new Error(String(error)));
			}
		};
		const writeNotification = (method, params) => {
			writeFrame(`event: message\ndata: ${JSON.stringify({
				jsonrpc: "2.0",
				method,
				params
			})}\n\n`);
		};
		const teardown = (graceful) => {
			if (closed) return;
			if (graceful) writeFrame(`event: message\ndata: ${JSON.stringify({
				jsonrpc: "2.0",
				id: subscriptionId,
				result: {
					resultType: "complete",
					_meta: { [SUBSCRIPTION_ID_META_KEY]: subscriptionId }
				}
			})}\n\n`);
			closed = true;
			unsubscribe?.();
			if (keepAliveTimer !== void 0) clearInterval(keepAliveTimer);
			abortCleanup?.();
			open.delete(teardown);
			try {
				controller.close();
			} catch {}
		};
		const readable = new ReadableStream({
			start(streamController) {
				controller = streamController;
				const ack = stampSubscriptionId({
					method: "notifications/subscriptions/acknowledged",
					params: { notifications: honored }
				}, subscriptionId);
				writeNotification(ack.method, ack.params);
				unsubscribe = bus.subscribe((event) => {
					if (closed || !listenFilterAccepts(honored, event)) return;
					const note = stampSubscriptionId(serverEventToNotification(event), subscriptionId);
					writeNotification(note.method, note.params);
				});
				if (keepAliveMs > 0) {
					keepAliveTimer = setInterval(() => writeFrame(": keepalive\n\n"), keepAliveMs);
					keepAliveTimer.unref?.();
				}
				open.add(teardown);
			},
			cancel() {
				teardown(false);
			}
		});
		if (signal !== void 0) if (signal.aborted) teardown(false);
		else {
			const onAbort = () => teardown(false);
			signal.addEventListener("abort", onAbort, { once: true });
			abortCleanup = () => signal.removeEventListener("abort", onAbort);
		}
		return new Response(readable, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no"
			}
		});
	}
	return {
		serve,
		closeAll() {
			for (const teardown of open) teardown(true);
		},
		get openCount() {
			return open.size;
		}
	};
}
const CHANGE_NOTIFICATION_METHODS = new Set([
	"notifications/tools/list_changed",
	"notifications/prompts/list_changed",
	"notifications/resources/list_changed",
	"notifications/resources/updated"
]);
/**
* Per-connection listen state for the stdio entry. One instance is held by
* `serveStdio` for the connection lifetime; it routes inbound
* `subscriptions/listen` / `notifications/cancelled` and rewrites outbound
* change notifications onto the active subscriptions. No bus — the long-lived
* pinned instance's existing `send*ListChanged()` calls feed straight into
* `routeOutbound()`.
*/
var StdioListenRouter = class {
	/** Active subscriptions, keyed by the listen request's JSON-RPC id verbatim. */
	_subs = /* @__PURE__ */ new Map();
	/**
	* The serving instance's declared capabilities. Filled in by the entry
	* once the modern instance is constructed (the router is created before
	* the instance exists), so the acknowledged filter is narrowed against
	* what the server can actually deliver.
	*/
	_serverCapabilities;
	constructor(_maxSubscriptions = DEFAULT_MAX_SUBSCRIPTIONS, serverCapabilities) {
		this._maxSubscriptions = _maxSubscriptions;
		this._serverCapabilities = serverCapabilities;
	}
	/**
	* Record the serving instance's declared capabilities once it has been
	* constructed. Called by `serveStdio`'s connect path; subsequent
	* `serve()` calls narrow the honored filter against these.
	*/
	setServerCapabilities(capabilities) {
		this._serverCapabilities = capabilities;
	}
	/** Whether `id` is an active listen subscription on this connection. */
	has(id) {
		return this._subs.has(id);
	}
	/**
	* Serve one inbound `subscriptions/listen` request: registers the
	* subscription and returns the stamped acknowledged notification (or, on
	* capacity / params rejection, the in-band JSON-RPC error response).
	*
	* @throws when called before {@linkcode setServerCapabilities} (or the
	* constructor) has supplied the serving instance's capabilities. Honoring a
	* filter without knowing the server's advertised capabilities would fail
	* open (deliver unadvertised types); the entry guarantees capabilities are
	* set before any listen request is routed here.
	*/
	serve(message) {
		if (this._serverCapabilities === void 0) throw new Error("StdioListenRouter.serve() called before setServerCapabilities(); refusing to honor a filter without capabilities");
		if (this._subs.size >= this._maxSubscriptions) return {
			jsonrpc: "2.0",
			id: message.id,
			error: {
				code: -32603,
				message: "Subscription limit reached"
			}
		};
		const filter = parseListenFilter(message);
		if (filter === void 0) return {
			jsonrpc: "2.0",
			id: message.id,
			error: {
				code: -32602,
				message: "Invalid params: 'notifications' is required and must be a valid SubscriptionFilter"
			}
		};
		const honored = honoredSubset(filter, this._serverCapabilities);
		this._subs.set(message.id, honored);
		return stampSubscriptionId({
			method: "notifications/subscriptions/acknowledged",
			params: { notifications: honored }
		}, message.id);
	}
	/**
	* Tear down one subscription (inbound `notifications/cancelled`). Returns
	* `true` when a subscription was removed. After this call NOTHING further
	* is delivered for that subscription id (the post-cancel hardening).
	*/
	cancel(id) {
		return this._subs.delete(id);
	}
	/**
	* Route an outbound notification through the active subscriptions.
	*
	* - For a subscription-gated change notification, returns one stamped copy
	*   per subscription that opted in to it (an empty array means it is
	*   dropped — the modern era never delivers an un-requested change type).
	* - For any other outbound message, returns `'passthrough'` (the entry
	*   forwards it as-is).
	*/
	routeOutbound(message) {
		if (!CHANGE_NOTIFICATION_METHODS.has(message.method)) return "passthrough";
		const uriParam = message.params?.["uri"];
		const uri = typeof uriParam === "string" ? uriParam : void 0;
		const event = notificationToServerEvent(message.method, uri);
		const out = [];
		for (const [subscriptionId, filter] of this._subs) if (listenFilterAccepts(filter, event)) out.push(stampSubscriptionId({
			method: message.method,
			params: message.params ?? {}
		}, subscriptionId));
		return out;
	}
	/**
	* Server-side graceful teardown of every active subscription: returns the
	* empty `subscriptions/listen` JSON-RPC result for each subscription id —
	* the spec's graceful-close signal — for the entry to emit before closing
	* the wire. Clears the set so nothing further is delivered.
	*/
	teardownAll() {
		const out = [];
		for (const id of this._subs.keys()) out.push({
			jsonrpc: "2.0",
			id,
			result: {
				resultType: "complete",
				_meta: { [SUBSCRIPTION_ID_META_KEY]: id }
			}
		});
		this._subs.clear();
		return out;
	}
};
function notificationToServerEvent(method, uri) {
	switch (method) {
		case "notifications/tools/list_changed": return { kind: "tools_list_changed" };
		case "notifications/prompts/list_changed": return { kind: "prompts_list_changed" };
		case "notifications/resources/list_changed": return { kind: "resources_list_changed" };
		default: return {
			kind: "resource_updated",
			uri: uri ?? ""
		};
	}
}

//#endregion
//#region src/server/legacyInputRequiredShim.ts
/**
* Default handler re-entries per originating request — tighter than the
* client driver's 10 because the shim holds a live wire request open.
*/
const DEFAULT_LEGACY_SHIM_MAX_ROUNDS = 8;
/** Default per-leg timeout: legs are human-paced, so the 60s protocol default is wrong. */
const DEFAULT_LEGACY_SHIM_ROUND_TIMEOUT_MS = 6e5;
/** Resolves and validates `ServerOptions.inputRequired`, failing loudly at construction time. */
function resolveLegacyShimOptions(options) {
	if (options?.maxRounds !== void 0 && (!Number.isInteger(options.maxRounds) || options.maxRounds < 1)) throw new RangeError(`inputRequired.maxRounds must be a positive integer (got ${options.maxRounds})`);
	if (options?.roundTimeoutMs !== void 0 && (!Number.isFinite(options.roundTimeoutMs) || options.roundTimeoutMs <= 0)) throw new RangeError(`inputRequired.roundTimeoutMs must be a positive number (got ${options.roundTimeoutMs})`);
	return {
		maxRounds: options?.maxRounds ?? DEFAULT_LEGACY_SHIM_MAX_ROUNDS,
		roundTimeoutMs: options?.roundTimeoutMs ?? DEFAULT_LEGACY_SHIM_ROUND_TIMEOUT_MS,
		legacyShim: options?.legacyShim ?? true
	};
}
/**
* Validates one `inputRequests` entry: malformed or unknown kinds are server
* bugs and fail loudly on both eras. Shared by the modern seam's capability
* check and the shim's gate.
*/
function coerceEmbeddedInputRequest(method, key, entry) {
	if (entry === null || typeof entry !== "object" || typeof entry.method !== "string") throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an invalid input request '${key}': each inputRequests entry must be an embedded elicitation/create, sampling/createMessage, or roots/list request`);
	const embedded = entry;
	const required = requiredClientCapabilitiesForInputRequest(embedded);
	if (required === void 0) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input request '${key}' of kind '${embedded.method}', which is not an embedded request the 2026-07-28 revision defines`);
	return {
		embedded,
		required
	};
}
/**
* The 2025-11-25 URL-mode wire shape requires an `elicitationId`; the 2026
* in-band shape has none, so URL legs mint one (CSPRNG-backed, with a
* getRandomValues fallback for runtimes without `randomUUID`).
*/
function syntheticElicitationId() {
	const webCrypto = globalThis.crypto;
	if (webCrypto?.randomUUID !== void 0) return webCrypto.randomUUID();
	const bytes = new Uint8Array(16);
	webCrypto.getRandomValues(bytes);
	bytes[6] = bytes[6] & 15 | 64;
	bytes[8] = bytes[8] & 63 | 128;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Per-family surfacing: tools/call → isError result (the 2025 idiom); prompts/resources → JSON-RPC error. */
function legacyShimFailure(method, message) {
	if (method === "tools/call") return {
		content: [{
			type: "text",
			text: message
		}],
		isError: true
	};
	throw new ProtocolError(ProtocolErrorCode.InternalError, message);
}
/** The fulfilment loop — see the module doc for the contract. */
var LegacyInputRequiredShim = class {
	constructor(_host) {
		this._host = _host;
	}
	async fulfill(method, handler, request, ctx, firstResult) {
		const { maxRounds, roundTimeoutMs } = this._host;
		const outerSignal = ctx.mcpReq.signal;
		let current = firstResult;
		let round = 0;
		while (true) {
			round += 1;
			if (round > maxRounds) return legacyShimFailure(method, inputRequiredRoundsExceededMessage(method, maxRounds));
			const inputRequests = current.inputRequests;
			const hasInputRequests = inputRequests != null && Object.keys(inputRequests).length > 0;
			const requestState = typeof current.requestState === "string" ? current.requestState : void 0;
			if (!hasInputRequests && requestState === void 0) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result with neither inputRequests nor requestState (every InputRequiredResult must include at least one of the two)`);
			let responses;
			if (hasInputRequests) {
				const declared = this._host.resolvedClientCapabilities(ctx);
				const coerced = [];
				for (const [key, entry] of Object.entries(inputRequests)) {
					const { embedded, required } = coerceEmbeddedInputRequest(method, key, entry);
					if (embedded.method !== "roots/list" && embedded.params === void 0) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input request '${key}' of kind '${embedded.method}' without params`);
					if (missingClientCapabilities(required, declared) !== void 0) return legacyShimFailure(method, `Cannot request input '${key}' (${embedded.method}): the client on this 2025-era connection did not declare the required capability${declared === void 0 ? " (no client capabilities are available on this connection — per-request legacy serving cannot receive server-to-client requests)" : ""}`);
					coerced.push([key, embedded]);
				}
				const roundAbort = linkedRoundAbort(outerSignal);
				try {
					const legOptions = {
						relatedRequestId: ctx.mcpReq.id,
						timeout: roundTimeoutMs,
						resetTimeoutOnProgress: true,
						onprogress: () => {},
						signal: roundAbort.signal
					};
					const fulfilled = await Promise.all(coerced.map(async ([key, embedded]) => {
						try {
							return [key, await this._dispatchLeg(embedded, legOptions)];
						} catch (error) {
							roundAbort.abort(error);
							throw error;
						}
					}));
					responses = Object.fromEntries(fulfilled);
				} catch (error) {
					if (outerSignal.aborted) throw error;
					return legacyShimFailure(method, `Fulfilling input required by '${method}' failed: ${error instanceof Error ? error.message : String(error)}`);
				} finally {
					roundAbort.dispose();
				}
			} else await sleep(REQUEST_STATE_ONLY_LEG_PACING_MS, outerSignal);
			let ctxNext = {
				...ctx,
				mcpReq: {
					...ctx.mcpReq,
					inputResponses: responses,
					droppedInputResponseKeys: void 0,
					requestState: requestStateAccessor(requestState)
				}
			};
			if (requestState !== void 0) {
				const decoded = await this._host.verifyRequestState(requestState, ctxNext, method);
				if (decoded !== void 0) ctxNext = withRequestStateValue(ctxNext, decoded);
			}
			const next = await handler(request, ctxNext);
			if (!isInputRequiredResult(next)) return next;
			current = next;
		}
	}
	/** Routes one embedded request through the host's existing 2025-era senders (gate already ran). */
	async _dispatchLeg(embedded, options) {
		switch (embedded.method) {
			case "elicitation/create": {
				let params = embedded.params;
				if (params.mode === "url" && params.elicitationId === void 0) params = {
					...params,
					elicitationId: syntheticElicitationId()
				};
				return await this._host.sendElicitation(params, options);
			}
			case "sampling/createMessage": return await this._host.sendSampling(embedded.params, options);
			case "roots/list": return await this._host.listRoots(embedded.params, options);
		}
	}
};

//#endregion
//#region src/server/server.ts
/**
* The request methods whose 2026-07-28 result vocabulary includes
* `input_required` (the multi round-trip methods). Returning an
* input-required result from any other handler is a server bug.
*/
const INPUT_REQUIRED_CAPABLE_METHODS = new Set([
	"tools/call",
	"prompts/get",
	"resources/read"
]);
let writeClientIdentity;
let installDiscoverHandler;
/**
* Package-internal: backfills the connection-scoped client-identity fields of a
* per-request server instance from the request's validated `_meta` envelope, so the
* (deprecated) {@linkcode Server.getClientCapabilities} / {@linkcode Server.getClientVersion}
* accessors keep answering on instances that never see an `initialize` handshake.
* Not public API.
*/
function seedClientIdentityFromEnvelope(server, identity) {
	writeClientIdentity(server, identity);
}
/**
* Package-internal: installs the modern-only `server/discover` handler on an instance
* the HTTP entry has marked as serving the 2026-07-28 era, and makes sure the modern
* revisions the entry serves appear in the instance's supported-versions list (so the
* discover advertisement and version-mismatch errors name them). Idempotent.
* Hand-constructed instances are unaffected: nothing else calls this, so they keep
* answering `-32601` unless their own supported-versions list opts into a modern
* revision. Not public API.
*/
function installModernOnlyHandlers(server, servedModernVersions) {
	installDiscoverHandler(server, servedModernVersions);
}
/**
* An MCP server on top of a pluggable transport.
*
* This server will automatically respond to the initialization flow as initiated from the client.
*
* @deprecated Use {@linkcode server/mcp.McpServer | McpServer} instead for the high-level API. Only use `Server` for advanced use cases.
*/
var Server = class extends Protocol {
	_clientCapabilities;
	_clientVersion;
	static {
		writeClientIdentity = (server, identity) => {
			if (identity.clientCapabilities !== void 0) server._clientCapabilities = identity.clientCapabilities;
			if (identity.clientInfo !== void 0) server._clientVersion = identity.clientInfo;
		};
		installDiscoverHandler = (server, servedModernVersions) => {
			const missing = servedModernVersions.filter((version) => !server._supportedProtocolVersions.includes(version));
			if (missing.length > 0) server._supportedProtocolVersions = [...server._supportedProtocolVersions, ...missing];
			server.setRequestHandler("server/discover", () => server._ondiscover());
		};
	}
	_capabilities;
	_instructions;
	_jsonSchemaValidator;
	_cacheHints;
	_requestStateVerify;
	_inputRequiredServing;
	_legacyShim;
	/** Lazily-built legacy shim; the loop lives in legacyInputRequiredShim.ts behind a narrow host contract. */
	_legacyInputRequiredShim() {
		return this._legacyShim ??= new LegacyInputRequiredShim({
			maxRounds: this._inputRequiredServing.maxRounds,
			roundTimeoutMs: this._inputRequiredServing.roundTimeoutMs,
			resolvedClientCapabilities: (ctx) => this._inputRequestCapabilityView(ctx),
			verifyRequestState: (state, ctx, method) => this._verifyRequestState(state, ctx, method),
			sendElicitation: (params, options) => this._sendElicitationLeg(params, options, { validateAcceptedContent: false }),
			sendSampling: (params, options) => this.createMessage(params, options),
			listRoots: (params, options) => this.listRoots(params, options)
		});
	}
	/**
	* Callback for when initialization has fully completed (i.e., the client has sent an `notifications/initialized` notification).
	*/
	oninitialized;
	/**
	* Initializes this server with the given name and version information.
	*/
	constructor(_serverInfo, options) {
		super(options);
		this._serverInfo = _serverInfo;
		this._capabilities = options?.capabilities ? { ...options.capabilities } : {};
		this._instructions = options?.instructions;
		this._jsonSchemaValidator = options?.jsonSchemaValidator ?? new DefaultJsonSchemaValidator();
		this._requestStateVerify = options?.requestState?.verify;
		this._inputRequiredServing = resolveLegacyShimOptions(options?.inputRequired);
		if (options?.cacheHints !== void 0) {
			for (const [operation, hint] of Object.entries(options.cacheHints)) if (hint !== void 0) assertValidCacheHint(hint, `cacheHints['${operation}']`);
			this._cacheHints = options.cacheHints;
		}
		this.setRequestHandler("initialize", (request) => this._oninitialize(request));
		this.setNotificationHandler("notifications/initialized", () => this.oninitialized?.());
		if (modernProtocolVersions(this._supportedProtocolVersions).length > 0) this.setRequestHandler("server/discover", () => this._ondiscover());
		if (this._capabilities.logging) this._registerLoggingHandler();
	}
	/**
	* Registers the built-in `logging/setLevel` request handler.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Remains functional during the deprecation window (at least twelve months).
	* Migrate to stderr logging (STDIO servers) or OpenTelemetry.
	*/
	_registerLoggingHandler() {
		this.setRequestHandler("logging/setLevel", async (request, ctx) => {
			const transportSessionId = ctx.sessionId || ctx.http?.req?.headers.get("mcp-session-id") || void 0;
			const { level } = request.params;
			const parseResult = parseSchema(LoggingLevelSchema, level);
			if (parseResult.success) this._loggingLevels.set(transportSessionId, parseResult.data);
			return {};
		});
	}
	buildContext(ctx, transportInfo) {
		const hasHttpInfo = ctx.http || transportInfo?.request || transportInfo?.closeSSEStream || transportInfo?.closeStandaloneSSEStream;
		return {
			...ctx,
			mcpReq: {
				...ctx.mcpReq,
				log: (level, data, logger) => {
					if (!this._capabilities.logging) return Promise.resolve();
					let threshold;
					if (this._servedModernEra()) {
						threshold = ctx.mcpReq.envelope?.[LOG_LEVEL_META_KEY];
						if (threshold === void 0) return Promise.resolve();
					} else threshold = this._loggingLevels.get(ctx.sessionId) ?? this._loggingLevels.get(void 0);
					if (threshold !== void 0 && this.LOG_LEVEL_SEVERITY.get(level) < this.LOG_LEVEL_SEVERITY.get(threshold)) return Promise.resolve();
					return ctx.mcpReq.notify({
						method: "notifications/message",
						params: {
							level,
							data,
							logger
						}
					});
				},
				elicitInput: (params, options) => this.elicitInput(params, options),
				requestSampling: (params, options) => this.createMessage(params, options)
			},
			http: hasHttpInfo ? {
				...ctx.http,
				req: transportInfo?.request,
				closeSSE: transportInfo?.closeSSEStream,
				closeStandaloneSSE: transportInfo?.closeStandaloneSSEStream
			} : void 0
		};
	}
	_loggingLevels = /* @__PURE__ */ new Map();
	LOG_LEVEL_SEVERITY = new Map(LoggingLevelSchema.options.map((level, index) => [level, index]));
	isMessageIgnored = (level, sessionId) => {
		const currentLevel = this._loggingLevels.get(sessionId);
		return currentLevel ? this.LOG_LEVEL_SEVERITY.get(level) < this.LOG_LEVEL_SEVERITY.get(currentLevel) : false;
	};
	/**
	* Registers new capabilities. This can only be called before connecting to a transport.
	*
	* The new capabilities will be merged with any existing capabilities previously given (e.g., at initialization).
	*/
	registerCapabilities(capabilities) {
		if (this.transport) throw new SdkError(SdkErrorCode.AlreadyConnected, "Cannot register capabilities after connecting to transport");
		const hadLogging = !!this._capabilities.logging;
		this._capabilities = mergeCapabilities(this._capabilities, capabilities);
		if (!hadLogging && this._capabilities.logging) this._registerLoggingHandler();
	}
	/**
	* Enforces server-side validation for `tools/call` results regardless of how the
	* handler was registered, attaches the configured per-operation cache hint
	* (when one exists) so the 2026-07-28 encode seam can fill `ttlMs`/`cacheScope`
	* for results that do not provide their own, and owns the multi-round-trip
	* seam: on the methods whose 2026-07-28 result vocabulary includes
	* `input_required` (`tools/call`, `prompts/get`, `resources/read`) an
	* input-required return skips result-schema validation and is checked
	* against the served era, the at-least-one rule, and the request's own
	* declared client capabilities; on every other method an input-required
	* return is a server bug and fails loudly. The hint rides a symbol-keyed
	* property that is never serialized, so 2025-era responses are unaffected.
	*/
	_wrapHandler(method, handler) {
		if (method !== "tools/call") {
			const cacheHint = this._cacheHints?.[method];
			const isInputRequiredCapable = INPUT_REQUIRED_CAPABLE_METHODS.has(method);
			if (cacheHint === void 0 && !isInputRequiredCapable) return async (request, ctx) => {
				const result = await handler(request, ctx);
				if (isInputRequiredResult(result)) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result, but only tools/call, prompts/get and resources/read support input_required (protocol revision 2026-07-28)`);
				return result;
			};
			return async (request, ctx) => {
				const result = isInputRequiredCapable ? await this._invokeInputRequiredCapableHandler(method, handler, request, ctx) : await handler(request, ctx);
				if (isInputRequiredResult(result)) {
					if (!isInputRequiredCapable) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result, but only tools/call, prompts/get and resources/read support input_required (protocol revision 2026-07-28)`);
					return result;
				}
				return cacheHint === void 0 ? result : attachCacheHintFallback(result, cacheHint);
			};
		}
		return async (request, ctx) => {
			const codec = codecForVersion(this._negotiatedProtocolVersion);
			const validatedRequest = codec.validateRequest("tools/call", request);
			if (!validatedRequest.ok) throw new ProtocolError(validatedRequest.reason === "not-in-era" ? ProtocolErrorCode.InternalError : ProtocolErrorCode.InvalidParams, validatedRequest.reason === "not-in-era" ? "No wire schema for tools/call in the resolved era" : `Invalid tools/call request: ${validatedRequest.message}`);
			const result = await this._invokeInputRequiredCapableHandler("tools/call", handler, request, ctx);
			if (isInputRequiredResult(result)) return result;
			const validationResult = codec.validateResult("tools/call", result);
			if (!validationResult.ok) throw new ProtocolError(validationResult.reason === "not-in-era" ? ProtocolErrorCode.InternalError : ProtocolErrorCode.InvalidParams, validationResult.reason === "not-in-era" ? "No wire schema for tools/call in the resolved era" : `Invalid tools/call result: ${validationResult.message}`);
			return validationResult.value;
		};
	}
	/**
	* Whether this instance is bound to a 2026-07-28-or-later protocol
	* revision. Era is instance state — a serving entry (`createMcpHandler`,
	* `serveStdio`) marks the instance modern at construction; a 2025-era
	* `initialize` handshake binds it legacy. The multi-round-trip seam reads
	* this directly: there is no per-request era consult.
	*/
	_servedModernEra() {
		return this._negotiatedProtocolVersion !== void 0 && isModernProtocolVersion(this._negotiatedProtocolVersion);
	}
	/**
	* Invokes a handler for one of the multi-round-trip methods and applies
	* the input-required seam:
	*
	* - a `UrlElicitationRequiredError` (or any 2025-style server→client
	*   request idiom) escaping the handler on a request served on the
	*   2026-07-28 era fails LOUDLY with a clear steer to
	*   `inputRequired.elicitUrl(...)` — the `-32042` error never reaches the
	*   2026-07-28 wire and the throw is not silently converted. Requests
	*   served on the 2025 era keep today's `-32042` behavior byte-exact (the
	*   error is rethrown unchanged).
	* - an input-required RETURN toward a 2026-07-28 request must satisfy
	*   the at-least-one rule, and every embedded request must be covered by
	*   the capabilities declared on the request's envelope (violations
	*   answer the typed `-32021` error). Toward a 2025-era request the
	*   return is fulfilled by the default-on legacy shim, whose own gate
	*   consults the initialize-declared capabilities and surfaces
	*   violations per family; `inputRequired.legacyShim: false` restores
	*   the pre-shim loud failure.
	*/
	async _invokeInputRequiredCapableHandler(method, handler, request, ctx) {
		const servedModern = this._servedModernEra();
		const rawRequestState = ctx.mcpReq.requestState();
		if (rawRequestState !== void 0 && typeof rawRequestState !== "string") throw new ProtocolError(ProtocolErrorCode.InvalidParams, "Invalid or expired requestState", { reason: "invalid_request_state" });
		let ctxForHandler = ctx;
		if (typeof rawRequestState === "string") {
			const decoded = await this._verifyRequestState(rawRequestState, ctx, method);
			if (decoded !== void 0) ctxForHandler = withRequestStateValue(ctx, decoded);
		}
		let result;
		try {
			result = await handler(request, ctxForHandler);
		} catch (error) {
			if (error instanceof ProtocolError && error.code === ProtocolErrorCode.UrlElicitationRequired) {
				if (!servedModern) throw error;
				throw new ProtocolError(ProtocolErrorCode.InternalError, `URL elicitation cannot be signalled by throwing UrlElicitationRequiredError on protocol revision ${this._negotiatedProtocolVersion}: return inputRequired({ inputRequests: { …: inputRequired.elicitUrl(...) } }) from the handler instead. The urlElicitationRequired error (-32042) of earlier revisions is not available on this revision.`);
			}
			throw error;
		}
		if (!isInputRequiredResult(result)) return result;
		if (!servedModern) {
			if (!this._inputRequiredServing.legacyShim) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result, but this request is served on protocol revision ${this._negotiatedProtocolVersion ?? LATEST_PROTOCOL_VERSION}, which has no input_required vocabulary`);
			return await this._legacyInputRequiredShim().fulfill(method, handler, request, ctxForHandler, result);
		}
		const inputRequests = result.inputRequests;
		const hasInputRequests = inputRequests != null && Object.keys(inputRequests).length > 0;
		const hasRequestState = typeof result.requestState === "string";
		if (!hasInputRequests && !hasRequestState) throw new ProtocolError(ProtocolErrorCode.InternalError, `Handler for ${method} returned an input-required result with neither inputRequests nor requestState (every InputRequiredResult must include at least one of the two)`);
		if (hasInputRequests) {
			const declared = this._inputRequestCapabilityView(ctx);
			for (const [key, entry] of Object.entries(inputRequests)) {
				const { embedded, required } = coerceEmbeddedInputRequest(method, key, entry);
				const missing = missingClientCapabilities(required, declared);
				if (missing !== void 0) throw new MissingRequiredClientCapabilityError({ requiredCapabilities: missing }, `Cannot request input '${key}' (${embedded.method}): the request's client capabilities do not declare the required capability`);
			}
		}
		return result;
	}
	/**
	* Runs the configured `requestState.verify` hook and returns its
	* resolved value (`undefined` when unconfigured or the hook returns
	* nothing). Deny-on-error: any hook failure answers the frozen `-32602`;
	* the reason goes to `onerror` only.
	*/
	async _verifyRequestState(state, ctx, method) {
		if (this._requestStateVerify === void 0) return;
		try {
			return await this._requestStateVerify(state, ctx);
		} catch (error) {
			this.onerror?.(/* @__PURE__ */ new Error(`requestState verification rejected ${method}: ${error instanceof Error ? error.message : String(error)}`));
			throw new ProtocolError(ProtocolErrorCode.InvalidParams, "Invalid or expired requestState", { reason: "invalid_request_state" });
		}
	}
	/**
	* The per-request resolved client-capabilities view: the request's own
	* `_meta` envelope on the 2026 era; the `initialize`-declared state on a
	* 2025-era connection. Per-request instances that never saw an
	* initialize (stateless legacy) hold nothing, so gates refuse there.
	*/
	_inputRequestCapabilityView(ctx) {
		return this._servedModernEra() ? ctx.mcpReq.envelope?.[CLIENT_CAPABILITIES_META_KEY] : this._clientCapabilities;
	}
	/**
	* Guard for the push-style server→client request APIs ({@linkcode createMessage},
	* {@linkcode elicitInput}, {@linkcode listRoots}, {@linkcode ping}) on a
	* modern-era instance: the 2026-07-28 revision has no server→client request
	* channel, so the call fails before any wire traffic with a typed error
	* whose message steers to `inputRequired(...)`. The base era gate would
	* also reject it; this guard runs first to carry the steer.
	*/
	_assertPushApiInServedEra(method) {
		if (this._servedModernEra()) throw new SdkError(SdkErrorCode.MethodNotSupportedByProtocolVersion, `Server-to-client requests are not available on protocol revision ${this._negotiatedProtocolVersion}: '${method}' cannot be sent while serving a request on that revision. Return inputRequired({ ... }) from the handler instead — the client fulfils the embedded requests and retries the original request (multi round-trip requests).`, {
			method,
			era: "2026-07-28"
		});
	}
	assertCapabilityForMethod(method) {
		switch (method) {
			case "sampling/createMessage":
				if (!this._clientCapabilities?.sampling) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support sampling (required for ${method})`);
				break;
			case "elicitation/create":
				if (!this._clientCapabilities?.elicitation) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support elicitation (required for ${method})`);
				break;
			case "roots/list":
				if (!this._clientCapabilities?.roots) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support listing roots (required for ${method})`);
				break;
			case "ping": break;
		}
	}
	assertNotificationCapability(method) {
		switch (method) {
			case "notifications/message":
				if (!this._capabilities.logging) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support logging (required for ${method})`);
				break;
			case "notifications/resources/updated":
			case "notifications/resources/list_changed":
				if (!this._capabilities.resources) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support notifying about resources (required for ${method})`);
				break;
			case "notifications/tools/list_changed":
				if (!this._capabilities.tools) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support notifying of tool list changes (required for ${method})`);
				break;
			case "notifications/prompts/list_changed":
				if (!this._capabilities.prompts) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support notifying of prompt list changes (required for ${method})`);
				break;
			case "notifications/elicitation/complete":
				if (!this._clientCapabilities?.elicitation?.url) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Client does not support URL elicitation (required for ${method})`);
				break;
			case "notifications/cancelled": break;
			case "notifications/progress": break;
		}
	}
	assertRequestHandlerCapability(method) {
		switch (method) {
			case "completion/complete":
				if (!this._capabilities.completions) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support completions (required for ${method})`);
				break;
			case "logging/setLevel":
				if (!this._capabilities.logging) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support logging (required for ${method})`);
				break;
			case "prompts/get":
			case "prompts/list":
				if (!this._capabilities.prompts) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support prompts (required for ${method})`);
				break;
			case "resources/list":
			case "resources/templates/list":
			case "resources/read":
				if (!this._capabilities.resources) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support resources (required for ${method})`);
				break;
			case "tools/call":
			case "tools/list":
				if (!this._capabilities.tools) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support tools (required for ${method})`);
				break;
			case "ping":
			case "initialize": break;
		}
	}
	async _oninitialize(request) {
		const requestedVersion = request.params.protocolVersion;
		this._clientCapabilities = request.params.capabilities;
		this._clientVersion = request.params.clientInfo;
		const legacyVersions = legacyProtocolVersions(this._supportedProtocolVersions);
		const protocolVersion = legacyVersions.includes(requestedVersion) ? requestedVersion : legacyVersions[0] ?? LATEST_PROTOCOL_VERSION;
		this._negotiatedProtocolVersion = protocolVersion;
		this.transport?.setProtocolVersion?.(protocolVersion);
		return {
			protocolVersion,
			capabilities: this.getCapabilities(),
			serverInfo: this._serverInfo,
			...this._instructions && { instructions: this._instructions }
		};
	}
	/**
	* Answers `server/discover` (protocol revision 2026-07-28). `supportedVersions`
	* lists only modern revisions (2025-era versions are negotiated via `initialize`);
	* the advertised capabilities exclude the listChanged/subscribe-class capabilities
	* (see {@linkcode discoverAdvertisedCapabilities}).
	*/
	_ondiscover() {
		return {
			supportedVersions: modernProtocolVersions(this._supportedProtocolVersions),
			capabilities: discoverAdvertisedCapabilities(this.getCapabilities()),
			serverInfo: this._serverInfo,
			...this._instructions && { instructions: this._instructions }
		};
	}
	/**
	* After initialization has completed, this will be populated with the client's reported capabilities.
	*
	* @deprecated Read client identity from the per-request handler context instead: on
	* 2026-07-28 (per-request envelope) requests `ctx.mcpReq.envelope` carries the client's
	* declared capabilities, while on 2025-era connections this accessor keeps returning the
	* `initialize`-scoped value. The accessor remains functional — instances serving the
	* 2026-07-28 era are backfilled per request from the validated envelope.
	*/
	getClientCapabilities() {
		return this._clientCapabilities;
	}
	/**
	* After initialization has completed, this will be populated with information about the client's name and version.
	*
	* @deprecated Read client identity from the per-request handler context instead: on
	* 2026-07-28 (per-request envelope) requests `ctx.mcpReq.envelope` carries the client's
	* name and version, while on 2025-era connections this accessor keeps returning the
	* `initialize`-scoped value. The accessor remains functional — instances serving the
	* 2026-07-28 era are backfilled per request from the validated envelope.
	*/
	getClientVersion() {
		return this._clientVersion;
	}
	/**
	* After initialization has completed, this will be populated with the protocol version negotiated
	* with the client (the version the server responded with during the initialize handshake), or
	* `undefined` before initialization.
	*
	* @deprecated Read the protocol revision from the per-request handler context instead: on
	* 2026-07-28 (per-request envelope) requests `ctx.mcpReq.envelope` names the revision the
	* request was sent for, while on 2025-era connections this accessor keeps returning the
	* `initialize`-negotiated version. The accessor remains functional — instances serving the
	* 2026-07-28 era report that revision.
	*/
	getNegotiatedProtocolVersion() {
		return this._negotiatedProtocolVersion;
	}
	/**
	* Project a `tools/call` result through this instance's negotiated wire
	* codec — the era-agnostic SEP-2106 §4.3 TextContent auto-append, plus on
	* the 2025 era the `{result:…}` wrap when `structuredContent` is a
	* non-object value or the advertised `outputSchema` had a non-object root.
	* Identity for object-shaped `structuredContent` on the 2026 era.
	*
	* `McpServer`'s built-in `tools/call` handler routes through this method.
	* Low-level `setRequestHandler('tools/call', …)` authors call it
	* themselves so the projection lives in one place (the codec) and the
	* server-side handler stays era-blind.
	*
	* This is the only codec function exposed on `Server` — the full
	* `WireCodec` is intentionally not part of the public surface.
	*/
	projectCallToolResult(result, advertisedOutputSchema) {
		return this._wireCodec().projectCallToolResult(result, advertisedOutputSchema);
	}
	/**
	* Returns the current server capabilities.
	*/
	getCapabilities() {
		return this._capabilities;
	}
	/**
	* Sends a `ping` request to the connected client.
	*
	* @deprecated The 2026-07-28 protocol removed ping; it throws on a 2026-07-28-era instance.
	* If your factory serves both eras, this only works on the legacy path.
	*/
	async ping() {
		this._assertPushApiInServedEra("ping");
		return this.request({ method: "ping" });
	}
	async createMessage(params, options) {
		this._assertPushApiInServedEra("sampling/createMessage");
		if ((params.tools || params.toolChoice) && !this._clientCapabilities?.sampling?.tools) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support sampling tools capability.");
		if (params.messages.length > 0) {
			const lastMessage = params.messages.at(-1);
			const lastContent = Array.isArray(lastMessage.content) ? lastMessage.content : [lastMessage.content];
			const hasToolResults = lastContent.some((c) => c.type === "tool_result");
			const previousMessage = params.messages.length > 1 ? params.messages.at(-2) : void 0;
			const previousContent = previousMessage ? Array.isArray(previousMessage.content) ? previousMessage.content : [previousMessage.content] : [];
			const hasPreviousToolUse = previousContent.some((c) => c.type === "tool_use");
			if (hasToolResults) {
				if (lastContent.some((c) => c.type !== "tool_result")) throw new ProtocolError(ProtocolErrorCode.InvalidParams, "The last message must contain only tool_result content if any is present");
				if (!hasPreviousToolUse) throw new ProtocolError(ProtocolErrorCode.InvalidParams, "tool_result blocks are not matching any tool_use from the previous message");
			}
			if (hasPreviousToolUse) {
				const toolUseIds = new Set(previousContent.filter((c) => c.type === "tool_use").map((c) => c.id));
				const toolResultIds = new Set(lastContent.filter((c) => c.type === "tool_result").map((c) => c.toolUseId));
				if (toolUseIds.size !== toolResultIds.size || ![...toolUseIds].every((id) => toolResultIds.has(id))) throw new ProtocolError(ProtocolErrorCode.InvalidParams, "ids of tool_result blocks and tool_use blocks from previous message do not match");
			}
		}
		const hasTools = Boolean(params.tools || params.toolChoice);
		const wide = await this.request({
			method: "sampling/createMessage",
			params
		}, options);
		const outcome = this._wireCodec().samplingResultVariant(hasTools, wide);
		if (!outcome.ok) throw new SdkError(SdkErrorCode.InvalidResult, `Invalid sampling/createMessage result: ${outcome.reason === "invalid" ? outcome.message : outcome.reason}`);
		return outcome.value;
	}
	/**
	* Creates an elicitation request for the given parameters.
	* For backwards compatibility, `mode` may be omitted for form requests and will default to `"form"`.
	* @param params The parameters for the elicitation request.
	* @param options Optional request options.
	* @returns The result of the elicitation request.
	*
	* @deprecated Throws on a 2026-07-28-era request — use {@link index.inputRequired | inputRequired} (multi-round-trip)
	* instead. The 2025 push-style server-to-client request model is replaced by input_required
	* results in the 2026-07-28 protocol. If your factory serves both eras, this only works on the
	* legacy path.
	*/
	async elicitInput(params, options) {
		this._assertPushApiInServedEra("elicitation/create");
		switch (params.mode ?? "form") {
			case "url":
				if (!this._clientCapabilities?.elicitation?.url) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support url elicitation.");
				break;
			case "form":
				if (!this._clientCapabilities?.elicitation?.form) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support form elicitation.");
				break;
		}
		return this._sendElicitationLeg(params, options);
	}
	/**
	* The capability-check-free core of {@linkcode elicitInput}. The shim
	* uses it because its gate differs from the public checks: a bare
	* `elicitation: {}` counts as form support (the pre-mode rule), and
	* accepted content passes through unvalidated for parity with the
	* modern client driver (handlers validate via the schema-aware
	* `acceptedContent` overload and can re-ask).
	*/
	async _sendElicitationLeg(params, options, behavior) {
		const mode = params.mode ?? "form";
		const validateAcceptedContent = behavior?.validateAcceptedContent ?? true;
		switch (mode) {
			case "url": {
				const urlParams = params;
				return this.request({
					method: "elicitation/create",
					params: urlParams
				}, options);
			}
			case "form": {
				const formParams = params.mode === "form" ? params : {
					...params,
					mode: "form"
				};
				const result = await this.request({
					method: "elicitation/create",
					params: formParams
				}, options);
				if (validateAcceptedContent && result.action === "accept" && result.content && formParams.requestedSchema) try {
					const validationResult = this._jsonSchemaValidator.getValidator(formParams.requestedSchema)(result.content);
					if (!validationResult.valid) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Elicitation response content does not match requested schema: ${validationResult.errorMessage}`);
				} catch (error) {
					if (error instanceof ProtocolError) throw error;
					throw new ProtocolError(ProtocolErrorCode.InternalError, `Error validating elicitation response: ${error instanceof Error ? error.message : String(error)}`);
				}
				return result;
			}
		}
	}
	/**
	* Creates a reusable callback that, when invoked, will send a `notifications/elicitation/complete`
	* notification for the specified elicitation ID.
	*
	* The notification (and the `elicitationId` it references) exists only on protocol revision
	* 2025-11-25 — the 2026-07-28 draft removed both. On a connection negotiated at 2026-07-28 the
	* returned callback rejects with a typed local error before anything reaches the transport
	* (the method is not part of that revision's wire registry).
	*
	* @param elicitationId The ID of the elicitation to mark as complete.
	* @param options Optional notification options. Useful when the completion notification should be related to a prior request.
	* @returns A function that emits the completion notification when awaited.
	*/
	createElicitationCompletionNotifier(elicitationId, options) {
		if (!this._clientCapabilities?.elicitation?.url) throw new SdkError(SdkErrorCode.CapabilityNotSupported, "Client does not support URL elicitation (required for notifications/elicitation/complete)");
		return () => this.notification({
			method: "notifications/elicitation/complete",
			params: { elicitationId }
		}, options);
	}
	/**
	* Requests the list of roots from the client.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Throws on a 2026-07-28-era request — use {@link index.inputRequired | inputRequired} (multi-round-trip) instead,
	* or migrate to passing paths via tool parameters, resource URIs, or configuration. The 2025
	* push-style server-to-client request model is replaced by input_required results in the
	* 2026-07-28 protocol. If your factory serves both eras, this only works on the legacy path.
	*/
	async listRoots(params, options) {
		this._assertPushApiInServedEra("roots/list");
		return this.request({
			method: "roots/list",
			params
		}, options);
	}
	/**
	* Sends a logging message to the client, if connected.
	* Note: You only need to send the parameters object, not the entire JSON-RPC message.
	* @see {@linkcode LoggingMessageNotification}
	* @param params
	* @param sessionId Optional for stateless transports and backward compatibility.
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Remains functional during the deprecation window (at least twelve months).
	* Migrate to stderr logging (STDIO servers) or OpenTelemetry.
	*/
	async sendLoggingMessage(params, sessionId) {
		if (this._capabilities.logging && !this.isMessageIgnored(params.level, sessionId)) return this.notification({
			method: "notifications/message",
			params
		});
	}
	async sendResourceUpdated(params) {
		return this.notification({
			method: "notifications/resources/updated",
			params
		});
	}
	async sendResourceListChanged() {
		return this.notification({ method: "notifications/resources/list_changed" });
	}
	async sendToolListChanged() {
		return this.notification({ method: "notifications/tools/list_changed" });
	}
	async sendPromptListChanged() {
		return this.notification({ method: "notifications/prompts/list_changed" });
	}
};
/**
* The capability set a server advertises on `server/discover`. Pure — never
* mutates the input; the legacy `initialize` advertisement is untouched.
*
* The serving entries serve `subscriptions/listen` themselves, so the
* `listChanged` and `resources.subscribe` capability bits are advertised
* as-is: a modern-era client uses them to decide which notification types to
* request on its listen filter.
*/
function discoverAdvertisedCapabilities(capabilities) {
	return { ...capabilities };
}

//#endregion
//#region src/server/mcp.ts
/**
* High-level MCP server that provides a simpler API for working with resources, tools, and prompts.
* For advanced usage (like sending notifications or setting custom request handlers), use the underlying
* {@linkcode Server} instance available via the {@linkcode McpServer.server | server} property.
*
* @example
* ```ts source="./mcp.examples.ts#McpServer_basicUsage"
* const server = new McpServer({
*     name: 'my-server',
*     version: '1.0.0'
* });
* ```
*/
var McpServer = class {
	/**
	* The underlying {@linkcode Server} instance, useful for advanced operations like sending notifications.
	*/
	server;
	_registeredResources = {};
	_registeredResourceTemplates = {};
	_registeredTools = {};
	_registeredPrompts = {};
	/**
	* Per-tool JSON-converted `inputSchema`, memoized so the SEP-2243
	* registration-time scan and the pre-dispatch validation step share one
	* conversion instead of paying it twice per request under the
	* per-request-factory `createMcpHandler` model.
	*/
	_toolInputSchemaJson = {};
	/**
	* The JSON-serialized `inputSchema` of a registered tool, or `undefined`
	* when no such tool is registered. Used by the HTTP entry's pre-dispatch
	* SEP-2243 `Mcp-Param-*` validation step (which needs the same JSON Schema
	* `tools/list` would emit, before dispatch reaches the handler).
	*
	* @internal
	*/
	toolInputSchemaJson(name) {
		const tool = this._registeredTools[name];
		if (tool === void 0 || !tool.enabled) return void 0;
		if (Object.hasOwn(this._toolInputSchemaJson, name)) return this._toolInputSchemaJson[name];
		if (tool.inputSchema === void 0) return EMPTY_OBJECT_JSON_SCHEMA;
		try {
			const json = standardSchemaToJsonSchema(tool.inputSchema, "input");
			this._toolInputSchemaJson[name] = json;
			return json;
		} catch {
			return;
		}
	}
	constructor(serverInfo, options) {
		this.server = new Server(serverInfo, options);
		if (options?.capabilities?.tools) this.setToolRequestHandlers();
		if (options?.capabilities?.resources) this.setResourceRequestHandlers();
		if (options?.capabilities?.prompts) this.setPromptRequestHandlers();
	}
	/**
	* Attaches to the given transport, starts it, and starts listening for messages.
	*
	* The `server` object assumes ownership of the {@linkcode Transport}, replacing any callbacks that have already been set, and expects that it is the only user of the {@linkcode Transport} instance going forward.
	*
	* @example
	* ```ts source="./mcp.examples.ts#McpServer_connect_stdio"
	* const server = new McpServer({ name: 'my-server', version: '1.0.0' });
	* const transport = new StdioServerTransport();
	* await server.connect(transport);
	* ```
	*/
	async connect(transport) {
		return await this.server.connect(transport);
	}
	/**
	* Closes the connection.
	*/
	async close() {
		await this.server.close();
	}
	_toolHandlersInitialized = false;
	setToolRequestHandlers() {
		if (this._toolHandlersInitialized) return;
		this.server.assertCanSetRequestHandler("tools/list");
		this.server.assertCanSetRequestHandler("tools/call");
		this.server.registerCapabilities({ tools: { listChanged: this.server.getCapabilities().tools?.listChanged ?? true } });
		this.server.setRequestHandler("tools/list", () => ({ tools: Object.entries(this._registeredTools).filter(([, tool]) => tool.enabled).map(([name, tool]) => {
			const toolDefinition = {
				name,
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema ? standardSchemaToJsonSchema(tool.inputSchema, "input") : EMPTY_OBJECT_JSON_SCHEMA,
				annotations: tool.annotations,
				icons: tool.icons,
				execution: tool.execution,
				_meta: tool._meta
			};
			if (tool.outputSchema) toolDefinition.outputSchema = standardSchemaToJsonSchema(tool.outputSchema, "output");
			return toolDefinition;
		}) }));
		this.server.setRequestHandler("tools/call", async (request, ctx) => {
			const tool = this._registeredTools[request.params.name];
			if (!tool) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
			if (!tool.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${request.params.name} disabled`);
			try {
				const args = await this.validateToolInput(tool, request.params.arguments, request.params.name);
				const result = await this.executeToolHandler(tool, args, ctx);
				await this.validateToolOutput(tool, result, request.params.name);
				if (isInputRequiredResult(result)) return result;
				return this.server.projectCallToolResult(result, tool.outputSchemaJson);
			} catch (error) {
				if (error instanceof ProtocolError && error.code === ProtocolErrorCode.UrlElicitationRequired) throw error;
				return this.createToolError(error instanceof Error ? error.message : String(error));
			}
		});
		this._toolHandlersInitialized = true;
	}
	/**
	* Creates a tool error result.
	*
	* @param errorMessage - The error message.
	* @returns The tool error result.
	*/
	createToolError(errorMessage) {
		return {
			content: [{
				type: "text",
				text: errorMessage
			}],
			isError: true
		};
	}
	/**
	* Validates tool input arguments against the tool's input schema.
	*/
	async validateToolInput(tool, args, toolName) {
		if (!tool.inputSchema) return;
		const parseResult = await validateStandardSchema(tool.inputSchema, args ?? {});
		if (!parseResult.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Input validation error: Invalid arguments for tool ${toolName}: ${parseResult.error}`);
		return parseResult.data;
	}
	/**
	* Validates tool output against the tool's output schema.
	*/
	async validateToolOutput(tool, result, toolName) {
		if (!tool.outputSchema) return;
		if (isInputRequiredResult(result)) return;
		if (result.isError) return;
		if (result.structuredContent === void 0) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Output validation error: Tool ${toolName} has an output schema but no structured content was provided`);
		const parseResult = await validateStandardSchema(tool.outputSchema, result.structuredContent);
		if (!parseResult.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Output validation error: Invalid structured content for tool ${toolName}: ${parseResult.error}`);
	}
	/**
	* Executes a tool handler.
	*/
	async executeToolHandler(tool, args, ctx) {
		return tool.executor(args, ctx);
	}
	_completionHandlerInitialized = false;
	setCompletionRequestHandler() {
		if (this._completionHandlerInitialized) return;
		this.server.assertCanSetRequestHandler("completion/complete");
		this.server.registerCapabilities({ completions: {} });
		this.server.setRequestHandler("completion/complete", async (request) => {
			switch (request.params.ref.type) {
				case "ref/prompt":
					assertCompleteRequestPrompt(request);
					return this.handlePromptCompletion(request, request.params.ref);
				case "ref/resource":
					assertCompleteRequestResourceTemplate(request);
					return this.handleResourceCompletion(request, request.params.ref);
				default: throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid completion reference: ${request.params.ref}`);
			}
		});
		this._completionHandlerInitialized = true;
	}
	async handlePromptCompletion(request, ref) {
		const prompt = this._registeredPrompts[ref.name];
		if (!prompt) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${ref.name} not found`);
		if (!prompt.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${ref.name} disabled`);
		if (!prompt.argsSchema) return EMPTY_COMPLETION_RESULT;
		const field = unwrapOptionalSchema(getSchemaShape(prompt.argsSchema)?.[request.params.argument.name]);
		if (!isCompletable(field)) return EMPTY_COMPLETION_RESULT;
		const completer = getCompleter(field);
		if (!completer) return EMPTY_COMPLETION_RESULT;
		return createCompletionResult(await completer(request.params.argument.value, request.params.context));
	}
	async handleResourceCompletion(request, ref) {
		const template = Object.values(this._registeredResourceTemplates).find((t) => t.resourceTemplate.uriTemplate.toString() === ref.uri);
		if (!template) {
			if (this._registeredResources[ref.uri]) return EMPTY_COMPLETION_RESULT;
			throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Resource template ${request.params.ref.uri} not found`);
		}
		const completer = template.resourceTemplate.completeCallback(request.params.argument.name);
		if (!completer) return EMPTY_COMPLETION_RESULT;
		return createCompletionResult(await completer(request.params.argument.value, request.params.context));
	}
	_resourceHandlersInitialized = false;
	setResourceRequestHandlers() {
		if (this._resourceHandlersInitialized) return;
		this.server.assertCanSetRequestHandler("resources/list");
		this.server.assertCanSetRequestHandler("resources/templates/list");
		this.server.assertCanSetRequestHandler("resources/read");
		this.server.registerCapabilities({ resources: { listChanged: this.server.getCapabilities().resources?.listChanged ?? true } });
		this.server.setRequestHandler("resources/list", async (_request, ctx) => {
			const resources = Object.entries(this._registeredResources).filter(([_, resource]) => resource.enabled).map(([uri, resource]) => ({
				uri,
				name: resource.name,
				...resource.metadata
			}));
			const templateResources = [];
			for (const template of Object.values(this._registeredResourceTemplates)) {
				if (!template.resourceTemplate.listCallback) continue;
				const result = await template.resourceTemplate.listCallback(ctx);
				for (const resource of result.resources) templateResources.push({
					...template.metadata,
					...resource
				});
			}
			return { resources: [...resources, ...templateResources] };
		});
		this.server.setRequestHandler("resources/templates/list", async () => {
			return { resourceTemplates: Object.entries(this._registeredResourceTemplates).map(([name, template]) => ({
				name,
				uriTemplate: template.resourceTemplate.uriTemplate.toString(),
				...template.metadata
			})) };
		});
		this.server.setRequestHandler("resources/read", async (request, ctx) => {
			const uri = new URL(request.params.uri);
			const resource = this._registeredResources[uri.toString()];
			if (resource) {
				if (!resource.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Resource ${uri} disabled`);
				return attachCacheHintFallback(await resource.readCallback(uri, ctx), resource.cacheHint);
			}
			for (const template of Object.values(this._registeredResourceTemplates)) {
				const variables = template.resourceTemplate.uriTemplate.match(uri.toString());
				if (variables) return attachCacheHintFallback(await template.readCallback(uri, variables, ctx), template.cacheHint);
			}
			throw new ResourceNotFoundError(request.params.uri);
		});
		this._resourceHandlersInitialized = true;
	}
	_promptHandlersInitialized = false;
	setPromptRequestHandlers() {
		if (this._promptHandlersInitialized) return;
		this.server.assertCanSetRequestHandler("prompts/list");
		this.server.assertCanSetRequestHandler("prompts/get");
		this.server.registerCapabilities({ prompts: { listChanged: this.server.getCapabilities().prompts?.listChanged ?? true } });
		this.server.setRequestHandler("prompts/list", () => ({ prompts: Object.entries(this._registeredPrompts).filter(([, prompt]) => prompt.enabled).map(([name, prompt]) => {
			return {
				name,
				title: prompt.title,
				description: prompt.description,
				arguments: prompt.argsSchema ? promptArgumentsFromStandardSchema(prompt.argsSchema) : void 0,
				icons: prompt.icons,
				_meta: prompt._meta
			};
		}) }));
		this.server.setRequestHandler("prompts/get", async (request, ctx) => {
			const prompt = this._registeredPrompts[request.params.name];
			if (!prompt) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${request.params.name} not found`);
			if (!prompt.enabled) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt ${request.params.name} disabled`);
			return prompt.handler(request.params.arguments, ctx);
		});
		this._promptHandlersInitialized = true;
	}
	registerResource(name, uriOrTemplate, config, readCallback) {
		const cacheHint = config.cacheHint;
		let metadata = config;
		if (cacheHint !== void 0) {
			assertValidCacheHint(cacheHint, `resource ${name}`);
			const rest = { ...config };
			delete rest.cacheHint;
			metadata = rest;
		}
		if (typeof uriOrTemplate === "string") {
			if (this._registeredResources[uriOrTemplate]) throw new Error(`Resource ${uriOrTemplate} is already registered`);
			const registeredResource = this._createRegisteredResource(name, config.title, uriOrTemplate, metadata, readCallback);
			if (cacheHint !== void 0) registeredResource.cacheHint = cacheHint;
			this.setResourceRequestHandlers();
			this.sendResourceListChanged();
			return registeredResource;
		} else {
			if (this._registeredResourceTemplates[name]) throw new Error(`Resource template ${name} is already registered`);
			const registeredResourceTemplate = this._createRegisteredResourceTemplate(name, config.title, uriOrTemplate, metadata, readCallback);
			if (cacheHint !== void 0) registeredResourceTemplate.cacheHint = cacheHint;
			this.setResourceRequestHandlers();
			this.sendResourceListChanged();
			return registeredResourceTemplate;
		}
	}
	_createRegisteredResource(name, title, uri, metadata, readCallback) {
		const registeredResource = {
			name,
			title,
			metadata,
			readCallback,
			enabled: true,
			disable: () => registeredResource.update({ enabled: false }),
			enable: () => registeredResource.update({ enabled: true }),
			remove: () => registeredResource.update({ uri: null }),
			update: (updates) => {
				if (updates.uri !== void 0 && updates.uri !== uri) {
					delete this._registeredResources[uri];
					if (updates.uri) this._registeredResources[updates.uri] = registeredResource;
				}
				if (updates.name !== void 0) registeredResource.name = updates.name;
				if (updates.title !== void 0) registeredResource.title = updates.title;
				if (updates.metadata !== void 0) registeredResource.metadata = updates.metadata;
				if (updates.callback !== void 0) registeredResource.readCallback = updates.callback;
				if (updates.enabled !== void 0) registeredResource.enabled = updates.enabled;
				this.sendResourceListChanged();
			}
		};
		this._registeredResources[uri] = registeredResource;
		return registeredResource;
	}
	_createRegisteredResourceTemplate(name, title, template, metadata, readCallback) {
		const registeredResourceTemplate = {
			resourceTemplate: template,
			title,
			metadata,
			readCallback,
			enabled: true,
			disable: () => registeredResourceTemplate.update({ enabled: false }),
			enable: () => registeredResourceTemplate.update({ enabled: true }),
			remove: () => registeredResourceTemplate.update({ name: null }),
			update: (updates) => {
				if (updates.name !== void 0 && updates.name !== name) {
					delete this._registeredResourceTemplates[name];
					if (updates.name) this._registeredResourceTemplates[updates.name] = registeredResourceTemplate;
				}
				if (updates.title !== void 0) registeredResourceTemplate.title = updates.title;
				if (updates.template !== void 0) registeredResourceTemplate.resourceTemplate = updates.template;
				if (updates.metadata !== void 0) registeredResourceTemplate.metadata = updates.metadata;
				if (updates.callback !== void 0) registeredResourceTemplate.readCallback = updates.callback;
				if (updates.enabled !== void 0) registeredResourceTemplate.enabled = updates.enabled;
				this.sendResourceListChanged();
			}
		};
		this._registeredResourceTemplates[name] = registeredResourceTemplate;
		const variableNames = template.uriTemplate.variableNames;
		if (Array.isArray(variableNames) && variableNames.some((v) => !!template.completeCallback(v))) this.setCompletionRequestHandler();
		return registeredResourceTemplate;
	}
	_createRegisteredPrompt(name, title, description, argsSchema, callback, icons, _meta) {
		let currentArgsSchema = argsSchema;
		let currentCallback = callback;
		const registeredPrompt = {
			title,
			description,
			argsSchema,
			icons,
			_meta,
			handler: createPromptHandler(name, argsSchema, callback),
			enabled: true,
			disable: () => registeredPrompt.update({ enabled: false }),
			enable: () => registeredPrompt.update({ enabled: true }),
			remove: () => registeredPrompt.update({ name: null }),
			update: (updates) => {
				if (updates.name !== void 0 && updates.name !== name) {
					delete this._registeredPrompts[name];
					if (updates.name) this._registeredPrompts[updates.name] = registeredPrompt;
				}
				if (updates.title !== void 0) registeredPrompt.title = updates.title;
				if (updates.description !== void 0) registeredPrompt.description = updates.description;
				if (updates.icons !== void 0) registeredPrompt.icons = updates.icons;
				if (updates._meta !== void 0) registeredPrompt._meta = updates._meta;
				let needsHandlerRegen = false;
				if (updates.argsSchema !== void 0) {
					registeredPrompt.argsSchema = updates.argsSchema;
					currentArgsSchema = updates.argsSchema;
					needsHandlerRegen = true;
				}
				if (updates.callback !== void 0) {
					currentCallback = updates.callback;
					needsHandlerRegen = true;
				}
				if (needsHandlerRegen) registeredPrompt.handler = createPromptHandler(name, currentArgsSchema, currentCallback);
				if (updates.enabled !== void 0) registeredPrompt.enabled = updates.enabled;
				this.sendPromptListChanged();
			}
		};
		this._registeredPrompts[name] = registeredPrompt;
		if (argsSchema) {
			const shape = getSchemaShape(argsSchema);
			if (shape) {
				if (Object.values(shape).some((field) => {
					return isCompletable(unwrapOptionalSchema(field));
				})) this.setCompletionRequestHandler();
			}
		}
		return registeredPrompt;
	}
	_createRegisteredTool(name, title, description, inputSchema, outputSchema, annotations, icons, execution, _meta, handler) {
		validateAndWarnToolName(name);
		if (inputSchema !== void 0) try {
			const json = standardSchemaToJsonSchema(inputSchema, "input");
			this._toolInputSchemaJson[name] = json;
			const scan = scanXMcpHeaderDeclarations(json);
			if (!scan.valid) console.warn(`[mcp-sdk] tool '${name}' carries an invalid x-mcp-header declaration and will be excluded by conforming Streamable HTTP clients: ${scan.reason}`);
		} catch {}
		let currentHandler = handler;
		const registeredTool = {
			title,
			description,
			inputSchema,
			outputSchema,
			outputSchemaJson: convertOutputSchemaJson(outputSchema),
			annotations,
			icons,
			execution,
			_meta,
			handler,
			executor: createToolExecutor(inputSchema, handler),
			enabled: true,
			disable: () => registeredTool.update({ enabled: false }),
			enable: () => registeredTool.update({ enabled: true }),
			remove: () => registeredTool.update({ name: null }),
			update: (updates) => {
				if (updates.name !== void 0 && updates.name !== name) {
					if (typeof updates.name === "string") validateAndWarnToolName(updates.name);
					delete this._registeredTools[name];
					delete this._toolInputSchemaJson[name];
					if (updates.name) {
						delete this._toolInputSchemaJson[updates.name];
						this._registeredTools[updates.name] = registeredTool;
						name = updates.name;
					}
				}
				if (updates.title !== void 0) registeredTool.title = updates.title;
				if (updates.description !== void 0) registeredTool.description = updates.description;
				let needsExecutorRegen = false;
				if (updates.paramsSchema !== void 0) {
					registeredTool.inputSchema = updates.paramsSchema;
					delete this._toolInputSchemaJson[name];
					needsExecutorRegen = true;
				}
				if (updates.callback !== void 0) {
					registeredTool.handler = updates.callback;
					currentHandler = updates.callback;
					needsExecutorRegen = true;
				}
				if (needsExecutorRegen) registeredTool.executor = createToolExecutor(registeredTool.inputSchema, currentHandler);
				if (updates.outputSchema !== void 0) {
					registeredTool.outputSchema = updates.outputSchema;
					registeredTool.outputSchemaJson = convertOutputSchemaJson(updates.outputSchema);
				}
				if (updates.annotations !== void 0) registeredTool.annotations = updates.annotations;
				if (updates.icons !== void 0) registeredTool.icons = updates.icons;
				if (updates._meta !== void 0) registeredTool._meta = updates._meta;
				if (updates.enabled !== void 0) registeredTool.enabled = updates.enabled;
				this.sendToolListChanged();
			}
		};
		this._registeredTools[name] = registeredTool;
		this.setToolRequestHandlers();
		this.sendToolListChanged();
		return registeredTool;
	}
	registerTool(name, config, cb) {
		if (this._registeredTools[name]) throw new Error(`Tool ${name} is already registered`);
		const { title, description, inputSchema, outputSchema, annotations, icons, _meta } = config;
		return this._createRegisteredTool(name, title, description, normalizeRawShapeSchema(inputSchema), normalizeRawShapeSchema(outputSchema), annotations, icons, void 0, _meta, cb);
	}
	registerPrompt(name, config, cb) {
		if (this._registeredPrompts[name]) throw new Error(`Prompt ${name} is already registered`);
		const { title, description, argsSchema, icons, _meta } = config;
		const registeredPrompt = this._createRegisteredPrompt(name, title, description, normalizeRawShapeSchema(argsSchema), cb, icons, _meta);
		this.setPromptRequestHandlers();
		this.sendPromptListChanged();
		return registeredPrompt;
	}
	/**
	* Checks if the server is connected to a transport.
	* @returns `true` if the server is connected
	*/
	isConnected() {
		return this.server.transport !== void 0;
	}
	/**
	* Sends a logging message to the client, if connected.
	* Note: You only need to send the parameters object, not the entire JSON-RPC message.
	* @see {@linkcode LoggingMessageNotification}
	* @param params
	* @param sessionId Optional for stateless transports and backward compatibility.
	*
	* @example
	* ```ts source="./mcp.examples.ts#McpServer_sendLoggingMessage_basic"
	* await server.sendLoggingMessage({
	*     level: 'info',
	*     data: 'Processing complete'
	* });
	* ```
	*
	* @deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577).
	* Remains functional during the deprecation window (at least twelve months).
	* Migrate to stderr logging (STDIO servers) or OpenTelemetry.
	*/
	async sendLoggingMessage(params, sessionId) {
		return this.server.sendLoggingMessage(params, sessionId);
	}
	/**
	* Sends a resource list changed event to the client, if connected.
	*/
	sendResourceListChanged() {
		if (this.isConnected()) this.server.sendResourceListChanged();
	}
	/**
	* Sends a tool list changed event to the client, if connected.
	*/
	sendToolListChanged() {
		if (this.isConnected()) this.server.sendToolListChanged();
	}
	/**
	* Sends a prompt list changed event to the client, if connected.
	*/
	sendPromptListChanged() {
		if (this.isConnected()) this.server.sendPromptListChanged();
	}
};
/**
* A resource template combines a URI pattern with optional functionality to enumerate
* all resources matching that pattern.
*/
var ResourceTemplate = class {
	_uriTemplate;
	constructor(uriTemplate, _callbacks) {
		this._callbacks = _callbacks;
		this._uriTemplate = typeof uriTemplate === "string" ? new UriTemplate(uriTemplate) : uriTemplate;
	}
	/**
	* Gets the URI template pattern.
	*/
	get uriTemplate() {
		return this._uriTemplate;
	}
	/**
	* Gets the list callback, if one was provided.
	*/
	get listCallback() {
		return this._callbacks.list;
	}
	/**
	* Gets the callback for completing a specific URI template variable, if one was provided.
	*/
	completeCallback(variable) {
		return this._callbacks.complete?.[variable];
	}
};
/**
* Creates an executor that invokes the handler with the appropriate arguments.
* When `inputSchema` is defined, the handler is called with `(args, ctx)`.
* When `inputSchema` is undefined, the handler is called with just `(ctx)`.
*/
function createToolExecutor(inputSchema, handler) {
	if (inputSchema) {
		const callback$1 = handler;
		return async (args, ctx) => callback$1(args, ctx);
	}
	const callback = handler;
	return async (_args, ctx) => callback(ctx);
}
const EMPTY_OBJECT_JSON_SCHEMA = {
	type: "object",
	properties: {}
};
/**
* Convert a registered `outputSchema` to JSON Schema, memoised on {@link RegisteredTool.outputSchemaJson}
* so `tools/call` passes the SAME advertised schema to the wire codec's `projectCallToolResult` that
* `tools/list` emits (and that the 2025 codec's `encodeResult('tools/list', …)` may wrap). A conversion
* failure yields `undefined` so the failure surfaces where it always has (`tools/list`).
*/
function convertOutputSchemaJson(outputSchema) {
	if (outputSchema === void 0) return void 0;
	try {
		return standardSchemaToJsonSchema(outputSchema, "output");
	} catch {
		return;
	}
}
/**
* Creates a type-safe prompt handler that captures the schema and callback in a closure.
* This eliminates the need for type assertions at the call site.
*/
function createPromptHandler(name, argsSchema, callback) {
	if (argsSchema) {
		const typedCallback = callback;
		return async (args, ctx) => {
			const parseResult = await validateStandardSchema(argsSchema, args);
			if (!parseResult.success) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Invalid arguments for prompt ${name}: ${parseResult.error}`);
			return typedCallback(parseResult.data, ctx);
		};
	} else {
		const typedCallback = callback;
		return async (_args, ctx) => {
			return typedCallback(ctx);
		};
	}
}
function createCompletionResult(suggestions) {
	return { completion: {
		values: suggestions.map(String).slice(0, 100),
		total: suggestions.length,
		hasMore: suggestions.length > 100
	} };
}
const EMPTY_COMPLETION_RESULT = { completion: {
	values: [],
	hasMore: false
} };
/** @internal Gets the shape of a Zod object schema */
function getSchemaShape(schema) {
	const candidate = schema;
	if (candidate.shape && typeof candidate.shape === "object") return candidate.shape;
}
/** @internal Checks if a Zod schema is optional */
function isOptionalSchema(schema) {
	return schema?.type === "optional";
}
/** @internal Unwraps an optional Zod schema */
function unwrapOptionalSchema(schema) {
	if (!isOptionalSchema(schema)) return schema;
	return schema.def?.innerType ?? schema;
}

//#endregion
export { validateEnvelopeMeta as $, classifyInboundRequest as A, SdkErrorCode as At, isInitializedNotification as B, isSpecType as C, TRACEPARENT_META_KEY as Ct, inputResponse as D, checkResourceAllowed as Dt, inputRequired as E, requiredClientCapabilitiesForRequest as Et, validateMcpParamHeaders as F, isCompletable as Ft, isJSONRPCResponse as G, isJSONRPCErrorResponse as H, assertCompleteRequestPrompt as I, parseJSONRPCMessage as J, isJSONRPCResultResponse as K, assertCompleteRequestResourceTemplate as L, modernOnlyStrictRejection as M, OAuthError as Mt, validateStandardRequestHeaders as N, OAuthErrorCode as Nt, LADDER_ERROR_HTTP_STATUS as O, resourceUrlFromServerUrl as Ot, scanXMcpHeaderDeclarations as P, completable as Pt, requestMetaOf as Q, isCallToolResult as R, setNegotiatedProtocolVersion as S, SUPPORTED_PROTOCOL_VERSIONS as St, acceptedContent as T, missingClientCapabilities as Tt, isJSONRPCNotification as U, isInputRequiredResult as V, isJSONRPCRequest as W, envelopeClaimVersion as X, JSONRPCMessageSchema as Y, hasEnvelopeClaim as Z, STDIO_DEFAULT_MAX_BUFFER_SIZE as _, METHOD_NOT_FOUND as _t, seedClientIdentityFromEnvelope as a, ProtocolErrorCode as at, getDisplayName as b, RELATED_TASK_META_KEY as bt, StdioListenRouter as c, CLIENT_CAPABILITIES_META_KEY as ct, createServerNotifier as d, INTERNAL_ERROR as dt, MissingRequiredClientCapabilityError as et, fromJsonSchema as f, INVALID_PARAMS as ft, ReadBuffer as g, LOG_LEVEL_META_KEY as gt, createFetchWithInit as h, LATEST_PROTOCOL_VERSION as ht, installModernOnlyHandlers as i, UrlElicitationRequiredError as it, httpStatusForErrorCode as j, SdkHttpError as jt, carriesValidModernEnvelopeClaim as k, SdkError as kt, createListenRouter as l, CLIENT_INFO_META_KEY as lt, UriTemplate as m, JSONRPC_VERSION as mt, ResourceTemplate as n, ResourceNotFoundError as nt, DEFAULT_LISTEN_KEEPALIVE_MS as o, SUPPORTED_MODERN_PROTOCOL_VERSIONS as ot, InMemoryTransport as p, INVALID_REQUEST as pt, isTaskAugmentedRequestParams as q, Server as r, UnsupportedProtocolVersionError as rt, DEFAULT_MAX_SUBSCRIPTIONS as s, BAGGAGE_META_KEY as st, McpServer as t, ProtocolError as tt, InMemoryServerEventBus as u, DEFAULT_NEGOTIATED_PROTOCOL_VERSION as ut, deserializeMessage as v, PARSE_ERROR as vt, specTypeSchemas as w, TRACESTATE_META_KEY as wt, DEFAULT_REQUEST_TIMEOUT_MSEC as x, SUBSCRIPTION_ID_META_KEY as xt, serializeMessage as y, PROTOCOL_VERSION_META_KEY as yt, isInitializeRequest as z };
//# sourceMappingURL=mcp-JttQJlI9.mjs.map