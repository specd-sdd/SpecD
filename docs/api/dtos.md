---
title: DTOs
sidebar_position: 7
---

# Response and request DTOs

Studio API handlers return **JSON DTOs** defined in `packages/api/src/delivery/http/dto/`. The same shapes are mirrored in `packages/client/src/dto/` for `@specd/client`.

OpenAPI schema names match TypeScript type names (`#/components/schemas/ChangeSummaryDto`, etc.). See [OpenAPI](./openapi.md) to download the machine-readable catalogue.

## Meta

### `HealthDto`

`GET /health`

| Field       | Type     | Description                          |
| ----------- | -------- | ------------------------------------ |
| `status`    | `'ok'`   | Server is up                         |
| `auth.type` | `string` | Effective auth mode (v1: `disabled`) |

## Project

### `ProjectDto`

`GET /project`

| Field         | Type     | Description                               |
| ------------- | -------- | ----------------------------------------- |
| `name`        | `string` | Project display name (directory basename) |
| `projectRoot` | `string` | Absolute project root                     |
| `schemaRef`   | `string` | Active schema reference from config       |
| `workspaces`  | `array`  | `{ name, prefix?, ownership? }`           |
| `approvals`   | `object` | `{ spec, signoff }` gate flags            |
| `auth`        | `object` | `{ type }` API auth mode                  |

### `ProjectStatusDto`

`GET /project/status`

| Field              | Type                     | Description                                                                 |
| ------------------ | ------------------------ | --------------------------------------------------------------------------- |
| `activeChanges`    | `number`                 | Active change count                                                         |
| `drafts`           | `number`                 | Draft count                                                                 |
| `discarded`        | `number`                 | Discarded count                                                             |
| `archived`         | `number`                 | Archived count                                                              |
| `specsByWorkspace` | `Record<string, number>` | Spec counts per workspace                                                   |
| `graph`            | `object`                 | `lastIndexedAt`, `stale`, `fingerprintMismatch`, `fileCount`, `symbolCount` |
| `approvals`        | `object`                 | `specEnabled`, `signoffEnabled`                                             |

### Project context / schema (wire shapes)

| Endpoint                        | Body                                                     | Notes                     |
| ------------------------------- | -------------------------------------------------------- | ------------------------- |
| `GET /project/context`          | `{ content, warnings[] }`                                | Compiled markdown context |
| `GET /project/schema`           | `{ name, version, artifacts[] }` or `{ raw, schemaRef }` | Active schema             |
| `POST /project/schema/validate` | `{ valid, errors[], warnings[] }`                        | Validation result         |

## Changes

### `ChangeSummaryDto`

Lists: `GET /changes`, `/drafts`, `/discarded`; create response `POST /changes`.

| Field          | Type           | Description               |
| -------------- | -------------- | ------------------------- |
| `name`         | `string`       | Change slug               |
| `title`        | `string?`      | Optional display title    |
| `state`        | `string`       | Lifecycle state           |
| `specIds`      | `string[]`     | Associated spec IDs       |
| `updatedAt`    | `string` (ISO) | Last update timestamp     |
| `blockerCount` | `number`       | Blocking conditions count |

### `ChangeDetailDto`

`GET /changes/:name`, most mutating change endpoints.

| Field                | Type                       | Description                                      |
| -------------------- | -------------------------- | ------------------------------------------------ |
| `name`               | `string`                   | Change slug                                      |
| `state`              | `string`                   | Lifecycle state                                  |
| `specIds`            | `string[]`                 | Spec IDs on the change                           |
| `specDependsOn`      | `Record<string, string[]>` | Per-spec dependency lists                        |
| `schemaName`         | `string`                   | Active schema name                               |
| `schemaVersion`      | `number`                   | Schema version                                   |
| `description`        | `string?`                  | Intent description                               |
| `invalidationPolicy` | `string?`                  | `none` \| `surgical` \| `downstream` \| `global` |
| `updatedAt`          | `string`                   | ISO timestamp                                    |
| `history`            | `array`                    | History events (`type`, `at`, `by`, …)           |
| `approvals`          | `object`                   | `specApproved`, `signoffApproved`                |
| `archivedMeta`       | `object?`                  | Present when loaded from archive views           |

### `ChangeStatusDto`

`GET /changes/:name/status`

Rich status for Studio: `blockers`, `nextAction`, `artifacts[]` (per-type file rows with `displayStatus`, `hasDrift`), `review`, `lifecycle.validTransitions`, optional `unchanged` when `ifModifiedSince` matches.

### `ArtifactListDto` / `ArtifactListEntryDto`

`GET /changes/:name/artifacts`

| Field                       | Type     | Description        |
| --------------------------- | -------- | ------------------ |
| `artifacts[].filename`      | `string` | Tracked file name  |
| `artifacts[].type`          | `string` | Artifact type id   |
| `artifacts[].state`         | `string` | Canonical state    |
| `artifacts[].displayStatus` | `string` | UI-oriented status |

### `ArtifactContentDto`

Artifact reads and save responses.

| Field          | Type      | Description                     |
| -------------- | --------- | ------------------------------- |
| `content`      | `string`  | File body                       |
| `originalHash` | `string`  | Hash for optimistic concurrency |
| `contentHash`  | `string?` | Content hash after save         |
| `updatedAt`    | `string?` | Last write time                 |

**Save request** (`PUT …/artifacts/:filename`): `{ content, originalHash?, force? }`.

### `PreviewResultDto`

`GET|POST /changes/:name/preview`

| Field     | Type     | Description                                    |
| --------- | -------- | ---------------------------------------------- |
| `specId`  | `string` | Spec being previewed                           |
| `files[]` | `object` | `filename`, optional `base`, `merged` per file |

**POST body**: `{ specId, artifactOverrides?: Record<filename, content> }`.

### `CompiledContextDto`

`GET /changes/:name/context`

| Field         | Type           | Description                                  |
| ------------- | -------------- | -------------------------------------------- |
| `content`     | `string`       | Markdown context (empty when unchanged)      |
| `fingerprint` | `string?`      | Context fingerprint                          |
| `status`      | `'unchanged'?` | When `ifModifiedSince` / fingerprint matches |

### `ValidateResultDto`

`POST /changes/:name/validate`

| Field        | Type       | Description                              |
| ------------ | ---------- | ---------------------------------------- |
| `passed`     | `boolean`  | All checks passed                        |
| `failures[]` | `object`   | `message`, optional `artifactId`, `path` |
| `warnings[]` | `string[]` | Non-fatal messages                       |
| `files[]`    | `string[]` | Files touched                            |

### `ValidateBatchResultDto`

`POST /changes/:name/validate-all`

| Field       | Type      | Description                                                            |
| ----------- | --------- | ---------------------------------------------------------------------- |
| `passed`    | `boolean` | Aggregate pass                                                         |
| `total`     | `number`  | Step count                                                             |
| `results[]` | `object`  | Per-step `spec`, `artifact`, `passed`, `failures`, `warnings`, `files` |

### `ImplementationReviewDto`

`GET /changes/:name/implementation-review`

| Field                    | Type       | Description                 |
| ------------------------ | ---------- | --------------------------- |
| `implementationTracking` | `object`   | `trackedFiles[]`, `links[]` |
| `specIds`                | `string[]` | Specs on the change         |

Nested types: `ImplementationLinkDto`, `TrackedImplementationFileDto`, `ImplementationTrackingDto` in `implementation-review.ts`.

### Archived changes

| Endpoint                      | DTO                       | Fields                                                                                        |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /archived-changes`       | list item                 | `name`, `archivedName`                                                                        |
| `GET /archived-changes/:name` | `ArchivedChangeDetailDto` | `name`, `archivedName`, `archivedAt`, `specIds`, `schemaName`, `schemaVersion`, `artifacts[]` |

## Workspaces and specs

### `WorkspaceDto`

`GET /workspaces`

| Field       | Type       | Description         |
| ----------- | ---------- | ------------------- |
| `name`      | `string`   | Workspace id        |
| `prefix`    | `string?`  | Spec ID prefix      |
| `ownership` | `string?`  | Ownership mode      |
| `specsPath` | `string`   | Absolute specs path |
| `codeRoots` | `string[]` | Code roots          |

### `WorkspaceSpecTreeDto`

`GET /workspaces/:ws/specs`

| Field       | Type     | Description                |
| ----------- | -------- | -------------------------- |
| `workspace` | `string` | Workspace id               |
| `specs[]`   | `object` | `specId`, `path`, `title?` |

### `SpecSummaryDto`

`GET /specs/search`

| Field         | Type      | Description                         |
| ------------- | --------- | ----------------------------------- |
| `specId`      | `string`  | Fully qualified spec id (`ws:path`) |
| `workspace`   | `string`  | Workspace                           |
| `path`        | `string`  | Path within workspace               |
| `title`       | `string?` | Metadata title                      |
| `description` | `string?` | Metadata description                |

### `SpecDetailDto`

`GET /workspaces/:ws/specs/{specPath}`

| Field           | Type       | Description                          |
| --------------- | ---------- | ------------------------------------ |
| `specId`        | `string`   | Fully qualified id                   |
| `workspace`     | `string`   | Workspace                            |
| `path`          | `string`   | Spec path                            |
| `title`         | `string?`  | Title                                |
| `description`   | `string?`  | Description                          |
| `dependsOn`     | `string[]` | Dependency spec ids                  |
| `artifacts[]`   | `object`   | `filename`, `hash?`                  |
| `linkedChanges` | `string[]` | Active changes referencing this spec |

Spec context: `{ entries[], warnings[] }`. Outline routes return an array of outline entries (graph-dependent shape).

## Graph

### `GraphStatusDto`

`GET /graph/status`

| Field              | Type              | Description          |
| ------------------ | ----------------- | -------------------- |
| `lastIndexedAt`    | `string \| null`  | Last index timestamp |
| `lastIndexedRef`   | `string \| null`  | VCS ref at index     |
| `fileCount`        | `number`          | Indexed files        |
| `symbolCount`      | `number`          | Indexed symbols      |
| `specCount`        | `number`          | Linked specs         |
| `graphFingerprint` | `string \| null`  | Index fingerprint    |
| `stale`            | `boolean \| null` | Staleness hint       |

### `GraphSearchResultDto`

`GET /graph/search`

| Field         | Type    | Description                                                                           |
| ------------- | ------- | ------------------------------------------------------------------------------------- |
| `symbols[]`   | `array` | `{ workspace, symbol, score, snippet, startLine, endLine }`                           |
| `specs[]`     | `array` | `{ workspace, specId, path, title, description, score, snippet, startLine, endLine }` |
| `documents[]` | `array` | `{ workspace, path, projectRelativePath, score, snippet, startLine, endLine }`        |

### `GraphIndexResultDto`

`POST /graph/index`

Request body:

| Field   | Type       | Description                                         |
| ------- | ---------- | --------------------------------------------------- |
| `force` | `boolean?` | Recreate persistent graph storage before reindexing |

Response body:

| Field               | Type      | Description                             |
| ------------------- | --------- | --------------------------------------- |
| `filesDiscovered`   | `number`  | Files seen during the reindex           |
| `filesIndexed`      | `number`  | Files parsed and written into the graph |
| `filesRemoved`      | `number`  | Files removed from graph state          |
| `filesSkipped`      | `number`  | Files skipped as unchanged/ineligible   |
| `specsDiscovered`   | `number`  | Specs seen while rebuilding coverage    |
| `specsIndexed`      | `number`  | Specs linked into graph coverage        |
| `errors`            | `array`   | `{ filePath, message }` indexing errors |
| `duration`          | `number`  | Total indexing time in milliseconds     |
| `workspaces`        | `array`   | Per-workspace breakdown rows            |
| `vcsRef`            | `string?` | VCS ref captured for this index         |
| `graphFingerprint`  | `string`  | Fingerprint of the resulting graph      |
| `fullRebuildReason` | `string?` | Reason for a forced full rebuild        |

### `GraphImpactDto`

`GET /graph/impact` — `target`, `direction`, `symbols[]`, optional `files[]` with risk levels.

### `ChangeGraphViewDto`

`GET /graph/changes/:name` — `changeName`, `specIds`, `specs[]` with `coveredFiles` and `coveredSymbols`.

### `GraphSpecCoverageDto`

`GET /graph/specs/:workspace/:specPath` — `specId`, `files[]`, `symbols[]`.

## Logs

### `LogReadDto`

`GET /logs`

| Field     | Type        | Description                                         |
| --------- | ----------- | --------------------------------------------------- |
| `entries` | `array?`    | Structured `{ timestamp, level, message, context }` |
| `lines`   | `string[]?` | Preformatted lines when `prettier=true`             |

## Errors

### `ProblemJson`

All error responses use `application/problem+json`:

| Field    | Type     | Description                  |
| -------- | -------- | ---------------------------- |
| `type`   | `string` | URN `urn:specd:error:{CODE}` |
| `title`  | `string` | Error class                  |
| `status` | `number` | HTTP status                  |
| `detail` | `string` | Message                      |
| `code`   | `string` | Stable code for clients      |

See [Errors](./errors.md). Client mapping: [Client errors](../client/errors.md).

## Client import

```typescript
import type { ChangeDetailDto, SpecdDataPort } from '@specd/client'
```

Port methods return these DTO types; keep API presenters and client DTOs aligned when adding fields.
