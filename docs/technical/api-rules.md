# HTTP and OpenAPI contract

The canonical design is [openapi.yaml](openapi.yaml), written in OpenAPI 3.1.1. It covers the app-facing HTTP API, provider ingress and RepHarbor billing ingress. Internal Postgres jobs and process health probes have separate operational contracts. During C0, publish this exact document as /docs/openapi.yaml in development and render it using a compatible OpenAPI viewer at /docs. Use an environment setting for production docs exposure. The spec uses a relative /v1 server so a downloaded copy contains no secrets or environment-specific hostnames. [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) · [Nest OpenAPI integration](https://docs.nestjs.com/openapi/introduction)

The [Konvuno reference statement](reference-statement.md) gives success, empty, and recovery cases for the shared workflows.

## Contract workflow

1. The slice owner changes the named operation and reusable component before changing controller or client behavior. Each operation has a stable, unique operationId, owning task tag, access annotation, security declaration, typed success/error responses and declared inputs. Include a representative serialized example for new money or authentication flows.
2. C0 generates TypeScript wire types from this file into packages/contracts and implements matching Zod boundary schemas there. Validate request input on the server and validate external data at the client boundary. Keep a single command for intentional local regeneration. A generated file carries its source and regeneration instructions. Developers edit the contract before regenerating types.
3. Nest returns the documented status and body. The Vue API client uses operation IDs/types from the same revision. If using Nest Swagger decorators for runtime docs, compare their output with the committed contract locally for the changed operations. Serve one agreed public document.
4. Additive optional properties and new operations may ship within /v1. Renaming a field, changing amount units, tightening required input, modifying an enum that clients switch on, or changing established authorization semantics needs coordinated client migration. Preserve behavior for existing callers or introduce a versioned operation.

## Wire conventions

| Concern | Rule |
|---|---|
| Identity and access | IDs owned by RepHarbor are UUID strings. Treat provider IDs as opaque strings. Global member means any signed-in user. Founder means company membership, rep means the engagement's rep, participant means either. Invitee means the signed-in account matches the invitation email. Provider routes select their own secret by connection or billing configuration. |
| Browser session | Cookie name rh_session. Use HttpOnly, host-only scope, same-site compatible app/API deployment and Secure over HTTPS. Requests send credentials. Session expiry gives 401. A new magic link is requested through the same public endpoint. |
| Body and errors | Use UTF-8 JSON, camelCase properties, and declared required fields. Optional properties are omitted when unknown. Reject unknown input fields. An unknown monetary basis goes to review. Return a stable code, safe message, requestId, and optional fieldErrors keyed by input path. Avoid leaking provider bodies, account existence, or unrelated tenants. |
| Dates and money | UTC RFC 3339 timestamps, ISO local dates for due and payment dates, IANA time zone for business boundaries. Monetary strings contain signed base-10 integers in ISO currency minor units. EUR 230.00 is "23000". Parse with BigInt/decimal. Rates are integer basis points, so 20% is 2000. |
| Lists | Cursor pagination defaults to 25, maximum 100. Return items and optional nextCursor. Bind opaque cursors to tenant, filters, sort and statement snapshot. Sort ledger entries by effectiveAt then id descending. Reject a cursor reused with different scope or filters. |
| Mutations and retry | Where declared, clients supply a fresh UUID Idempotency-Key per user intent. Bind actor, operation, resource, key and canonical request hash. Commit response and effects together. Same key/body replays the original outcome; same key with different content gives 409. Reserve or lock the key before executing. Use business uniqueness as a second line of protection. |
| HTTP status | 201 creates a resource, 202 accepts asynchronous work, 204 has no body. 400 covers malformed input, 401 authentication, 403 role restriction, 404 inaccessible resource, 409 state conflict, 410 expired/revoked links, 422 unprocessable domain input, and 429 throttling. A 5xx or lost response can leave the outcome unknown. |
| Webhooks | requestBody represents the vendor envelope. Verify raw bytes or configured header before parsing or queueing. The provider authentication is documented per operation and adapter; browser sessions confer no access. Return success only after durable commit. |

An invitation to a founder requires companyId and productId on acceptance. Verify membership and same-company ownership. An invitation to a rep derives both from the invitation's engagement. Token-bearing requests use POST bodies. A login request can carry the invitation token. Resolve its digest to an invitation ID and bind the ID to the login link and resulting session. Preview or acceptance by invitationId requires that session handoff and a matching verified email. Clear the handoff on acceptance or expiry. A founder may propose a new agreement to a rep who accepted an invitation; joining the engagement does not sign its agreement.

## Worked HTTP example

Given EUR 400.00 accrued, the founder records EUR 150.00 already sent outside the platform. The app submits this body to recordExternalPayment with a newly generated Idempotency-Key.

~~~json
{"currency":"EUR","amountMinor":"15000","paidOn":"2026-11-18","reference":"November commission"}
~~~

After a EUR 100.00 refund on eligible sales at 20%, the statement balance row below assumes all commissions have since become due. The net accrued amount already includes the EUR 20.00 refund adjustment.

~~~json
{"currency":"EUR","accruedMinor":"38000","recordedPaymentsMinor":"15000","outstandingMinor":"23000","dueMinor":"23000","openingStatus":"known"}
~~~

A reused key with a modified amount returns HTTP 409.

~~~json
{"code":"IDEMPOTENCY_CONFLICT","message":"This request key was already used for a different payment.","requestId":"req_example"}
~~~

On successful `exchangeMagicLink`, the session includes `returnPath: "/portfolio"` when that destination was supplied to `requestMagicLink`. Keep the destination on the app's allowlist. `getSession` returns the current context without a return path.
