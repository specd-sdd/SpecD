# Routes Graph

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Graph** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. HTTP contract for code-graph operations via the SDK host graph factory (`apiContext.createGraphProvider`, `runIndexProjectGraph`) — not CLI/MCP.

## Requirements

### Requirement: GET graph status exposes freshness and stale flag

`GET /v1/graph/status` MUST return fingerprint, stale/freshness flags, and counts sufficient for sidebar warnings.

### Requirement: POST graph index rebuilds the code graph index

`POST /v1/graph/index` MUST trigger reindex via `runIndexProjectGraph` from `@specd/sdk` (using the process-scoped SDK host context). v1 MAY block until completion; async job ids are deferred.

Indexing MUST rebuild the full project graph, not a workspace-scoped subset, so cross-workspace spec-to-symbol and symbol-to-symbol links remain globally consistent.

When the request body includes `force: true`, the handler MUST recreate persistent graph storage before indexing so the run starts from an empty graph. The response MUST return the graph provider's indexing summary DTO, including per-workspace breakdown.

`POST /v1/graph/index` MUST accept only the documented body shape `{ force?: boolean }`. Unknown properties such as `workspaces` MUST be rejected with HTTP 400 `application/problem+json` and code `INVALID_REQUEST`.

### Requirement: graph index preparation mirrors the CLI assembly flow

Before invoking the provider index operation, the API MUST assemble index input through `runIndexProjectGraph` from `@specd/sdk`, which mirrors the CLI assembly flow:

- obtain orchestrated workspaces from `kernel.project.listWorkspaces.execute()`
- derive effective graph config from project `SpecdConfig`
- pass that assembled project-level input into the code-graph provider

The API MUST NOT maintain a separate legacy workspace-target bootstrap path that can drift from CLI behavior.

### Requirement: search impact and hotspots mirror CLI graph commands

`GET /v1/graph/search`, `/graph/impact`, and `/graph/hotspots` MUST accept the same query parameters as the CLI graph commands and return presenter-mapped DTOs.

For graph search, the API MUST support at least:

- `q`
- `workspace`
- `kinds`
- `filePattern`
- `excludePaths`
- `excludeWorkspaces`
- `symbols`
- `specs`
- `documents`
- `limit`

For graph impact, the API MUST support `symbol`, `file`, and `spec` selectors, matching the CLI capability surface.

For graph impact, the API MUST surface aggregate blast-radius metrics, affected spec ids, affected files, and per-symbol traversal `depth` from the underlying graph result.

### Requirement: graph-route inputs are schema-validated

Every `params`, `query`, and `body` shape accepted by this route group MUST be declared in Fastify route schema and validated before handler logic runs.

Search queries MUST require `q`. Impact queries MUST require exactly one of `symbol`, `file`, or `spec`, and `direction` / `depth` MUST reject values outside the documented contract. Invalid input MUST return HTTP 400 with `application/problem+json` and code `INVALID_REQUEST`.

### Requirement: spec and change linkage endpoints compose graph with spec scope

`GET /v1/graph/specs/{workspace}/{path}` and `/graph/changes/{name}` MUST return linkage views composed from graph provider plus spec/change scope.

## Constraints

- `@specd/api` delivery and composition code MUST import host bootstrap and kernel types from `@specd/sdk`, not `@specd/core` or `@specd/code-graph` directly.
- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
