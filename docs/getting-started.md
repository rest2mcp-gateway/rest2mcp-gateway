---
layout: default
title: Getting Started
description: First local setup and first publish workflow for a lightweight self-hosted MCP gateway.
---

<section class="docs-page">

# Getting Started

This guide gets Rest2MC Gateway running locally and walks through two concrete examples:

1. JSONPlaceholder, using a public sample REST API with no backend auth
2. IPinfo Lite, using a simple API-key-backed backend

The goal is to get from a clean clone to a working MCP runtime that you can test both in the app and with `curl`.

## What you get locally

When the app is running, you have access to:

- the admin UI at `/`
- the admin API at `/api/admin/v1`
- the MCP runtime endpoints at `/mcp`
- API documentation at `/docs`

## 0. Clone the repository

```bash
git clone git@github.com:rest2mcp-gateway/rest2mcp-gateway.git
cd rest2mcp-gateway
```

## 1. Prepare the environment

The quickest setup path uses the checked-in helper scripts to generate a local `.env` file with:

- a random bootstrap admin password
- a random `SECRET_ENCRYPTION_KEY`
- the default local host and port values

The scripted path requires `openssl`.

### macOS / Linux

```bash
sh ./scripts/setup-secret.sh
```

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-secret.ps1
```

Both scripts print the generated bootstrap password. You will sign in with:

- username: `admin`
- password: the printed generated password

### Manual fallback

If `openssl` is not available, create `.env` manually instead:

```bash
cp .env.example .env
```

Then set:

- `BOOTSTRAP_ADMIN_PASSWORD` to a strong local password
- `SECRET_ENCRYPTION_KEY` to a stable secret string of at least 16 characters

For example:

```env
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-strong-password
SECRET_ENCRYPTION_KEY=replace-with-a-long-stable-secret
PORT=3000
HOST=0.0.0.0
BOOTSTRAP_ADMIN_NAME=Local Admin
```

The generated-script path is preferred because it avoids committing or reusing weak local secrets.

On first startup, the app generates its admin JWT signing secret automatically and stores it encrypted in the database using `SECRET_ENCRYPTION_KEY`.

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

Use the bootstrap credentials you configured in `.env`:

- username: `admin`
- password: the generated password printed by the setup script, or the manual password you set yourself

## 5. Create an MCP server for JSONPlaceholder

Before importing tools, create the MCP server they will be attached to.

1. Open `MCP Servers`.
2. Click `Add Server`.
3. In the `General` tab, create a server with:
   - name: `Posts`
   - slug: `posts`
   - access mode: `Public`
4. Leave the default version as `1.0.0`.
5. Save the server.

You will use this server for the JSONPlaceholder tools.

## 6. Import the JSONPlaceholder example
1. Open the `Posts` server you just created.
2. Click `Import OpenAPI`.
3. Use these values:
   - name: `JSONPlaceholder Posts`
   - slug: `jsonplaceholder-posts`
   - base URL: `https://jsonplaceholder.typicode.com`
   - MCP Server For Exposed Tools: `Posts`
4. Paste the contents of [`../examples/openapi/jsonplaceholder-posts.openapi.json`](../examples/openapi/jsonplaceholder-posts.openapi.json) into `OpenAPI Document`.
5. Click `Preview Import`.
6. Select the operations you want to expose as tools. For the sample walkthrough, expose all four:
   - `listposts`
   - `createpost`
   - `getpost`
   - `updatepost`
7. Click `Import`.

The importer will create the backend API, backend resources, and tool records.

## 7. Validate and publish

In development mode, valid draft changes are auto-published. You do not need a separate manual publish step for this walkthrough.

1. Open `Dashboard`.
2. Confirm the draft is valid and that development auto-publish has applied the latest changes.

After publish, the runtime is available under `/mcp/posts`.

## 8. Test JSONPlaceholder in the app

There are two useful test paths in the UI.

### MCP server test

1. Open `MCP Servers`.
2. Open the `Posts` server.
3. Click `Test MCP`.
4. Click `Test Initialize`.
5. Click `Test List Tools`.

This confirms the runtime is reachable and that the server exposes the imported tools.

### Tool test
1. Return to the `Posts` MCP server detail page.
2. Open the `Tools` tab.
3. Find the `getpost` tool and click `Test`.
4. Leave the generated request body in place or set:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "getpost",
    "arguments": {
      "id": 1
    }
  }
}
```

5. Click `Run Tool Test`.

The response should include the JSONPlaceholder post with `id: 1`.

## 9. Test JSONPlaceholder with curl

Initialize the MCP server:

```bash
curl -X POST http://localhost:3000/mcp/posts \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0.0"
      }
    }
  }'
```

Call `getpost`:

```bash
curl -X POST http://localhost:3000/mcp/posts \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "getpost",
      "arguments": {
        "id": 1
      }
    }
  }'
```

## 10. Create an MCP server for IPinfo

Create a second server for the API-key example.

1. Open `MCP Servers`.
2. Create a server with:
   - name: `IP Lookup`
   - slug: `ip-lookup`
   - access mode: `Public`
3. Save the server.

## 11. Import the IPinfo example

1. Open `Backend APIs`.
2. Open `Import OpenAPI`.
3. Use these values:
   - name: `IPinfo Lite`
   - slug: `ipinfo-lite`
   - base URL: `https://api.ipinfo.io`
   - MCP Server For Exposed Tools: `IP Lookup`
4. Paste the contents of [`../examples/openapi/ipinfo-lite.openapi.json`](../examples/openapi/ipinfo-lite.openapi.json) into `OpenAPI Document`.
5. Click `Preview Import`.
6. Select the exposed tool `lookupip`.
7. Click `Import`.

## 12. Configure the IPinfo API key

After import, open the imported backend API and set:

- `Auth Type`: `API Key`
- `API Key Location`: `Query String`
- `Query Parameter Name`: `token`
- `API Key`: your IPinfo Lite token

Save the backend API.

## 13. Validate and publish again

In development mode, valid draft changes are auto-published here as well.

1. Open `Dashboard`.
2. Confirm the updated draft is valid and that the latest changes have been auto-published.

After publish, the runtime is available under `/mcp/ip-lookup`.

## 14. Test IPinfo in the app

### MCP server test

1. Open `MCP Servers`.
2. Open `IP Lookup`.
3. Click `Test MCP`.
4. Click `Test Initialize`.
5. Click `Test List Tools`.

### Tool test

1. From the `IP Lookup` server detail page, find the `lookupip` tool.
2. Click `Test`.
3. Use a request body like:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "lookupip",
    "arguments": {
      "ip": "8.8.8.8"
    }
  }
}
```

4. Click `Run Tool Test`.

The response should include the IP lookup data returned by IPinfo for the address you requested.

## 15. Test IPinfo with curl

Initialize the MCP server:

```bash
curl -X POST http://localhost:3000/mcp/ip-lookup \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0.0"
      }
    }
  }'
```

Call `lookupip`:

```bash
curl -X POST http://localhost:3000/mcp/ip-lookup \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "lookupip",
      "arguments": {
        "ip": "8.8.8.8"
      }
    }
  }'
```

## Notes

- The JSONPlaceholder walkthrough is fully anonymous on the backend side.
- The IPinfo walkthrough requires your own IPinfo token, but the MCP runtime itself can still stay public because the gateway injects the backend API key.
- The runtime currently expects `Accept: application/json, text/event-stream` on MCP POST requests.
- The checked-in Open-Meteo example is useful for preview and import, but it is not yet auto-exposable as a tool because query parameters are not promoted into tool input schemas.

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
