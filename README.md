# Rest2MC Gateway

Rest2MC Gateway helps teams turn existing REST APIs into MCP servers and tools quickly, without building custom glue code for every integration.

It is designed as a no-code gateway for publishing MCP-compatible capabilities on top of the APIs you already have. Instead of hand-coding wrappers, servers, and tool definitions from scratch, you configure how backend endpoints should be exposed, secured, validated, and published through a single admin experience.

The goal is simple: shorten the path from an existing REST API to a usable MCP server that agents and clients can consume.

Today, Rest2MC Gateway targets the HTTP-based MCP server model, exposing runtime servers over the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) using Streamable HTTP. For protected servers, it also supports the [MCP authorization model](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), including OAuth 2.0 [Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) discovery and bearer-token validation against an external authorization server described by [OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414). In practice, that means this gateway focuses on HTTP runtime interoperability and OAuth-based access control rather than stdio transport or acting as an OAuth authorization server itself.

With Rest2MC Gateway, you can:

- connect existing backend APIs to MCP-facing tools
- define MCP servers and tool catalogs without custom integration code
- manage mappings, scopes, secrets, and access rules in one place
- validate configurations before release
- publish runtime snapshots for consistent MCP execution
- operate everything through both an admin API and a browser-based admin UI

The repository contains the full product: the admin API, the runtime endpoints, and the admin interface served from the same application.

## How it works

At a high level, Rest2MC Gateway turns an existing REST integration into a publishable MCP experience:

1. Add an organization and admins.
2. Register one or more backend APIs.
3. Define backend resources and operations that can be called.
4. Create MCP servers and tools.
5. Map each tool to the backend resource it should execute.
6. Configure scopes, secrets, and other runtime settings.
7. Validate the draft configuration.
8. Publish a runtime snapshot.

Once published, the runtime serves the MCP-facing configuration from the same application.

## Product surfaces

- Admin UI: `/`
- Admin API: `/api/admin/v1`
- Runtime endpoints: `/mcp`
- API docs: `/docs`
- Health check: `/health`

## Getting started

### 1. Prepare the environment

Copy the sample environment file:

```bash
cp .env.example .env
```

For a first local run, the defaults are usually enough.

Prerequisites:

- Node.js 22+
- npm 10+

Notes:

- The default setup uses the embedded PGlite database so you can get running quickly.
- `SECRET_ENCRYPTION_KEY` and `BOOTSTRAP_ADMIN_PASSWORD` must be set explicitly in `.env`.
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
2. Create or review the default organization.
3. Add a backend API.
4. Add backend resources or import an OpenAPI definition.
5. Create an MCP server.
6. Create one or more tools.
7. Add tool mappings.
8. Configure required secrets and scopes.
9. Validate and publish.

## Local development behavior

For local development, Rest2MC Gateway still expects explicit `SECRET_ENCRYPTION_KEY` and `BOOTSTRAP_ADMIN_PASSWORD` values.

The one generated credential is the admin JWT signing secret, which is created automatically on first startup and stored encrypted in the database.

## Production-style deployment

The currently supported deployment path is a direct Node.js process.

For a more persistent deployment:

1. Set real secret values in `.env`.
2. Use the default embedded database path `./data/db`, or override it only if you need a different location.
3. Build the application.
4. Start the server.

Commands:

```bash
npm run build
npm start
```

Deployment notes:

- the application serves the admin UI, admin API, and runtime endpoints from the same server process
- the documented database path is the embedded PGlite store
- the default embedded database path is `./data/db`; override `PGLITE_DATA_DIR` only if you need a different persistent location
- in every environment, `SECRET_ENCRYPTION_KEY` and `BOOTSTRAP_ADMIN_PASSWORD` must be set explicitly
- the JWT signing secret is generated once and stored encrypted in the database
- container packaging may be added later, but it is not the primary supported distribution path today

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

`npm run generate:api` exports the backend OpenAPI document to `frontend/openapi/admin-api.json` and regenerates the frontend API types in `frontend/src/generated/admin-api.d.ts`.

The repository is organized as a root workspace orchestrator plus two application packages: the Fastify backend in `backend/` and the React admin frontend in `frontend/`.

## License

This project is licensed under the Apache License 2.0.

See [LICENSE](./LICENSE) for the full license text and [NOTICE](./NOTICE) for attribution notices distributed with the project.

## Next documentation areas

This README is the product-level overview. The next useful docs to add are:

- core concepts and entity relationships
- environment and deployment configuration
- authentication modes
- publishing flow and runtime behavior
- OpenAPI import workflow
- secrets and scope management
