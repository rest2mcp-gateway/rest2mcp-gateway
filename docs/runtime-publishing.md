---
layout: default
title: Publishing and Runtime
description: How validation, publishing, snapshots, and runtime execution work in Rest2MC Gateway.
---

<section class="docs-page">

# Publishing and Runtime

Rest2MC Gateway uses a draft-to-publish workflow. Teams shape configuration in the admin experience, validate it, and publish a runtime snapshot that the MCP runtime serves.

## Draft first, runtime second

The product does not execute directly from whatever is currently being edited in the admin UI. Instead, it publishes a runtime snapshot.

That model gives you:

- a controlled release point
- a stable published view of configuration
- a cleaner boundary between editing and execution

## Validation before publish

Before a runtime snapshot is published, the product validates the draft configuration.

The current validation flow checks for issues such as:

- at least one MCP server must exist
- every tool must belong to an existing MCP server
- every tool mapping must reference an existing tool
- every tool mapping must reference an existing backend resource
- every tool must define a backend mapping before publish
- each tool can only define one mapping
- mapped backend resources must belong to the selected backend API

If validation fails, the publish action does not produce a new runtime snapshot.

## What gets published

When validation succeeds, Rest2MC Gateway creates a new published runtime snapshot with a version number.

The snapshot includes the current published view of:

- backend APIs
- backend resources
- MCP servers
- tools
- scopes
- tool mappings
- tool-to-scope relationships
- secret metadata

The runtime does not expose plaintext secret values in the snapshot. Instead, it stores secret presence and metadata needed for execution.

## Published versions

Each publish increments the snapshot version for the organization. Publish events and audit events are recorded so teams can see what changed and when a release happened.

## Runtime endpoints

Published MCP runtime behavior is served under:

`/mcp/:organizationSlug/:serverSlug`

The runtime supports JSON-RPC over HTTP and handles methods such as:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

## How tool execution works

At runtime, the product:

1. loads the latest published snapshot for the organization
2. compiles the active servers, tools, backend APIs, and mappings
3. resolves the requested tool by server and tool name
4. renders path and body templates using tool input
5. applies backend authentication settings
6. calls the target backend API
7. returns the result as MCP-compatible tool output

Only published and active objects are included in runtime compilation.

## Runtime caching

The product caches compiled runtime state per organization. When a new snapshot is published, that runtime cache is invalidated so the next runtime access reflects the new published version.

## Operational implication

The key product behavior to remember is simple:

- draft changes are not runtime changes
- publish is the release step
- the runtime serves the latest published snapshot, not the latest unsaved or unvalidated draft

</section>
