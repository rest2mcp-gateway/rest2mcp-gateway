# Rest2MC Gateway

A lightweight self-hosted gateway for turning internal REST APIs into MCP servers for development, testing, and controlled internal use.

Rest2MC Gateway helps teams turn internal REST APIs into MCP servers and tools quickly, without building custom glue code for every integration.

Status: early-stage (`0.1.0`). Suitable for evaluation, development, testing, and controlled internal use.

It is designed as a self-hosted admin and runtime application for publishing MCP-compatible capabilities on top of APIs you already operate. Instead of hand-coding wrappers, servers, and tool definitions from scratch, you configure how backend endpoints should be exposed, secured, validated, and published through a single admin experience.

The goal is simple: shorten the path from an internal REST API to a usable MCP server that agents and clients can consume in local, staging, and controlled internal environments.

Today, Rest2MC Gateway targets the HTTP-based MCP server model, exposing runtime servers over the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) using Streamable HTTP. For protected servers, it also supports the [MCP authorization model](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), including OAuth 2.0 [Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) discovery and bearer-token validation against an external authorization server described by [OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414). In practice, that means this gateway focuses on HTTP runtime interoperability and OAuth-based access control rather than stdio transport or acting as an OAuth authorization server itself.

Current limitations:

- the gateway currently focuses on the Streamable HTTP transport, not stdio
- the admin and runtime experience is optimized for development, testing, and controlled internal use rather than broad internet-facing edge deployment
- the runtime accepts the MCP Streamable HTTP contract, including `Accept: application/json, text/event-stream`, but the product does not currently provide a separate browser-based SSE session manager or long-lived streaming UX beyond the HTTP runtime surface itself

With Rest2MC Gateway, you can:

- connect internal backend APIs to MCP-facing tools
- define MCP servers and tool catalogs without custom integration code
- manage mappings, scopes, secrets, and access rules in one place
- operate everything through both an admin API and a browser-based admin UI

The repository contains the full product: the admin API, the runtime endpoints, and the admin interface served from the same application.

Today, the default experience is a lightweight self-hosted deployment model: one app process serves the admin UI, the admin API, and the MCP runtime on the same host. The repository includes deployment-oriented documentation, but the quickest path is still local development or controlled internal deployment with the embedded database and a bootstrap admin account.

## How it works

At a high level, Rest2MC Gateway turns an existing REST integration into a publishable MCP server. As an administrator you will:

1. Login into the admin UI.
2. Register one or more backend APIs.
3. Define backend resources and operations that can be called.
4. Create MCP servers and tools.
5. Map each tool to the backend resource it should execute.
6. Configure scopes, secrets, and other runtime settings.

The runtime serves the MCP-facing configuration and acts as an MCP-to-REST translation layer for the internal APIs you publish through it.

## Getting started

### 1. Prepare the environment

Copy the sample environment file:

```bash
cp .env.example .env
```

Then set the required values. You can place them in `.env` for local development or provide them through your shell or deployment environment.

Prerequisites:

- Node.js 22+
- npm 10+

Notes:

- The default setup uses the embedded PGlite database so you can get running quickly.
- `BOOTSTRAP_ADMIN_PASSWORD` must be set so you can sign in as the initial local admin.
- `SECRET_ENCRYPTION_KEY` must be set and kept stable. It encrypts stored secrets and the internally persisted JWT signing secret, so changing it later will prevent the app from decrypting previously stored values.
- `BOOTSTRAP_ADMIN_USERNAME` defaults to `admin`, and `BOOTSTRAP_ADMIN_NAME` defaults to `Local Admin`.
- `HOST` and `PORT` control where the combined UI, admin API, and runtime server listen.
- The application generates its admin JWT signing secret on first startup and stores it encrypted in the database.

### 2. Install dependencies

```bash
npm install
```

### 3. Start the application

```bash
npm run dev
```

This starts Rest2MC Gateway for local development. The browser UI and admin API are available from the same host and port.

### 4. Sign in

Open the app in your browser:

```text
http://localhost:3000
```

Use the bootstrap admin username from `.env`:

```text
admin
```

Use the bootstrap password from `.env`.

### 5. Publish your first gateway configuration

A typical first run looks like this:

1. Sign in as the bootstrap admin.
2. Open the OpenAPI import flow.
3. Import the example spec at [`examples/openapi/jsonplaceholder-posts.openapi.json`](./examples/openapi/jsonplaceholder-posts.openapi.json).
4. Set the backend base URL to `https://jsonplaceholder.typicode.com`.
5. Choose or create an MCP server, for example `posts`.
6. Complete the import so the backend API, resource, and tool are generated.
7. Validate and publish the draft configuration from the admin UI.
8. Call the runtime with the generated MCP server slug.

The example spec in [`examples/openapi/jsonplaceholder-posts.openapi.json`](./examples/openapi/jsonplaceholder-posts.openapi.json) covers four common operations from JSONPlaceholder: list posts, get a single post, create a post, and update a post. After import and publish, a minimal runtime test looks like this:

```bash
curl -X POST http://localhost:3000/mcp/posts \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "getpost",
      "arguments": {
        "id": 1
      }
    }
  }'
```

Additional checked-in examples:

- [`examples/openapi/open-meteo-forecast.openapi.json`](./examples/openapi/open-meteo-forecast.openapi.json) demonstrates a query-parameter-driven API. It is useful for previewing and importing backend resources, but with the current importer it is not auto-exposable as a tool because query parameters are not yet promoted into tool input schemas.
- [`examples/openapi/ipinfo-lite.openapi.json`](./examples/openapi/ipinfo-lite.openapi.json) demonstrates a simple path-parameter lookup API that can be exposed as a tool and then configured with backend API-key auth in the gateway.

See [`docs/openapi-import.md`](./docs/openapi-import.md) for the import workflow and [`docs/runtime-publishing.md`](./docs/runtime-publishing.md) for validation, publish, and runtime behavior.


## Useful commands

```bash
npm run dev
npm run generate:api
npm run check:api
npm run build
npm start
npm test
npm run db:generate
npm run db:push
```

Command summary:

- `npm run dev` starts the development server for the combined application
- `npm run generate:api` exports the backend OpenAPI document to `frontend/openapi/admin-api.json` and regenerates the frontend API types in `frontend/src/generated/admin-api.d.ts`
- `npm run check:api` verifies that the generated OpenAPI artifacts are up to date
- `npm run build` builds the frontend and compiles the backend
- `npm start` runs the production server entrypoint
- `npm test` runs the workspace test suite
- `npm run db:generate` generates Drizzle migration artifacts
- `npm run db:push` pushes the current schema to the configured database

The repository is organized as a root workspace orchestrator plus two application packages: the Fastify backend in `backend/` and the React admin frontend in `frontend/`.

## License

This project is licensed under the Apache License 2.0.

See [LICENSE](./LICENSE) for the full license text and [NOTICE](./NOTICE) for attribution notices distributed with the project.

## Documentation

This README is the product-level overview. For deeper details, use the docs in [`docs/`](./docs/):

- [`docs/getting-started.md`](./docs/getting-started.md)
- [`docs/concepts.md`](./docs/concepts.md)
- [`docs/deployment.md`](./docs/deployment.md)
- [`docs/authentication.md`](./docs/authentication.md)
- [`docs/runtime-publishing.md`](./docs/runtime-publishing.md)
- [`docs/openapi-import.md`](./docs/openapi-import.md)
- [`docs/secrets-and-scopes.md`](./docs/secrets-and-scopes.md)
