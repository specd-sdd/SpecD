# Routes Specs Read

## Purpose

Authoritative HTTP contract (methods, paths, query, bodies, status codes) for **Routes Specs Read** under `/v1`. Handlers and OpenAPI MUST match this spec exactly so CLI, agents, and Studio stay aligned. Read routes for workspace specs (subset of `routes-workspaces` consumed by `handler-specs-read`).

## Requirements

### Requirement: read routes mirror workspace spec discovery without reverse change links

This contract covers list, get, outline, context, canonical artifact GET, and search as declared in `api:routes-workspaces`. There MUST NOT be a “linked changes for spec” reverse-lookup endpoint.

### Requirement: POST spec outline accepts draft content

`POST /workspaces/{ws}/specs/{path}/outline` MUST accept JSON body `{ filename: string, content: string }` and MUST call `GetSpecOutline` with `content` + `filename` (draft outline without requiring workspace file). `GET .../outline?filename=` MUST continue to outline saved canonical artifacts.

## Constraints

- HTTP handlers MUST NOT import `@specd/core` from `@specd/ui` or `@specd/client`.
- v1 server auth: `api.auth.type` from `specd.yaml` (never `studio.*`); registry registers only `disabled`; no server-side Bearer enforcement on loopback or `specd ui serve`.
- Artifact save/load MUST use `core:save-change-artifact` and `core:get-change-artifact` — not raw `ChangeRepository.saveArtifact` from HTTP handlers.
- There is no `GET /changes/{name}/validation` resource; use `GET .../status` and `POST .../validate`.
- Canonical workspace spec artifacts are read-only in Studio v1.

## Spec Dependencies

- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — hexagonal delivery layout
- [`default:_global/conventions`](../../default/_global/conventions/spec.md) — naming and module conventions
