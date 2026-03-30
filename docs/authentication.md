---
layout: default
title: Authentication
description: Authentication modes, sessions, and access control in Rest2MC Gateway.
---

<section class="docs-page">

# Authentication

Rest2MC Gateway separates administrator access to the product from runtime access to published MCP servers. This page covers the admin-side authentication model that governs who can configure and publish the gateway.

## Authentication modes

The currently implemented admin authentication flow is `local`.

With `local` authentication:

- administrators sign in with username and password
- the admin API issues a JWT for the session
- protected admin endpoints validate that JWT on subsequent requests

The data model already includes an `oidc` auth mode value for future expansion, but this repository does not currently expose an OIDC sign-in flow.

## Local bootstrap admin

Rest2MC Gateway creates an initial local administrator automatically on startup using the bootstrap settings in `.env`.

That bootstrap flow creates:

- the initial organization, if it does not already exist
- a local admin user tied to that organization
- a `super_admin` role for the initial user

This is the quickest path to first sign-in and first publish.

## Login and session model

The admin API exposes a login endpoint at `/api/admin/v1/auth/login`.

After successful login:

- the product issues a JWT
- the token represents the authenticated user session
- the token is used to access protected admin endpoints

The admin API also exposes `/api/admin/v1/auth/me` so the UI can resolve the current signed-in user and permissions.

If a token is missing, invalid, or expired, the admin API rejects the request. Expired sessions are surfaced as a specific session-expired condition.

## Roles

Rest2MC Gateway uses role-based access control for the admin surface. The current roles are:

- `super_admin`
- `admin`
- `editor`
- `viewer`

These roles are enforced on admin endpoints. Examples:

- validation and snapshot listing can be viewed by `super_admin`, `admin`, `editor`, and `viewer`
- publishing is limited to `super_admin` and `admin`
- secret management is limited to `super_admin` and `admin`
- scope creation and updates are available to `super_admin`, `admin`, and `editor`

## Product-level meaning of roles

- `super_admin`: full control, including bootstrap-style administration and publishing
- `admin`: operational ownership of configuration, secrets, and publishing
- `editor`: can shape draft configuration but cannot publish
- `viewer`: read-only access for review, validation, and visibility

## Recommended practice

For local evaluation, the built-in local username/password flow is the fastest path.

For the current implementation:

- use explicit secret values
- limit who receives publish-capable roles
- separate draft editing from publish approval
- keep runtime and admin access policies clearly distinct

## Runtime note

This page describes authentication for operating the product itself. Published MCP servers have their own runtime behavior and server configuration, which is covered in [Publishing and Runtime]({{ '/runtime-publishing/' | relative_url }}).

</section>
