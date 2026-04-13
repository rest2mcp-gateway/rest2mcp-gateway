---
layout: default
title: Core Concepts
description: The main objects and relationships inside Rest2MC Gateway.
---

<section class="docs-page">

# Core Concepts

Rest2MC Gateway is built around the path from an internal REST capability to a published MCP tool. The main concepts below describe that model.

## Organization

An organization is the top-level management boundary. It groups the APIs, users, servers, tools, and configuration managed through the gateway.

## Users

Users access the admin experience and operate the gateway. A bootstrap admin can be created for local or first-time setup.

## Backend APIs

A backend API represents a REST API you want to expose through MCP. In the current product positioning, the primary target is internal APIs used for development, testing, and controlled internal access.

## Backend resources

Backend resources describe the callable units inside a backend API. They represent the operations or endpoints that can later be mapped to MCP tools.

## MCP servers

An MCP server is the published MCP-facing surface. It groups the tools you want agents and clients to see together.

## Tools

Tools are the MCP operations exposed to clients. In Rest2MC Gateway, tools are configured objects, not hand-written wrappers.

## Tool mappings

Tool mappings connect a published tool to the backend behavior that should be executed. This is where the gateway translates the MCP-facing contract into the backend API call path.

## Scopes

Scopes represent access boundaries or permissions that can be used to control which capabilities are available and under what conditions.

## Secrets

Secrets store sensitive runtime values used by backend integrations. The gateway keeps secret management separate from tool definitions so sensitive values can be managed centrally.

## Draft configuration

Changes are prepared as draft configuration before they are released to runtime. This gives teams a controlled workflow for reviewing and validating changes.

## Runtime snapshot

A runtime snapshot is the publishable version of the configuration. Once published, it is what the MCP runtime serves and executes against.

## End-to-end flow

The full model usually looks like this:

1. Register a backend API.
2. Define or import backend resources.
3. Create an MCP server.
4. Create tools.
5. Map tools to backend resources.
6. Add scopes and secrets.
7. Validate the draft.
8. Publish a runtime snapshot.

</section>
