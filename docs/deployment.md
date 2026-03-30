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

- provide a real `SECRET_ENCRYPTION_KEY`
- provide a real `BOOTSTRAP_ADMIN_PASSWORD`
- use persistent storage for the embedded database, which defaults to `./data/db`

## Build and start

Build the application:

```bash
npm run build
```

Start the server:

```bash
npm start
```

## Deployment notes

- the supported deployment path is a direct Node.js process
- the server includes the admin UI, admin API, and runtime endpoints
- the documented storage path is the embedded PGlite database
- make sure the embedded database path is on persistent storage; by default this is `./data/db`
- the application persists its admin JWT signing secret in the database, encrypted with `SECRET_ENCRYPTION_KEY`
- the application runs in production mode when started with production configuration, so required secrets must be provided explicitly

## Recommended next step

For production documentation, add a deployment guide specific to your environment, including secret injection, backups, database provisioning, and release workflow.

</section>
