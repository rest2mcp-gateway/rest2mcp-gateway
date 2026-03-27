---
layout: default
title: Secrets and Scopes
description: How Rest2MC Gateway handles sensitive values and access boundaries.
---

<section class="docs-page">

# Secrets and Scopes

Secrets and scopes are two of the main control layers in Rest2MC Gateway. They help teams publish MCP capabilities without hardcoding sensitive values or losing control over access boundaries.

## Scopes

Scopes represent named access boundaries that can be attached to tools as part of the published configuration.

Each scope can include:

- a name
- a description
- an optional category
- a sensitivity flag

Scopes are useful when you want to:

- distinguish low-risk from high-risk capabilities
- organize permissions by business area or system domain
- make access intent clearer across a large tool catalog

## Scope lifecycle

Scopes are managed through the admin API and included in the publishable configuration model.

Current access rules are:

- viewers can list scopes
- editors can create and update scopes
- admins and super admins can fully manage them as part of the broader configuration workflow

## Secrets

Secrets store sensitive values needed by backend integrations, such as API keys, access tokens, passwords, or certificates.

Supported secret types include:

- `api_key`
- `token`
- `password`
- `certificate`
- `other`

## Secret storage modes

Rest2MC Gateway supports two storage modes:

- `database`
- `external_ref`

### Database-backed secrets

With `database` storage, the product stores an encrypted secret value internally. This is the simplest model when you want the gateway to manage the value directly.

### External-reference secrets

With `external_ref` storage, the product stores a reference to an external secret system instead of the plaintext value itself. This is the better fit when your organization already uses a dedicated secret manager and wants Rest2MC Gateway to point to that source of truth.

## What is published

Runtime snapshots include secret metadata, not plaintext secret values. Published snapshots retain information such as:

- secret identity
- storage mode
- external reference
- key version
- metadata
- whether an encrypted value exists

This keeps the published runtime model useful without exposing raw secret material in the snapshot.

## Runtime use of secrets

During runtime execution, backend authentication settings can resolve stored sensitive values for common backend auth patterns, including:

- bearer-style tokens
- OAuth-style access tokens
- basic authentication passwords
- API key values in headers or query parameters

This lets published tools call secured backend APIs without embedding secrets directly into tool definitions.

## Recommended practice

- keep secrets separate from tool definitions
- use `external_ref` when your organization already has a mature secret manager
- use scopes to communicate access intent and sensitivity
- review both scopes and secrets before every publish
- treat high-risk tools and high-sensitivity scopes as a release control boundary, not just metadata

</section>
