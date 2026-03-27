# Rest2MC Gateway

Rest2MC Gateway helps teams turn existing REST APIs into MCP servers and tools quickly, without building custom glue code for every integration.

It is designed as a no-code gateway for publishing MCP-compatible capabilities on top of the APIs you already have. Instead of hand-coding wrappers, servers, and tool definitions from scratch, you configure how backend endpoints should be exposed, secured, validated, and published through a single admin experience.

The goal is simple: shorten the path from an existing REST API to a usable MCP server that agents and clients can consume.

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

Notes:

- The default setup uses local file-backed storage so you can get running quickly.
- In local development, some secrets can be generated automatically if you leave them empty.
- If `AUTH_MODE=local` and `BOOTSTRAP_ADMIN_PASSWORD` is blank, a password is generated once and stored in `./data/dev-secrets.json`.

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

Use the bootstrap admin email from `.env`:

```text
admin@example.com
```

If you left `BOOTSTRAP_ADMIN_PASSWORD` empty, check `./data/dev-secrets.json` for the generated password.

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

For local development, Rest2MC Gateway is intentionally forgiving:

- a JWT secret can be generated in memory if not provided
- an encryption key can be generated and persisted for local use
- a bootstrap admin password can be generated and persisted for local use

Those local-only generated values are meant to speed up first startup. For production, set explicit values.

## Production-style deployment

For a more persistent deployment:

1. Set real secret values in `.env`.
2. Point the app at your production database.
3. Build the application.
4. Start the server.

Commands:

```bash
npm run build
npm start
```

## Docker

Build the image:

```bash
docker build -t rest2mc-gateway .
```

Run it:

```bash
docker run --rm -p 3000:3000 \
  -e JWT_SECRET=replace-me \
  -e SECRET_ENCRYPTION_KEY=replace-me-too \
  -e BOOTSTRAP_ADMIN_PASSWORD=change-this-password \
  -v rest-to-mcp-data:/app/data \
  rest2mc-gateway
```

Notes:

- The image includes the full product in a single container.
- The default container database path is `/app/data/db`.
- A Docker volume is recommended so PGlite data and generated local state survive container restarts.
- The image sets `NODE_ENV=production`, so `JWT_SECRET`, `SECRET_ENCRYPTION_KEY`, and `BOOTSTRAP_ADMIN_PASSWORD` must be provided when `AUTH_MODE=local`.

## Useful commands

```bash
npm run dev
npm run build
npm start
npm test
npm run db:generate
npm run db:push
```

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
