# Tests

## Backend Integration Tests

Current backend integration coverage lives in `tests/integration/runtime.workflows.test.ts`.

These tests are workflow-oriented. They do not heavily test each admin API in isolation. Instead, they build real draft config through admin endpoints, publish it, and then verify the resulting public runtime behavior.

### Test Harness

Each integration test does the following setup:

1. Creates a fresh temporary directory under the OS temp directory.
2. Forces the app to use `DATABASE_PROVIDER=pglite`.
3. Points `PGLITE_DATA_DIR` at the temporary database directory.
4. Sets fixed test secrets and bootstrap admin credentials.
5. Builds the app only after test environment values are in place.
6. Starts a tiny real local HTTP stub backend server on a random port.
7. Tears down the Fastify app, closes the stub backend, and deletes the temp directory.

This keeps tests isolated and ensures the local `./data/db` database is never touched.

### Shared Workflow

Most tests follow this sequence:

1. Log in through `/api/admin/v1/auth/login` using the bootstrapped local admin.
2. Create a backend API pointing at the stub backend base URL.
3. Create a backend resource with:
   - `POST /widgets/{widgetId}`
   - a JSON body template using runtime tool inputs
4. Create a public MCP server.
5. Create a tool attached to that MCP server.
6. Create the tool mapping through the tool payload so the tool points at the backend resource.
7. Validate config through `/api/admin/v1/config/validate/:organizationId`.
8. Publish through `/api/admin/v1/config/publish`.
9. Exercise the public runtime under `/mcp/...`.

### Covered Workflows

#### 1. Minimal Publish and Runtime Discovery/List

This test verifies that a minimal public runtime can be created and published successfully.

Steps:

1. Build the draft configuration through admin APIs.
2. Validate and publish the organization config.
3. Call the public protected-resource metadata endpoint:
   - `GET /mcp/.well-known/oauth-protected-resource/:organizationSlug/:serverSlug`
4. Assert that the published runtime is exposed as a public resource with no authorization servers.
5. Call the runtime with `initialize`.
6. Assert that public `initialize` succeeds.
7. Call the runtime with `tools/list`.
8. Assert that the published tool appears with the expected name, title, description, schemas, and annotations.

#### 2. Runtime Execution Success

This test verifies that a published tool call reaches the real stub backend and returns the expected runtime result.

Steps:

1. Register a stub backend handler for:
   - `POST /widgets/widget-42`
2. Build the draft configuration through admin APIs.
3. Validate and publish the organization config.
4. Call runtime `tools/call` for the published tool.
5. Assert that the stub backend received:
   - the expected HTTP method and path
   - the rendered JSON request body
   - the expected request headers
6. Assert that runtime returns:
   - `content`
   - `structuredContent`
   - `isError: false`

#### 3. Runtime Execution Error Propagation

This test verifies that backend HTTP failures are surfaced through the runtime result rather than being silently swallowed.

Steps:

1. Register a stub backend handler for:
   - `POST /widgets/widget-99`
   - response status `502`
   - JSON error body
2. Build the draft configuration through admin APIs.
3. Validate and publish the organization config.
4. Call runtime `tools/call` for the published tool.
5. Assert that runtime returns:
   - the backend error payload in `content`
   - the backend error payload in `structuredContent`
   - `isError: true`

#### 4. Republish Refreshes Published Runtime State

This test verifies that a second publish updates what the runtime serves.

Steps:

1. Build the draft configuration through admin APIs.
2. Validate and publish the initial snapshot.
3. Update the tool description through the admin API.
4. Validate and publish again.
5. Call runtime `tools/list`.
6. Assert that runtime now reflects the updated published description.

#### 5. Runtime Execution Against API-Key Protected Backend

This test verifies that runtime applies configured backend API key authentication on outbound tool calls.

Steps:

1. Register a stub backend handler for:
   - `POST /widgets/widget-api-key`
   - require API key in header `x-api-key`
   - expected value `stub-secret-key`
2. Create a backend API with:
   - `authType: api_key`
   - `apiKeyLocation: header`
   - `apiKeyName: x-api-key`
   - `apiKeyValue: stub-secret-key`
3. Build the rest of the draft configuration through admin APIs.
4. Validate and publish the organization config.
5. Call runtime `tools/call` for the published tool.
6. Assert that the stub backend received the correct `x-api-key` header.
7. Assert that runtime returns a successful result from the protected backend.

#### 6. Runtime Execution Against Query API-Key Protected Backend

This test verifies that runtime applies backend API key authentication in query-string form on outbound tool calls.

Steps:

1. Register a stub backend handler for:
   - `POST /widgets/widget-query-key`
   - require query parameter `api_key`
   - expected value `stub-query-key`
2. Create a backend API with:
   - `authType: api_key`
   - `apiKeyLocation: query`
   - `apiKeyName: api_key`
   - `apiKeyValue: stub-query-key`
3. Build the rest of the draft configuration through admin APIs.
4. Validate and publish the organization config.
5. Call runtime `tools/call` for the published tool.
6. Assert that the stub backend received the correct query parameter.
7. Assert that runtime returns a successful result from the protected backend.

#### 7. Protected MCP Runtime with Stub JWKS Authorization Server

This test verifies the public metadata and bearer-token validation flow for a protected MCP server.

Steps:

1. Start a tiny authorization server stub on a random local port.
2. Expose:
   - `/.well-known/jwks.json`
   - `/.well-known/oauth-authorization-server`
3. Generate signing keys for the stub authorization server.
4. Configure the organization auth server through:
   - `PUT /api/admin/v1/security/auth-server`
5. Create a scope and attach it to the tool during tool creation.
6. Create a protected MCP server with:
   - `accessMode: protected`
   - a concrete `audience`
7. Build the rest of the draft configuration through admin APIs.
8. Validate and publish the organization config.
9. Call:
   - `GET /mcp/.well-known/oauth-protected-resource/:organizationSlug/:serverSlug`
10. Assert that protected-resource metadata includes:
   - the authorization server issuer
   - the protected resource name
   - the scopes required by the published tools
11. Call the protected runtime without a bearer token.
12. Assert that protected `initialize` without a token returns `401` plus a `WWW-Authenticate` challenge.
13. Mint a bearer token locally using the stub authorization server signing key with the correct audience and scope.
14. Call protected `initialize` with the bearer token.
15. Assert that protected `initialize` succeeds.
16. Call protected `tools/list` without a token.
17. Assert that protected `tools/list` without a token returns `401`.
18. Call protected `tools/list` with the bearer token.
19. Assert that `tools/list` succeeds and returns scope annotations for the tool.
20. Mint a bearer token locally using the stub authorization server signing key with the wrong scope.
21. Call runtime `tools/call` with the wrong-scope token.
22. Assert that runtime returns `403 insufficient_scope`.
23. Call runtime `tools/call` with the correct-scope token.
24. Assert that the request succeeds and that runtime accepts the token.

### Runtime Protocol Notes

The current runtime implementation is anchored to the MCP SDK streamable HTTP transport.

The integration tests therefore use:

- runtime metadata discovery via the `.well-known/oauth-protected-resource` endpoint
- runtime POST requests with `Accept: application/json, text/event-stream`
- SSE response parsing for runtime responses

This is intentional and matches the current runtime behavior rather than an older hand-rolled JSON-RPC shape.

### Protected Runtime Scope Enforcement

Protected runtime auth now validates:

- bearer token presence
- token signature via remote JWKS
- issuer
- audience
- required tool scopes for `tools/call`

Protected-resource metadata also advertises the union of published tool scopes for the server via `scopes_supported`.
