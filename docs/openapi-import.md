---
layout: default
title: OpenAPI Import
description: Import existing API definitions into Rest2MC Gateway.
---

<section class="docs-page">

# OpenAPI Import

For many teams, the fastest way to onboard an internal API into Rest2MC Gateway is to start from an OpenAPI definition.

## Why import from OpenAPI

OpenAPI import helps accelerate the earliest stage of setup:

- it reduces manual data entry
- it gives teams a starting inventory of backend operations
- it shortens time to first MCP server and tool mapping

## Typical use

Use OpenAPI import when you already have a documented REST API and want to bring its structure into the gateway as the basis for further configuration and internal MCP testing.

## Recommended workflow

1. Open the import flow in the admin UI.
2. Provide the OpenAPI definition to the gateway.
3. Review the imported backend API and resources.
4. Clean up naming or remove anything that should not be exposed.
5. Create MCP servers and tools using the imported structure.
6. Add mappings and runtime settings.
7. Validate and publish.

## Important boundary

Importing an OpenAPI definition does not remove the need for curation. Not every backend operation should become a public MCP tool. Teams should still review the imported model before publishing it.

## Best practices

- import first, then curate
- keep tool names task-oriented, not backend-oriented
- expose only the operations that are safe and useful for clients
- use scopes and secrets to control runtime access
- validate before every publish

## Example specs in this repository

The repository includes small checked-in OpenAPI examples under `examples/openapi/`:

- `jsonplaceholder-posts.openapi.json` for CRUD-style tool generation
- `open-meteo-forecast.openapi.json` for query-parameter preview and resource import
- `ipinfo-lite.openapi.json` for a simple API-key-backed lookup flow

Today, query, header, and cookie parameters are imported into backend resources but are not yet auto-exposed as MCP tool inputs. In practice, that means examples like Open-Meteo are useful for previewing and importing structure, while examples like JSONPlaceholder and IPinfo are better suited for end-to-end generated tool tests.

</section>
