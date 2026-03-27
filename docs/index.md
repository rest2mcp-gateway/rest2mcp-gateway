---
layout: default
title: Home
description: Rest2MC Gateway is a no-code gateway for publishing MCP servers and tools over existing REST APIs.
---

<section class="hero">
  <span class="eyebrow">Rest APIs to MCP</span>
  <h1>Publish MCP servers on top of the APIs you already own.</h1>
  <p class="lead">
    Rest2MC Gateway gives product and platform teams a faster path from existing REST endpoints to MCP-compatible servers and tools, without building one-off wrappers for every integration.
  </p>
  <div class="button-row">
    <a class="button primary" href="{{ '/getting-started/' | relative_url }}">Get started</a>
    <a class="button secondary" href="{{ '/concepts/' | relative_url }}">Explore the model</a>
  </div>
</section>

<div class="grid three">
  <section class="card">
    <div class="kicker">No-code publishing</div>
    <h2>Configure, map, validate, publish</h2>
    <p>Define how your existing backend APIs become MCP tools through a managed workflow instead of custom integration code.</p>
  </section>
  <section class="card">
    <div class="kicker">Operational control</div>
    <h2>Manage runtime behavior centrally</h2>
    <p>Keep mappings, scopes, secrets, and publishing state in one place so teams can ship and update MCP capabilities with fewer moving parts.</p>
  </section>
  <section class="card">
    <div class="kicker">Built for existing systems</div>
    <h2>Start from the APIs you already have</h2>
    <p>Register backend APIs, import OpenAPI definitions, and expose selected operations as MCP tools without redesigning your core services.</p>
  </section>
</div>

<section class="docs-page">

## What Rest2MC Gateway is for

Rest2MC Gateway is a product for teams that want to expose existing REST-based capabilities to MCP clients quickly and consistently. Instead of writing a custom MCP layer for every backend system, you use the gateway to define MCP servers, tools, mappings, policies, and publishing state through a single admin experience.

The result is a shorter path from API inventory to usable MCP tooling.

## Documentation

- [Getting Started]({{ '/getting-started/' | relative_url }}) walks through the first local setup and first publish path.
- [Core Concepts]({{ '/concepts/' | relative_url }}) explains the main objects in the system and how they relate.
- [Authentication]({{ '/authentication/' | relative_url }}) explains sign-in, sessions, auth modes, and admin roles.
- [Publishing and Runtime]({{ '/runtime-publishing/' | relative_url }}) describes validation, snapshots, runtime serving, and tool execution.
- [Secrets and Scopes]({{ '/secrets-and-scopes/' | relative_url }}) covers sensitive values and access boundaries in the gateway model.
- [OpenAPI Import]({{ '/openapi-import/' | relative_url }}) covers the fastest way to bring existing API definitions into the gateway.
- [Deployment]({{ '/deployment/' | relative_url }}) explains how to run the product outside local development.

## Typical workflow

1. Register a backend API or import an OpenAPI definition.
2. Define or review backend resources and callable operations.
3. Create an MCP server and the tools it should expose.
4. Map each tool to the right backend behavior.
5. Add scopes, secrets, and runtime settings.
6. Validate the configuration and publish a runtime snapshot.

</section>
