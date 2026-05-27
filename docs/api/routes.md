---
title: Routes
sidebar_position: 5
---

# Route reference

All paths are under the `/v1` prefix. Query and body fields mirror CLI/kernel inputs unless noted.

## Meta

| Method | Path                  | Description                      |
| ------ | --------------------- | -------------------------------- |
| `GET`  | `/health`             | Liveness; returns `auth.type`    |
| `GET`  | `/documentation/json` | OpenAPI 3.1 document (generated) |

## Project

| Method | Path                       | Description                                            |
| ------ | -------------------------- | ------------------------------------------------------ |
| `GET`  | `/project`                 | Resolved project config summary                        |
| `GET`  | `/project/status`          | Counts, graph summary, staleness hints                 |
| `GET`  | `/project/context`         | Compiled project context (`followDeps`, `depth` query) |
| `GET`  | `/project/schema`          | Active schema metadata                                 |
| `POST` | `/project/schema/validate` | Validate project schema                                |

## Logs and Studio output

| Method | Path             | Description                                                    |
| ------ | ---------------- | -------------------------------------------------------------- |
| `GET`  | `/logs`          | Tail project log ring (`limit`, `prettier` query)              |
| `POST` | `/logs`          | Append studio-sourced log line (`level`, `message`, `context`) |
| `GET`  | `/studio/output` | List buffered Studio output entries                            |
| `POST` | `/studio/output` | Append Studio output entry                                     |

## Changes — collections

| Method | Path                      | Description                                                            |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| `GET`  | `/changes`                | Active changes                                                         |
| `POST` | `/changes`                | Create change (`name`, `specIds`, `description`, `invalidationPolicy`) |
| `GET`  | `/changes/overlaps`       | Detect overlapping active changes                                      |
| `GET`  | `/drafts`                 | Draft changes                                                          |
| `GET`  | `/discarded`              | Discarded changes                                                      |
| `GET`  | `/archived-changes`       | Archive index                                                          |
| `GET`  | `/archived-changes/:name` | Archived change detail                                                 |

## Changes — read

| Method | Path                                               | Description                                                                                  |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET`  | `/changes/:name`                                   | Change detail                                                                                |
| `GET`  | `/changes/:name/status`                            | Status, artifact DAG, blockers (`ifModifiedSince`, `refreshImplementation`)                  |
| `GET`  | `/changes/:name/artifacts`                         | Artifact list                                                                                |
| `GET`  | `/changes/:name/artifacts/:filename`               | Artifact file content                                                                        |
| `PUT`  | `/changes/:name/artifacts/:filename`               | Save artifact (`content`, `originalHash`, `force`)                                           |
| `GET`  | `/changes/:name/context`                           | Compiled change context (`step`, `includeChangeSpecs`, `followDeps`, `depth`, `fingerprint`) |
| `GET`  | `/changes/:name/preview`                           | Preview merge (`specId` query)                                                               |
| `POST` | `/changes/:name/preview`                           | Preview with `artifactOverrides`                                                             |
| `POST` | `/changes/:name/artifacts/:filename/outline`       | Outline artifact (optional `content` body)                                                   |
| `GET`  | `/changes/:name/implementation-review`             | Implementation tracking review                                                               |
| `GET`  | `/changes/:name/hook-instructions`                 | Hook instructions (`step`, `phase`)                                                          |
| `GET`  | `/changes/:name/artifacts/:artifactId/instruction` | Artifact instruction text                                                                    |

## Changes — mutate

| Method  | Path                                     | Description                                       |
| ------- | ---------------------------------------- | ------------------------------------------------- |
| `POST`  | `/changes/:name/validate`                | Validate change/spec/artifact                     |
| `POST`  | `/changes/:name/validate-all`            | Batch validate                                    |
| `POST`  | `/changes/:name/transition`              | Lifecycle transition (`to`, `skipHookPhases`)     |
| `POST`  | `/changes/:name/draft`                   | Move to drafts                                    |
| `POST`  | `/changes/:name/restore`                 | Restore from draft                                |
| `POST`  | `/changes/:name/discard`                 | Discard (`reason`)                                |
| `POST`  | `/changes/:name/archive`                 | Archive change                                    |
| `POST`  | `/changes/:name/approve-spec`            | Spec approval gate                                |
| `POST`  | `/changes/:name/approve-signoff`         | Signoff approval gate                             |
| `POST`  | `/changes/:name/invalidate`              | Invalidate (`reason`, `force`)                    |
| `POST`  | `/changes/:name/skip-artifact`           | Skip artifact (`artifactId`)                      |
| `PATCH` | `/changes/:name`                         | Edit metadata / spec sets / policy                |
| `PATCH` | `/changes/:name/spec-ids`                | Add/remove spec IDs                               |
| `PATCH` | `/changes/:name/spec-dependencies`       | Update spec deps (`specId`, `add`/`remove`/`set`) |
| `PATCH` | `/changes/:name/implementation-tracking` | Patch implementation tracking payload             |

## Workspaces and specs

| Method | Path                             | Description                                    |
| ------ | -------------------------------- | ---------------------------------------------- |
| `GET`  | `/workspaces`                    | Workspace list                                 |
| `GET`  | `/workspaces/:ws/specs`          | Spec tree for workspace                        |
| `GET`  | `/specs/search`                  | Search specs (`q`, optional `workspace`)       |
| `POST` | `/workspaces/:ws/specs/validate` | Validate specs in workspace (`specPath` query) |

### Workspace spec wildcard

`GET` and `POST` `/workspaces/:ws/specs/*` dispatch on the trailing path:

| Suffix pattern                    | Method         | Description                                                       |
| --------------------------------- | -------------- | ----------------------------------------------------------------- |
| `{specPath}`                      | `GET`          | Spec detail                                                       |
| `{specPath}/artifacts/{filename}` | `GET`          | Canonical artifact content                                        |
| `{specPath}/context`              | `GET`          | Spec context entries                                              |
| `{specPath}/outline`              | `GET` / `POST` | Outline (`filename`, `artifactId`; POST may send draft `content`) |
| `{specPath}/metadata`             | `POST`         | Save metadata or `generate: true`                                 |

`specPath` uses slash segments (for example `auth/login` for spec id `default:auth/login` when `ws` is `default`).

## Code graph

| Method | Path                        | Description                                                      |
| ------ | --------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/graph/status`             | Index statistics                                                 |
| `POST` | `/graph/index`              | Index workspaces (`workspaces` body)                             |
| `GET`  | `/graph/search`             | BM25 search (`q`, `symbols`, `specs`, `limit`, `workspace`)      |
| `GET`  | `/graph/impact`             | Symbol or file impact (`symbol` or `file`, `direction`, `depth`) |
| `GET`  | `/graph/hotspots`           | Hotspot report (`minRisk`, `limit`)                              |
| `GET`  | `/graph/specs/:workspace/*` | Coverage for spec id `workspace:path`                            |
| `GET`  | `/graph/changes/:name`      | Graph view for change specs                                      |

## Response DTOs

JSON shapes are documented in [DTOs](./dtos.md) and declared in OpenAPI under `components.schemas` (see [OpenAPI](./openapi.md)). Source: `packages/api/src/delivery/http/dto/`, mirrored in `packages/client/src/dto/`.

When adding routes, update `registerV1Routes`, route `schema` blocks (and `openapi-schemas.ts` when new DTOs are needed), this page, and [DTOs](./dtos.md) in the same change.
