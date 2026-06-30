# Routes Specs Read

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Specs Read** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. This route group owns canonical workspace spec detail, artifact read access, outline/context helpers, metadata actions, and spec search.

## Requirements

### Requirement: wildcard spec detail route serves canonical spec detail

`GET /v1/workspaces/{ws}/specs/{path}` MUST resolve the canonical workspace spec and return spec detail metadata including artifact filenames, hashes when known, declared dependencies, and active linked change summaries.

There MUST NOT be a dedicated reverse-lookup route for “linked changes by spec”; linked active change summaries belong in this detail response.

### Requirement: canonical artifact reads stay in specs-read

`GET /v1/workspaces/{ws}/specs/{path}/artifacts/{filename}` MUST return canonical artifact content for display-only use. Studio v1 MUST NOT expose a mutating route for canonical workspace artifacts.

### Requirement: POST spec outline accepts draft content

`POST /workspaces/{ws}/specs/{path}/outline` MUST accept JSON body `{ filename: string, content: string }` and MUST call `GetSpecOutline` with `content` + `filename` (draft outline without requiring workspace file). `GET .../outline?filename=` MUST continue to outline saved canonical artifacts.

### Requirement: metadata actions are exposed on the wildcard spec route

`POST /v1/workspaces/{ws}/specs/{path}/metadata` MUST support two mutually exclusive actions on the canonical spec:

- saving provided metadata content
- generating metadata when `generate=true`

The route group MUST treat metadata as a workspace-spec read-side utility hosted on the wildcard route, even though it performs persistence.

### Requirement: context and search follow canonical spec contracts

`GET /v1/workspaces/{ws}/specs/{path}/context` MUST forward `followDeps` and `depth` query semantics to the canonical spec context use case.

When the caller does not override the shape, the route MUST request the full structured context view for the root spec, enabling grouped `rules`, `constraints`, and `scenarios` sections when metadata provides them.

The spec context response MUST expose the structured `GetSpecContext` shape directly:

- `entries[]` with `spec`, `source`, `mode`, `stale`
- optional `title`, `description`, `optimizedContent`
- optional grouped `rules`, `constraints`, and `scenarios`
- `warnings[]` objects with warning `type`, `message`, and optional `path`

The route MUST NOT coerce spec context into the project/change `CompiledContextDto` markdown shape.

`GET /v1/specs/search` MUST accept `q` and optional `workspace`, delegate to `kernel.specs.search`, and return canonical spec summaries.

### Requirement: spec-read route inputs are schema-validated

Every `params`, `query`, and `body` shape accepted by this route group MUST be declared in Fastify route schema and validated before handler logic runs.

This includes wildcard params, canonical artifact reads, context queries, `GET /specs/search`, POST metadata requests, and outline drafts. Invalid input MUST return HTTP 400 with `application/problem+json` and code `INVALID_REQUEST`.

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
