---
layout: default
title: Deployment
description: Production-style deployment guidance for Rest2MC Gateway.
---

<section class="docs-page">

# Deployment

This guide covers the basics of running Rest2MC Gateway beyond local development.

## Production priorities

In production, the main concerns are stability, explicit secrets, and predictable runtime configuration.

At minimum:

- provide real values for `JWT_SECRET`
- provide a real `SECRET_ENCRYPTION_KEY`
- provide a real `BOOTSTRAP_ADMIN_PASSWORD` when `AUTH_MODE=local`
- point the product at the right persistent database

## Build and start

Build the application:

```bash
npm run build
```

Start the server:

```bash
npm start
```

## Docker

Build the image:

```bash
docker build -t rest2mc-gateway .
```

Run the image:

```bash
docker run --rm -p 3000:3000 \
  -e JWT_SECRET=replace-me \
  -e SECRET_ENCRYPTION_KEY=replace-me-too \
  -e BOOTSTRAP_ADMIN_PASSWORD=change-this-password \
  -v rest-to-mcp-data:/app/data \
  rest2mc-gateway
```

## Deployment notes

- the container includes the admin UI, admin API, and runtime endpoints
- the default container data path is `/app/data/db`
- a Docker volume is recommended if you use local file-backed storage in the container
- the image runs in production mode, so required secrets must be provided explicitly

## Recommended next step

For production documentation, add a deployment guide specific to your environment, including secret injection, backups, database provisioning, and release workflow.

</section>
