# Proposal: specd-studio

## Motivation

SpecD today is driven effectively through the CLI and agent skills, but there is no first-class graphical environment to inspect changes, workspace specs, validation state, and code-graph linkage while staying on the same kernel semantics. Teams need a spec-work IDE (not a generic dashboard) so **humans** can repeatedly review change artifacts — proposals, deltas, design, tasks — with **Save** and **Validate** actions, in-editor text search, preview/diff, and the same honesty guarantees as the CLI (optimistic concurrency, structural validation, no silent overwrites when an agent edited the same file).

## Current behaviour

- **Workflow:** Users run `specd` commands and agent skills against `@specd/core` via the CLI or MCP. Lifecycle, validation, artifacts, and context compilation are well specified but terminal-oriented.
- **Packages:** `packages/api`, `packages/client`, `packages/ui`, `apps/specd-studio-web`, and `apps/specd-studio-desktop` exist as placeholders with workspaces registered in `specd.yaml`; they export no product behaviour yet.
- **Public site:** `apps/public-web` is a separate Docusaurus marketing/docs site and is not an operational Studio IDE.
- **Gaps:** No HTTP API adapter, no shared React UI, no serve commands, no desktop dual connection, no Monaco/delta preview UX.

## Proposed solution

Deliver **SpecD Studio** as a layered product on top of existing **core** use cases (see `specd-studio-api-and-ui.md` for HTTP paths and UI tabs).

| Layer                  | Role                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `@specd/api`           | Hexagonal HTTP delivery: handlers → **existing** `kernel.*` / graph provider → presenters → DTOs |
| `@specd/client`        | `SpecdDataPort`, DTOs, HTTP/IPC transports, remote/memory/desktop adapters                       |
| `@specd/ui`            | React IDE + data hooks; **never** imports `@specd/core`                                          |
| `specd-studio-web`     | Remote-only Vite host                                                                            |
| `specd-studio-desktop` | Electron main (kernel) + preload IPC + remote profile                                            |
| `@specd/cli`           | `specd serve`, `specd ui serve`                                                                  |

**Core change required for Studio:** add `**updatedAt`** on the change manifest (and expose on `Change` / `GetStatus`) so API and UI can poll with `ifModifiedSince` and skip work when an external agent has not persisted. No new lifecycle use cases; validation history events are **out of scope\*\* (later).

API handlers otherwise delegate to existing use cases. New logic in `@specd/api` is **auth registry + resolution**, presentation, HTTP binding, conditional status reads, and graph provider composition.

Phased delivery: read-only API/UI → mutations/artifact edit → graph UI → desktop polish.

## Granularity policy (binding for this change)

**Spec ID format:** `<workspace>:<capability-path>` — same as `cli:change-status` or `core:kernel`. The capability path MAY contain slashes (e.g. `default:_global/architecture`) but MUST NOT repeat the workspace prefix (wrong: `api:api/dto-project`; right: `api:dto-project`). Files live at `specs/<workspace>/<capability-path>/spec.md`.

**Do not** use one umbrella spec per package. Split every **divisible** boundary: domain value object, port, adapter, middleware, composition factory, route contract, handler, presenter, DTO, client transport, UI tab, data hook, IPC channel.

| Slice type                 | Granularity rule                                                                             | Example ID                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Domain (package-local)** | One spec per value object / entity with invariants                                           | `api:domain-api-actor`                                                |
| **Port**                   | One spec per `application/ports/*` abstract port                                             | `api:port-api-token-verifier`                                         |
| **Adapter**                | One spec per infrastructure implementation of a port                                         | `api:adapter-static-token-verifier`                                   |
| **Middleware**             | One spec per HTTP middleware concern                                                         | `api:middleware-auth`                                                 |
| **Composition**            | One spec per exported factory (`createApiServer`, `createApiContext`, graph provider)        | `api:composition-create-api-server`                                   |
| **HTTP route contract**    | One spec per route group (paths, query, body, status codes)                                  | `api:routes-changes-read`                                             |
| **HTTP handler**           | One spec per handler module wiring route → kernel/graph → presenter                          | `api:handler-changes-read`                                            |
| **Presenter**              | One spec per presenter module (entity/result → DTO); separate from DTO wire shape            | `api:presenter-change`                                                |
| **DTO**                    | One spec per JSON/stable response or request body type                                       | `api:dto-change-status`                                               |
| **Client port**            | One spec per `SpecdDataPort` method group                                                    | `client:port-changes-read`                                            |
| **Client transport**       | One spec per I/O mechanism (HTTP fetch, IPC envelope)                                        | `client:port-http-transport`                                          |
| **Client adapter**         | One spec per adapter (remote, memory, bearer headers, error mapping)                         | `client:adapter-remote-specd-data`                                    |
| **UI view**                | One spec per tab, sidebar section, inspector mode, bottom tab                                | `ui:change-tab-overview`                                              |
| **UI data hook**           | **Global** poll (project scope) + **tab** poll (open change/spec only); shared fetch helpers | `ui:hooks-project` (global); `ui:hooks-changes-read` (per change tab) |
| **Desktop main/preload**   | Split main process, window, IPC bridge, handler registry                                     | `studio-desktop:ipc-handler-registry`                                 |
| **CLI command**            | One spec per command surface (same pattern as `cli:change-status`)                           | `cli:serve-api`                                                       |

**Pairing rule:** `routes-*` defines the **contract**; `handler-*` defines **wiring** to core (must list kernel use cases invoked). `dto-*` defines **wire shape**; `presenter-*` defines **mapping rules**.

Implementation may colocate files; specs do not.

## Core: `updatedAt` (required in this change)

| Spec ID                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core:change-manifest` | Add top-level `**updatedAt`** (ISO 8601). Immutable `createdAt` stays. On **every** manifest persist (`ChangeRepository.save` / equivalent), set `updatedAt` to the save timestamp — including validate-only writes, artifact saves, transitions, edit, scaffold (`artifacts-synced`), draft/discard paths that rewrite the manifest. On **create**, set `updatedAt` equal to `createdAt`. On **load\*\* of legacy manifests without the field, derive once (e.g. max of `createdAt` and latest `history[].at`) then persist on next save. |
| `core:change`          | `Change` exposes `updatedAt` loaded from manifest; invariant: `updatedAt >= createdAt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `core:get-status`      | `GetStatusResult` (or `change` projection) includes `**updatedAt`\*\* so CLI, API, and UI share one revision clock.                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Where it lives:** manifest.json is the source of truth (same file Studio and agent both update). Do not infer revision from `history` alone — validate mutates `artifacts` without new events.

**Deferred:** `artifacts-validated` history events.

### Core use cases — new vs extend (assessment)

| Need                                        | Recommendation                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**updatedAt` on manifest\*\*               | **Extend** `core:change-manifest`, `core:change`, `core:change-repository-port` (persist on every save)                 | Data model + repository duty, not a new use case                                                                                                                                                                                                                                                                       |
| **Conditional status poll**                 | **Extend** `core:get-status` with optional `ifModifiedSince` → `{ unchanged, updatedAt }` without building artifact DAG | Avoids extra round trip; cheap check after load                                                                                                                                                                                                                                                                        |
| **Separate `GetChangeRevision` use case**   | **Not in v1**                                                                                                           | Redundant if `GetStatus` supports short-circuit; add only if profiling shows status still too heavy                                                                                                                                                                                                                    |
| **Project / global poll**                   | **Reuse** `ListChanges`, `ListDrafts`, `ListDiscarded`, `ListSpecs`, graph stats (same as CLI `project status`)         | No `GetProjectStatus` in core today; API may compose like CLI — optional `GetProjectStatus` later for DRY, not blocking Studio                                                                                                                                                                                         |
| `**GetChange` (detail without status)\*\*   | **Optional**                                                                                                            | `kernel.changes.repo.get()` is already public; handler can map entity → DTO or a thin `GetChange` use case can be added if we forbid repo in API handlers                                                                                                                                                              |
| `**SaveChangeArtifact` (human Save)\*\*     | **New use case** `core:save-change-artifact`                                                                            | Port `saveArtifact()` only writes file bytes; spec requires caller to reset file/artifact to `in-progress` and `save(change)` for manifest + `updatedAt`. Studio PUT and Save button MUST go through a use case (actor, conflict → `ArtifactConflictError`, manifest persist) — not raw `kernel.changes.repo` from API |
| `**GetChangeArtifact` (load for editor)\*\* | **New use case** `core:get-change-artifact` (pair)                                                                      | Wraps `repo.artifact()` → content + `originalHash` for Monaco; keeps HTTP handlers off the port                                                                                                                                                                                                                        |
| **Graph**                                   | **No core UC**                                                                                                          | `createCodeGraphProvider` in `@specd/code-graph` (already in design)                                                                                                                                                                                                                                                   |
| **Validation events in history**            | **Deferred**                                                                                                            | Would need new event type + `ValidateArtifacts` append — not required if `updatedAt` bumps on validate                                                                                                                                                                                                                 |
| **Project/spec global `updatedAt`**         | **Deferred**                                                                                                            | Global poll uses list endpoints; project-wide revision clock is v2 optimization                                                                                                                                                                                                                                        |

**Human review in UI (maps to core/API/UI):**

| Affordance                               | Backend                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| **Save**                                 | `SaveChangeArtifact` → bumps `updatedAt`, returns new hash / conflict |
| **Validate** (per file / artifact / all) | existing `ValidateArtifacts`                                          |
| **Find in editor**                       | `ui:artifact-editor` (Monaco find/replace) — no core use case         |
| **Preview / Full diff**                  | `PreviewSpec` + inspector tabs                                        |

**Conclusion:** **Two new core use cases** (`save-change-artifact`, `get-change-artifact`) plus **deltas** to manifest/change/get-status. `GetProjectStatus` remains optional (compose lists like CLI).

Handlers **MUST NOT** duplicate core rules. Each `handler-*` spec references these existing use cases (representative mapping):

| Handler group                | Core / graph operations (existing specs)                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler-project`            | `GetProjectContext`, project status aggregation                                                                                                                                     |
| `handler-changes-collection` | `CreateChange`, list/get repo, `DetectOverlap`                                                                                                                                      |
| `handler-changes-read`       | `GetStatus`, `GetChangeArtifact`, `CompileContext`, `PreviewSpec`, `GetArtifactInstruction`, `GetHookInstructions`, `GetImplementationReview`, change detail via repo/get as needed |
| `handler-changes-mutate`     | `**SaveChangeArtifact`\*\*, `ValidateArtifacts`, `TransitionChange`, `EditChange`, …                                                                                                |
| `handler-archived-changes`   | `GetArchivedChange`                                                                                                                                                                 |
| `handler-workspaces`         | `SpecdConfig.workspaces`                                                                                                                                                            |
| `handler-specs-read`         | `ListSpecs`, spec repo get, `GetOutline`, `GetContext`, search                                                                                                                      |
| `handler-specs-mutate`       | `ValidateSpecs`, metadata save/generate                                                                                                                                             |
| `handler-graph`              | `createCodeGraphProvider` → index/search/impact/stats ( `@specd/code-graph` )                                                                                                       |

---

## Specs affected

### Modified specs

- `default:_global/architecture`: Add `api`, `client`, `ui`, studio apps to dependency graph; state `@specd/api` follows adapter rules (handlers only, no duplicated domain logic).
- `core:change-manifest`, `core:change`, `core:get-status`: `**updatedAt**` on change manifests (see above).
- `core:config`: `api.auth` in `specd.yaml` (`type`, optional `config`; v1 only `disabled`; startup validation; CLI `--auth` override for serve).

### New core specs (human artifact review)

- `core:save-change-artifact`: Full save pipeline (tracked file guard, approval `force`, optimistic hash, drift reconciliation excluding saved file, `updatedAt` persist). See **SaveChangeArtifact** table below.
- `core:get-change-artifact`: Load tracked artifact body + `originalHash` for editor; handlers MUST NOT call `ChangeRepository.artifact()` directly.

Also **modify** `core:change-repository-port`: shared drift reconciliation hook (same algorithm as `_manifestToChange` / `get`) callable after save.

Depends on: `core:change-repository-port`, `core:change`, `core:actor-resolver-port`, `core:invalidate-change` (approval-guard precedent).

#### `SaveChangeArtifact` — behaviour (v1)

Runs inside `ChangeRepository.mutate(name, fn)`.

**Input:** `name`, `filename`, `content`, `originalHash`, `actor`, optional **`force`** (default `false`).

| Step                        | Rule                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1. Tracked file guard       | `filename` MUST be tracked on the change manifest                                                                        |
| 2. Approval / signoff guard | If `activeSpecApproval` or `activeSignoff` and not **`force`** → `SaveRequiresForceError` (no write)                     |
| 3. Optimistic write         | `saveArtifact` with `originalHash` → mismatch **`ArtifactConflictError`** (API **409**)                                  |
| 4. Post-save file state     | Saved file → `in-progress`; clear validated baseline on that file                                                        |
| 5. Approval invalidation    | With **`force: true`** when approvals active → save + invalidate (`artifact-review-required`), return to **`designing`** |
| 6. Drift reconciliation     | Shared hook on **other** files (exclude just-saved); may `invalidate('artifact-drift')`                                  |
| 7. Persist manifest         | `save(change)` → **`updatedAt`**                                                                                         |

**API/UI:** `PUT` body `{ content, originalHash, force? }`.

---

### Workspace `api` — domain, ports, adapters, middleware

| Spec ID                          | Layer            | Covers                                                                                                        |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `api:domain-api-actor`           | domain           | `ApiActor` value object (`id`, `name`, `email`, optional `roles`)                                             |
| `api:port-api-token-verifier`    | application/port | `verify(token) → ApiActor` or typed auth failure — swappable via registry                                     |
| `api:auth-adapter-registry`      | application      | `register(type, factory)` / `resolve(type, config?)` — extension point for future auth types                  |
| `api:adapter-auth-disabled`      | infrastructure   | **v1 only built-in:** `type: disabled` — no Bearer; actor from core `ActorResolver`                           |
| `api:adapter-api-actor-resolver` | infrastructure   | Bridges request-scoped `ApiActor` into `ActorResolver` when a future type returns an actor                    |
| `api:middleware-auth`            | delivery         | Uses verifier from registry; **v1 pass-through**; 401 only when a future registered type enforces credentials |
| `api:middleware-cors`            | delivery         | Configurable origins for standalone web + remote API                                                          |
| `api:problem-json`               | delivery         | `SpecdError` → RFC 7807 (`presenter-problem` consumes)                                                        |

**Out of this change (deferred):** `bearer` server adapter, JWT, API keys file / credentials subsystem. Reference draft may still mention them — **do not implement from reference alone**.

---

### Workspace `api` — composition & server

| Spec ID                              | Covers                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `api:composition-create-api-server`  | `createApiServer({ authRegistry, auth })` — reads **`specd.yaml` `api.auth`**, `registry.resolve(type)`, wires middleware + routes |
| `api:composition-create-api-context` | Per-request `{ kernel, actor, graphProviderFactory }`                                                                              |
| `api:composition-graph-provider`     | `createCodeGraphProvider(projectConfig)` lifecycle for graph handlers                                                              |
| `api:http-server-bootstrap`          | Listen, `/v1` prefix, health, graceful shutdown                                                                                    |
| `api:http-server-static-ui`          | Optional `@specd/ui` dist mount for `specd ui serve`                                                                               |
| `api:openapi-generation`             | Zod/type → OpenAPI 3.1 document                                                                                                    |
| `api:openapi-docs-route`             | `GET /openapi.json`, `GET /docs` environment policy                                                                                |

Depends on: `default:_global/architecture`, `default:_global/conventions`, `default:_global/error-handling-conventions`, `core:kernel`, `core:actor-resolver`.

---

### Workspace `api` — presenters & DTOs

| Spec ID                       | Covers                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `api:presenter-project`       | Project + project status mapping                                                                   |
| `api:presenter-change`        | Change summary, detail, status, allowed transitions projection                                     |
| `api:presenter-artifact`      | Artifact content + list rows                                                                       |
| `api:presenter-spec`          | Spec summary, detail, tree, preview files                                                          |
| `api:presenter-graph`         | Graph status, search, impact, change-scoped view                                                   |
| `api:presenter-problem`       | Error → problem+json (may share module with `problem-json`)                                        |
| `api:dto-project`             | `ProjectDto` wire shape                                                                            |
| `api:dto-project-status`      | `ProjectStatusDto`                                                                                 |
| `api:dto-change-summary`      | `ChangeSummaryDto`                                                                                 |
| `api:dto-change-detail`       | `ChangeDetailDto`                                                                                  |
| `api:dto-change-status`       | `ChangeStatusDto` includes `**updatedAt**`; conditional response when `ifModifiedSince` is current |
| `api:dto-artifact-content`    | `ArtifactContentDto`                                                                               |
| `api:dto-validate-result`     | `ValidateResultDto`                                                                                |
| `api:dto-compiled-context`    | `CompiledContextDto`                                                                               |
| `api:dto-preview-result`      | `PreviewResultDto`                                                                                 |
| `api:dto-spec-summary`        | `SpecSummaryDto`                                                                                   |
| `api:dto-spec-detail`         | `SpecDetailDto`                                                                                    |
| `api:dto-workspace-spec-tree` | `WorkspaceSpecTreeDto`                                                                             |
| `api:dto-graph-status`        | `GraphStatusDto`                                                                                   |
| `api:dto-graph-search`        | `GraphSearchResultDto`                                                                             |
| `api:dto-graph-impact`        | `GraphImpactResultDto`                                                                             |
| `api:dto-change-graph-view`   | Change-scoped graph DTO                                                                            |

Each `presenter-*` depends on its `dto-*` specs. Handlers depend on matching `presenter-*` + `routes-*`.

---

### Workspace `api` — routes (contract) & handlers (wiring)

| Routes spec                     | Handler spec                     | HTTP scope                                                                            |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `api:routes-project`            | `api:handler-project`            | §5.1 project                                                                          |
| `api:routes-changes-collection` | `api:handler-changes-collection` | §5.2 collections                                                                      |
| `api:routes-changes-read`       | `api:handler-changes-read`       | §5.3 read; `GET …/artifacts/{filename}` → `GetChangeArtifact`; conditional **status** |
| `api:routes-changes-mutate`     | `api:handler-changes-mutate`     | §5.4 mutate; `**PUT …/artifacts/{filename}`\*\* → `SaveChangeArtifact`                |
| `api:routes-archived-changes`   | `api:handler-archived-changes`   | §5.5 archived                                                                         |
| `api:routes-workspaces`         | `api:handler-workspaces`         | `GET /workspaces`                                                                     |
| `api:routes-specs-read`         | `api:handler-specs-read`         | §5.6 read                                                                             |
| `api:routes-specs-mutate`       | `api:handler-specs-mutate`       | §5.6 mutate                                                                           |
| `api:routes-graph`              | `api:handler-graph`              | §5.7 graph                                                                            |

**Excluded:** `GET …/validation` resource.

---

### Workspace `client` — port, transport, adapters, DTOs

| Spec ID                              | Covers                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client:specd-data-port`             | Aggregated interface composing all `port-*` groups                                                                                                                          |
| `client:port-project`                | Project methods                                                                                                                                                             |
| `client:port-changes-collection`     | List/create/drafts/discarded/archived/overlaps                                                                                                                              |
| `client:port-changes-read`           | Detail, status (`**ifModifiedSince`\*\*), artifacts, context, preview, instructions                                                                                         |
| `client:port-changes-mutate`         | Validate, transition, PUT artifact, PATCH, lifecycle posts                                                                                                                  |
| `client:port-archived-changes`       | Archived read                                                                                                                                                               |
| `client:port-workspaces-specs`       | Workspaces + spec operations                                                                                                                                                |
| `client:port-graph`                  | Graph operations                                                                                                                                                            |
| `client:port-http-transport`         | Low-level `fetch`: base URL normalization, headers, timeouts, abort                                                                                                         |
| `client:adapter-bearer-auth`         | **Client only:** attach `Authorization: Bearer` when **remote connection profile** has a token — does **not** verify; **not** used for `specd ui serve` / desktop local IPC |
| `client:adapter-problem-json-errors` | Map problem+json → typed client errors                                                                                                                                      |
| `client:adapter-remote-specd-data`   | `SpecdDataPort` over HTTP (uses transport + bearer + problem adapters)                                                                                                      |
| `client:adapter-memory-specd-data`   | In-memory fake for tests/Storybook                                                                                                                                          |
| `client:ipc-message-envelope`        | Request/response envelope for desktop IPC (ids, error propagation)                                                                                                          |

**Client DTO specs** (16): `client:dto-*` — each depends on matching `api:dto-*`.

**Desktop local path:** `studio-desktop` implements IPC handlers that satisfy the same `port-*` contracts without HTTP (see below).

---

### Workspace `ui` — shell, hooks, views

**Visual foundation:** `ui:design-system` — premium dark IDE aesthetic (GitHub-dark palette, Cursor/VS Code/JetBrains density). **Stack:** Tailwind + Radix/shadcn + `class-variance-authority` + `tailwind-merge`, `react-resizable-panels`, `react-arborist`, `@monaco-editor/react`, `lucide-react`; desktop terminal uses xterm. Panel-based chrome, 4–8px radius, 150–200ms motion, no SaaS dashboard / glass / neumorphism.

**Shell / navigation:** `ui:shell-layout`, `ui:command-palette`, `ui:connect-panel`, sidebar `ui:sidebar-*`.

**Data hooks** (how UI talks to `SpecdDataPort` — loading, cache, errors):

| Spec ID                       | Covers                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui:hooks-project`            | **Global poll** (~2–3 s, window focused): `getProject`, `getProjectStatus` — new workspaces, graph freshness, project-level counters        |
| `ui:hooks-changes-collection` | **Global poll** via sidebar: `listChanges`, drafts, discarded, archived, overlaps — agent may create/shelve changes without any change open |
| `ui:hooks-workspaces-specs`   | **Global poll** for workspace + spec tree (`list` / tree metadata); new specs appear under Workspaces without a spec tab open               |
| `ui:hooks-changes-read`       | Per-**change** fetch helpers; **open change tabs** call status with `ifModifiedSince` / `updatedAt`                                         |
| `ui:hooks-graph`              | Graph status, search, impact                                                                                                                |
| `ui:hooks-inspector-save`     | Optimistic concurrency, 409 handling, refetch preview                                                                                       |

### Polling model (two layers)

**1. Global poll** (`ui:shell-layout` orchestrates, ~2–3 s while Studio focused) — project scope, **no** open change/spec required:

| Source hook / UI                                           | Refreshes when agent…                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ui:hooks-project`                                         | Changes project/workspaces summary, graph stale flag                           |
| `ui:hooks-changes-collection` + `ui:sidebar-changes-*`     | Creates a change, drafts, discards, archives                                   |
| `ui:hooks-workspaces-specs` + `ui:sidebar-workspaces-tree` | Adds specs on disk, new workspace entries in `specd.yaml` (via list/tree APIs) |
| `ui:sidebar-graph-entry`                                   | Graph index status (cheap)                                                     |

**2. Change/spec tab poll** — only while that **tab is visible**; uses `updatedAt` / `ifModifiedSince` for the **selected change** (not a full-change mega-poll):

| Tab                        | Refetch when `updatedAt` advanced    |
| -------------------------- | ------------------------------------ |
| `ui:change-tab-overview`   | Conditional **status**               |
| `ui:change-tab-artifacts`  | Status (artifact DAG)                |
| `ui:change-tab-validation` | Status (+ validate snapshot if kept) |
| `ui:change-tab-tasks`      | Status tasks + `tasks.md` if needed  |
| `ui:change-tab-events`     | Change **detail** history            |
| `ui:change-tab-context`    | **Compiled context** for step        |
| `ui:change-tab-impact`     | Change-scoped graph view             |
| Inspector                  | File **content** on hash drift only  |

**Spec view tabs** (`ui:spec-tab-*`): poll on tab visible for that spec’s metadata/artifacts/context (global tree already caught new spec nodes; tabs load detail). No change `updatedAt` — use refetch on interval or future spec revision field if needed (v1: light poll of spec metadata).

**Spec main tabs:** `ui:spec-tab-overview`, `ui:spec-tab-artifacts`, `ui:spec-tab-metadata`, `ui:spec-tab-dependencies`, `ui:spec-tab-schema`, `ui:spec-tab-graph`, `ui:spec-tab-context`.

**Inspector / editor:** `ui:artifact-editor` (**Save**, **Validate**, find-in-file), `ui:inspector-metadata-schema`, `ui:inspector-edit-preview`, `ui:inspector-delta-edit`, `ui:inspector-delta-preview`, `ui:inspector-delta-full-diff`, `ui:inspector-canonical-readonly`.

**Bottom panel (tab order Output → Problems → Logs, default Output):** `ui:bottom-panel-output`, `ui:bottom-panel-problems`, `ui:bottom-panel-logs`.

---

### Workspace `studio-web`

| Spec ID                       | Covers                                          |
| ----------------------------- | ----------------------------------------------- |
| `studio-web:vite-host`        | Vite build/dev/preview                          |
| `studio-web:remote-bootstrap` | Connect flow → `adapter-remote-specd-data` only |

---

### Workspace `studio-desktop`

| Spec ID                                     | Covers                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `studio-desktop:main-kernel-lifecycle`      | Config discovery, `createKernel`, project switch teardown      |
| `studio-desktop:main-window-manager`        | BrowserWindow, title, navigation shell                         |
| `studio-desktop:welcome-and-file-menu`      | Open local / remote / recents entry points                     |
| `studio-desktop:recent-connections`         | MRU persistence (local + remote)                               |
| `studio-desktop:ipc-preload-bridge`         | `contextBridge` surface exposed to renderer                    |
| `studio-desktop:ipc-handler-registry`       | Main-process handlers mapping IPC → kernel `port-*` operations |
| `studio-desktop:desktop-local-data-adapter` | Renderer adapter: IPC instead of HTTP (local profile)          |
| `studio-desktop:desktop-remote-profile`     | Renderer uses `adapter-remote-specd-data` (remote profile)     |
| `studio-desktop:bottom-panel-terminal`      | xterm + `node-pty`                                             |

---

### Workspace `cli`

| Spec ID         | Covers                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `cli:serve-api` | `specd serve` — `--port/-p`, `--host/-h`, `--config/-c`, `--auth` (**`disabled` only** in v1) |
| `cli:serve-ui`  | Inherits serve flags + `--open/-o`, `--ui-dist`                                               |

---

### Spec count summary

| Workspace           | Specs                                   |
| ------------------- | --------------------------------------- |
| `api`               | 54                                      |
| `client`            | 30                                      |
| `ui`                | 35                                      |
| `studio-web`        | 2                                       |
| `studio-desktop`    | 9                                       |
| `cli`               | 2                                       |
| `core`              | 2 new + 4 modified                      |
| `default`           | 1 modified                              |
| **Total in change** | **142 new + 6 modified (148 spec IDs)** |

---

## Impact

- **Change scope:** Replace coarse specs (`api/auth`, `api/http-server`, `api/openapi`, `electron-main`, `ipc-specd-data-adapter`, `client/remote-adapter`) with the granular list above via `changes edit`.
- **Implementation:** `@specd/api` gains `domain/`, `application/ports/`, `infrastructure/`, `delivery/http/`, `composition/` per architecture spec.
- **Core:** `updatedAt` on manifest + entity + `GetStatus` (required before Studio conditional poll is meaningful); `core:config` adds `api.auth` for serve/UI.
- **Unchanged:** `apps/public-web`, `@specd/mcp`; validation history events (deferred).

## Technical context

### Auth — owned by `api`; v1 = `disabled` only

- **Not Studio config:** `specd.yaml` → **`api.auth`** as `{ type, config? }` (no `studio.*` keys). Parsed by `@specd/api` at `createApiServer`.
- **v1:** `defaultAuthAdapterRegistry()` registers **only `disabled`**. No server-side Bearer enforcement on loopback / `specd ui serve`.
- **Client `adapter-bearer-auth`:** optional header for **remote** Studio pointing at a future authenticated API — orthogonal to v1 server config.
- **Discovery:** `GET /health` or `/v1/project` returns `auth: { type }` (no secrets).
- **Deferred:** bearer adapter, keys file, JWT — registry API is the extension point.

### Polling and communication

- **Global poll** (~2–3 s, window focused): project, change lists, workspace tree.
- **Tab poll:** open change uses **`updatedAt`** + `ifModifiedSince` on status; refetch tab data when revision advances.
- Desktop **local:** IPC → kernel (no HTTP auth). **Remote / web:** `adapter-remote-specd-data`.

### Reference draft

`specd-studio-api-and-ui.md` supplies HTTP route tables and UI tab inventory. Where it disagrees with this proposal (e.g. mandatory Bearer, `repo.saveArtifact` in handlers, JWT adapters), **proposal wins**.

## Open questions

- `handler-graph` `POST /graph/index`: sync response vs job id (v2).
- Token storage: `recent-connections` vs `connect-panel` localStorage scope.

**Deferred (out of scope):** workspace spec **`updatedAt` / spec-lock**; validation history events. Change-manifest `updatedAt` covers conditional poll for open changes in v1.
