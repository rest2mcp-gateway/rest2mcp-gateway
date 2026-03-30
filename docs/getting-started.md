---
layout: default
title: Getting Started
description: First local setup and first publish workflow for Rest2MC Gateway.
---

<section class="docs-page">

# Getting Started

This guide gets Rest2MC Gateway running locally and walks through the first publish flow.

## What you get locally

When the app is running, you have access to:

- the admin UI at `/`
- the admin API at `/api/admin/v1`
- the MCP runtime endpoints at `/mcp`
- API documentation at `/docs`

## 1. Prepare the environment

Copy the sample environment file:

```bash
cp .env.example .env
```

For an initial local run, the default values are usually enough.

The documented database path is the embedded PGlite store at `./data/db`. Override `PGLITE_DATA_DIR` only if you need a different location.

Set explicit values for:

- `SECRET_ENCRYPTION_KEY`
- `BOOTSTRAP_ADMIN_PASSWORD`

On first startup, the app generates its JWT signing secret automatically and stores it encrypted in the database.

## 2. Install dependencies

```bash
npm install
```

## 3. Start the product

```bash
npm run dev
```

Open the UI in your browser:

```text
http://localhost:3000
```

## 4. Sign in

Use the bootstrap admin username configured in `.env`.

Default example:

```text
admin
```

Use the bootstrap password from `.env`.

## 5. Create your first publishable configuration

A common first setup looks like this:

1. Sign in with the bootstrap admin.
2. Review or update the default organization.
3. Add a backend API.
4. Add backend resources manually or import an OpenAPI definition.
5. Create an MCP server.
6. Create one or more tools.
7. Add the mappings between tools and backend resources.
8. Configure any required scopes, secrets, and runtime settings.
9. Validate the draft.
10. Publish the runtime snapshot.

## 6. Verify the runtime is live

After publishing, the runtime endpoints under `/mcp` can serve the MCP-facing configuration from the same deployment.

## Useful commands

```bash
npm run dev
npm run build
npm start
npm test
npm run db:generate
npm run db:push
```

</section>
