# SpecD Studio — API, UI, and authentication (design draft)

> **Status:** Design draft (English). User-facing docs: [Studio](../studio/index.md), [HTTP API](../api/index.md), [client](../client/index.md). Binding specs live in the specd change workflow.  
> **Supersedes:** Informal notes in repository-root `ui-ideas.md` (Spanish). That file is kept for history only.  
> **Scope:** Product IDE (`@specd/ui`), HTTP API (`@specd/api`), data client (`@specd/client`), apps `specd-studio-web` and `specd-studio-desktop`.  
> **Out of scope:** `apps/public-web` (marketing/docs site per `public-web:public-site`).

---

## 1. Purpose

SpecD Studio is a **spec-work IDE**, not a generic dashboard or ticket system. Users work with **changes** (temporary workflow), **workspaces** (spec containers), and **specs** (structural source of truth).

This document defines:

1. How **`@specd/api`** talks **directly** to `@specd/core` (and `@specd/code-graph` where needed).
2. The **HTTP surface** mapped to real kernel use cases.
3. **Authentication** for local and remote deployments.
4. What belongs in each **UI tab**, including tabs that should be merged or dropped.

### 1.1. Hard rule: no CLI or MCP in the API path

| Layer               | Role                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `@specd/core`       | Business logic (`createKernel` → use cases)                           |
| `@specd/code-graph` | Graph index, search, impact (separate package; not in `Kernel` today) |
| `@specd/api`        | HTTP adapter: validate input → call use case → present DTO            |
| `@specd/cli`        | **Not used** by Studio API                                            |
| `@specd/mcp`        | **Not used** by Studio API (agents keep using MCP independently)      |

The API server is a **delivery adapter** in the same sense as the CLI: it must follow `default:_global/architecture` (handlers thin, composition wires `createKernel`, no duplicated business rules).

```text
HTTP request
  → auth middleware (api-only)
  → handler
  → kernel.changes.* | kernel.specs.* | kernel.project.*
  → presenter → JSON response

Graph request
  → handler
  → createCodeGraphProvider(config)
  → graph operations
  → presenter → JSON response
```

---

## 2. Monorepo layout (proposed)

```text
packages/
  core/              # existing
  code-graph/        # existing
  api/               # NEW — Fastify + Zod + OpenAPI
  client/            # NEW — SpecdDataPort + remote adapter
  ui/                # NEW — React IDE shell (no core/fs)

apps/
  public-web/        # existing — marketing/docs only
  specd-studio-web/  # NEW — browser app → RemoteSpecdDataAdapter
  specd-studio-desktop/  # NEW — Electron; main → core, renderer → ui + IpcAdapter
```

**Naming:** Avoid `apps/web` because `public-web` already exists.

**Dependency graph (must stay acyclic):**

```text
api → core, code-graph
client → (no specd packages except shared types if split later)
ui → client
specd-studio-web → ui, client
specd-studio-desktop → ui (+ IPC bridge in app; main → core, code-graph)
```

---

## 3. API runtime model

### 3.1. One kernel per project root

On startup the API process:

1. Resolves `SpecdConfig` via the same `ConfigLoader` port the CLI uses (filesystem adapter in `api` infrastructure).
2. Calls `createKernel(config, { graphStoreId, extraNodeModulesPaths })`.
3. Holds the `Kernel` instance for the lifetime of the process (or per-tenant pool in multi-project hosting).

**There is no subprocess**, no `specd` CLI invocation, and no MCP session.

### 3.2. Presenters and stable DTOs

Handlers must not return domain entities raw. `@specd/api` defines presenters:

- `ChangeSummaryDto`, `ChangeDetailDto`, `StatusDto`, `ArtifactContentDto`, `SpecSummaryDto`, etc.
- Map `SpecdError` → RFC 7807-style problem JSON (`code`, `message`, metadata).

`@specd/client` consumes the same DTO shapes (OpenAPI-generated or hand-maintained).

### 3.3. Metadata-first reads

Aligned with `default:_global/conventions`:

- List endpoints return summaries only.
- Content endpoints (`.../artifacts/{filename}`) load file bodies on demand.
- `GET .../status` may be heavier (artifact DAG, blockers) but still avoids artifact **content**.

---

## 4. Authentication

Authentication is **API-layer only**. `@specd/core` continues to use `ActorResolver` for history events (`by` on transitions, approvals, invalidations).

### 4.1. Deployment modes

| Mode              | Typical host                               | Auth                                                 |
| ----------------- | ------------------------------------------ | ---------------------------------------------------- |
| **Local trusted** | Desktop main process or API on `127.0.0.1` | Optional / disabled; actor from OS user + git config |
| **Local dev API** | Developer machine                          | Static bearer token in env                           |
| **Remote Studio** | Team server / cloud                        | Required bearer or JWT on every mutating request     |

### 4.2. Request authentication flow

```text
Authorization: Bearer <token>
        ↓
ApiTokenVerifier (infrastructure)
        ↓
ApiActor { id, name, email, roles? }
        ↓
ApiActorResolver implements ActorResolver
        ↓
Use cases record actor on history events
```

**Components in `@specd/api`:**

| Piece                                          | Responsibility                                  |
| ---------------------------------------------- | ----------------------------------------------- |
| `domain/auth/api-actor.ts`                     | Value object for authenticated identity         |
| `application/ports/api-token-verifier.ts`      | Verify token → `ApiActor` or fail               |
| `infrastructure/auth/static-token-verifier.ts` | Single shared secret (`SPECD_API_TOKEN`)        |
| `infrastructure/auth/jwt-token-verifier.ts`    | Optional: signed JWT with `sub`, `email`, `exp` |
| `delivery/http/middleware/auth-middleware.ts`  | Reject 401 before handlers                      |
| `composition/create-api-context.ts`            | Per-request context: `kernel` + `actor`         |

### 4.3. Authorization (v1 vs later)

**v1 (recommended):** Binary gate — valid token may call all endpoints the deployment exposes. Fine for single-tenant local API.

**v2:** Scope-based JWT claims, e.g. `specd:changes:read`, `specd:changes:write`, `specd:changes:archive`. Map to route groups in middleware.

**Never in v1:** Implicit trust from browser cookies without CSRF protection on mutating routes.

### 4.4. Desktop vs web

| App         | Auth                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Desktop** | Renderer has no token; preload bridge calls main. Main optionally runs loopback API with auth disabled, or embeds kernel directly (preferred: **direct kernel in main**, IPC invokes use cases). |
| **Web**     | Browser stores API base URL + bearer token (memory or secure storage). Every `RemoteSpecdDataAdapter` call sends `Authorization`.                                                                |

### 4.5. Project binding

The API serves **one `projectRoot` per process** (env `SPECD_PROJECT_ROOT`) unless multi-tenant hosting passes a validated root per request (advanced). UI must not send arbitrary filesystem paths.

---

## 5. HTTP API reference

Base path: `/v1`  
Content-Type: `application/json`  
Errors: `application/problem+json`

Legend: **UC** = kernel use case or direct port method.

### 5.1. Project

| Method | Path                       | Core mapping                                                              | Description                                                                                                           |
| ------ | -------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/project`                 | `SpecdConfig` + aggregates                                                | Project name, schema ref, workspaces list, approval flags (`approvals.spec`, `approvals.signoff`).                    |
| `GET`  | `/project/status`          | `ListChanges`, `ListDrafts`, `ListDiscarded`, `ListArchived`, graph stats | Consolidated dashboard: active/draft/discarded/archive counts, graph freshness/stale (via `createCodeGraphProvider`). |
| `GET`  | `/project/context`         | `kernel.project.getProjectContext`                                        | Compiled project-level context block (no change).                                                                     |
| `GET`  | `/project/schema`          | `kernel.specs.getActiveSchema`                                            | Active resolved schema summary (name, version, artifact types).                                                       |
| `POST` | `/project/schema/validate` | `kernel.specs.validateSchema`                                             | Validate project schema configuration.                                                                                |

### 5.2. Changes — collections

| Method | Path                | Core mapping                   | Description                                                                         |
| ------ | ------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| `GET`  | `/changes`          | `kernel.changes.list`          | Active changes (metadata only): id, title, derived state, updatedAt, blocker count. |
| `GET`  | `/drafts`           | `kernel.changes.listDrafts`    | Shelved changes (`drafts/`).                                                        |
| `GET`  | `/discarded`        | `kernel.changes.listDiscarded` | Discarded changes.                                                                  |
| `GET`  | `/archived-changes` | `kernel.changes.listArchived`  | Archived change names/metadata.                                                     |
| `POST` | `/changes`          | `kernel.changes.create`        | Create change (body: name, specIds, schema, … per `CreateChange` input).            |
| `GET`  | `/changes/overlaps` | `kernel.changes.detectOverlap` | Specs targeted by multiple active changes (project-wide warning).                   |

### 5.3. Changes — instance (read)

| Method | Path                                                 | Core mapping                                 | Description                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/changes/{name}`                                    | `kernel.changes.repo.get`                    | Change detail without artifact **content**: lifecycle state (derived from history), `specIds`, `specDependsOn`, schema name/version, approval summaries, **history events** (append-only log).                                                                                          |
| `GET`  | `/changes/{name}/status`                             | `kernel.changes.status` (+ optional refresh) | **Primary “validation/lifecycle” read model**: artifact DAG, per-file states, drift, blockers, `nextAction`, task completion, implementation-tracking projection, review/overlap summary. Query: `?refreshImplementation=true` runs `refreshImplementationTracking` before `GetStatus`. |
| `GET`  | `/changes/{name}/artifacts`                          | From `Change` entity                         | List artifact types + filenames + aggregate states (no bodies).                                                                                                                                                                                                                         |
| `GET`  | `/changes/{name}/artifacts/{filename}`               | `kernel.changes.repo.artifact`               | Raw artifact file content + hash metadata.                                                                                                                                                                                                                                              |
| `GET`  | `/changes/{name}/context`                            | `kernel.changes.compile`                     | Compiled context for a lifecycle `step` (query: `step`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, `fingerprint`).                                                                                                                                                        |
| `GET`  | `/changes/{name}/preview`                            | `kernel.changes.preview`                     | Merged spec preview for a spec in scope (query: `specId`). Returns base/merged per file.                                                                                                                                                                                                |
| `GET`  | `/changes/{name}/implementation-review`              | `kernel.changes.getImplementationReview`     | Implementation-tracking review projection.                                                                                                                                                                                                                                              |
| `GET`  | `/changes/{name}/hook-instructions`                  | `kernel.changes.getHookInstructions`         | Instruction text for workflow step/phase (query params per use case).                                                                                                                                                                                                                   |
| `GET`  | `/changes/{name}/artifacts/{artifactId}/instruction` | `kernel.changes.getArtifactInstruction`      | Artifact-specific rules/delta guidance.                                                                                                                                                                                                                                                 |

**Removed from earlier drafts:** `GET /changes/{name}/validation` — there is no persisted “validation resource”. Use **`/status`** (state) and **`POST .../validate`** (run).

### 5.4. Changes — instance (mutate)

All require authentication in remote mode.

| Method  | Path                                      | Core mapping                                  | Description                                                                                                                                                                                                                                |
| ------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT`   | `/changes/{name}/artifacts/{filename}`    | `repo.saveArtifact` + `repo.save`             | Write artifact content (optimistic concurrency via `originalHash`).                                                                                                                                                                        |
| `POST`  | `/changes/{name}/validate`                | `kernel.changes.validate`                     | Run structural validation (`ValidateArtifacts`). Body/query: `specId` (workspace:path), or `all=true`, or `artifactId`. Response: `passed`, `failures`, `notes`, `files` (same contract as CLI JSON). **Does not mean semantic approval.** |
| `POST`  | `/changes/{name}/transition`              | `kernel.changes.transition`                   | Lifecycle transition (body: `to` state, optional `skipHookPhases`). Returns updated change + progress events if streamed.                                                                                                                  |
| `POST`  | `/changes/{name}/draft`                   | `kernel.changes.draft`                        | Shelf to `drafts/`.                                                                                                                                                                                                                        |
| `POST`  | `/changes/{name}/restore`                 | `kernel.changes.restore`                      | Restore from drafts.                                                                                                                                                                                                                       |
| `POST`  | `/changes/{name}/discard`                 | `kernel.changes.discard`                      | Discard permanently.                                                                                                                                                                                                                       |
| `POST`  | `/changes/{name}/archive`                 | `kernel.changes.archive`                      | Archive (high impact; strict auth in cloud).                                                                                                                                                                                               |
| `POST`  | `/changes/{name}/approve-spec`            | `kernel.specs.approveSpec`                    | Spec approval gate (when enabled).                                                                                                                                                                                                         |
| `POST`  | `/changes/{name}/approve-signoff`         | `kernel.specs.approveSignoff`                 | Signoff gate (when enabled).                                                                                                                                                                                                               |
| `POST`  | `/changes/{name}/invalidate`              | `kernel.changes.invalidate`                   | Targeted invalidation (body: scope per use case).                                                                                                                                                                                          |
| `POST`  | `/changes/{name}/skip-artifact`           | `kernel.changes.skipArtifact`                 | Mark optional artifact skipped.                                                                                                                                                                                                            |
| `PATCH` | `/changes/{name}/spec-ids`                | `kernel.changes.edit`                         | Add/remove specs in scope.                                                                                                                                                                                                                 |
| `PATCH` | `/changes/{name}/spec-dependencies`       | `kernel.changes.updateSpecDeps`               | Update `specDependsOn` map.                                                                                                                                                                                                                |
| `PATCH` | `/changes/{name}/implementation-tracking` | `kernel.changes.updateImplementationTracking` | Manual add/remove/ignore tracked files.                                                                                                                                                                                                    |

### 5.5. Archived changes

| Method | Path                       | Core mapping                 | Description                                   |
| ------ | -------------------------- | ---------------------------- | --------------------------------------------- |
| `GET`  | `/archived-changes/{name}` | `kernel.changes.getArchived` | Archived change metadata + manifest snapshot. |

### 5.6. Workspaces and specs (workspace truth)

Spec IDs use `workspace:capability/path` (e.g. `core:auth/login`).

| Method | Path                                                 | Core mapping                                     | Description                                                                                      |
| ------ | ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `GET`  | `/workspaces`                                        | `SpecdConfig.workspaces`                         | Workspace list (name, prefix, ownership, code roots).                                            |
| `GET`  | `/workspaces/{ws}/specs`                             | `kernel.specs.list` (filtered)                   | Spec tree metadata (`ListSpecs` / repo list).                                                    |
| `GET`  | `/workspaces/{ws}/specs/{path}`                      | `kernel.specs.get`                               | Spec metadata: filenames, hashes, deps from metadata files — no content.                         |
| `GET`  | `/workspaces/{ws}/specs/{path}/artifacts/{filename}` | `specs.repos.get(ws).artifact`                   | Canonical spec artifact content.                                                                 |
| `GET`  | `/workspaces/{ws}/specs/{path}/outline`              | `kernel.specs.getOutline`                        | Navigable outline for an artifact (e.g. requirements headings).                                  |
| `GET`  | `/workspaces/{ws}/specs/{path}/context`              | `kernel.specs.getContext`                        | Spec-level compiled context (dependencies traversal).                                            |
| `POST` | `/workspaces/{ws}/specs/validate`                    | `kernel.specs.validate`                          | Validate workspace specs structurally (not change-scoped). Query: `specPath` or whole workspace. |
| `POST` | `/workspaces/{ws}/specs/{path}/metadata`             | `kernel.specs.saveMetadata` / `generateMetadata` | Write or regenerate `.specd-metadata` (privileged).                                              |
| `GET`  | `/specs/search`                                      | `kernel.specs.search`                            | Full-text search (query: `q`, workspace filter).                                                 |

**Linked changes for a spec:** derived in presenter by scanning active `ListChanges` for `specIds` membership (no separate core UC required).

### 5.7. Code graph (`@specd/code-graph`)

Graph routes use `createCodeGraphProvider(projectConfig)` — still **not** CLI/MCP.

| Method | Path                              | Graph operation     | Description                                                                          |
| ------ | --------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/graph/status`                   | stats + fingerprint | Freshness, stale flag, file/symbol counts.                                           |
| `POST` | `/graph/index`                    | index               | Reindex (long-running; return job id or stream in v2).                               |
| `GET`  | `/graph/search`                   | search              | BM25 symbols/specs (query params mirror CLI).                                        |
| `GET`  | `/graph/impact`                   | impact              | Symbol or file impact (direction, depth).                                            |
| `GET`  | `/graph/hotspots`                 | hotspots            | High-risk symbols.                                                                   |
| `GET`  | `/graph/specs/{workspace}/{path}` | spec linkage        | Files/symbols/tests linked to spec.                                                  |
| `GET`  | `/graph/changes/{name}`           | change-scoped view  | Touched specs/files/symbols for active change (compose from change specIds + graph). |

Show **stale index** warnings in UI whenever `fingerprintMismatch` or stale freshness is true.

### 5.8. OpenAPI

| Method | Path            | Description                                                      |
| ------ | --------------- | ---------------------------------------------------------------- |
| `GET`  | `/openapi.json` | Generated OpenAPI 3.1 document.                                  |
| `GET`  | `/docs`         | Swagger UI (dev/staging only; disable in production or protect). |

---

## 6. `@specd/client` — `SpecdDataPort`

Thin port mirroring the HTTP API (not kernel types):

```typescript
export interface SpecdDataPort {
  // Project
  getProject(): Promise<ProjectDto>
  getProjectStatus(): Promise<ProjectStatusDto>

  // Changes
  listChanges(): Promise<readonly ChangeSummaryDto[]>
  listDrafts(): Promise<readonly ChangeSummaryDto[]>
  getChange(name: string): Promise<ChangeDetailDto>
  getChangeStatus(
    name: string,
    options?: { refreshImplementation?: boolean },
  ): Promise<ChangeStatusDto>
  getChangeArtifact(name: string, filename: string): Promise<ArtifactContentDto>
  validateChange(input: ValidateChangeInput): Promise<ValidateResultDto>
  transitionChange(input: TransitionChangeInput): Promise<ChangeDetailDto>
  // … mirror remaining endpoints

  // Specs
  listWorkspaceSpecs(workspace: string): Promise<WorkspaceSpecTreeDto>
  getSpec(specId: string): Promise<SpecDetailDto>
  getSpecArtifact(specId: string, filename: string): Promise<ArtifactContentDto>

  // Graph
  getGraphStatus(): Promise<GraphStatusDto>
  searchGraph(query: GraphSearchInput): Promise<GraphSearchResultDto>
}
```

**Adapters:** `RemoteSpecdDataAdapter` (HTTP), `MemorySpecdDataAdapter` (Storybook/tests). Desktop: `IpcSpecdDataAdapter` in the Electron app calling main-process kernel **or** loopback HTTP with auth disabled.

---

## 7. UI architecture

### 7.1. Layout

```text
┌─────────────┬──────────────────────────┬─────────────────┐
│  Sidebar    │  Main panel (tabs)       │  Inspector      │
│  Changes    │  Operational overview    │  Artifact view  │
│  Workspaces │                          │  Preview/Raw/…  │
├─────────────┴──────────────────────────┴─────────────────┤
│  Bottom panel (desktop: terminal; all: logs/problems)    │
└──────────────────────────────────────────────────────────┘
```

- **`@specd/ui`** depends only on `@specd/client` + visual libraries.
- **Command palette** triggers the same operations as API (validate, transition, open spec).
- **Do not show fake requirement coverage** (e.g. “RQ-001 implemented”). Show evidence: artifact state, validate result, tasks, graph links, events.

### 7.2. Sidebar

| Section                   | Source                                          | Notes                                                                            |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| **Changes → In progress** | `GET /changes`                                  | Active only.                                                                     |
| **Changes → Drafts**      | `GET /drafts`                                   | Shelved; restore action.                                                         |
| **Changes → Archive**     | `GET /archived-changes`                         | Read-only history.                                                               |
| **Changes → Discarded**   | `GET /discarded`                                |                                                                                  |
| **Workspaces → tree**     | `GET /workspaces`, `GET /workspaces/{ws}/specs` | Canonical specs; not “completed changes”.                                        |
| **Code graph**            | `GET /graph/status`                             | Entry to search/impact; show stale badge.                                        |
| **Events**                | Optional global feed                            | v2: project-wide audit stream; v1: per-change history when a change is selected. |

---

## 8. Change view — main panel tabs

When a change is selected, the main panel uses tabs below.  
**Recommendation:** Drop a dedicated **Transitions** tab (see §8.7).

### 8.1. Overview (keep)

**Purpose:** Single operational picture.

| Content                            | API / source                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Derived lifecycle state            | `GET /changes/{name}` history + `GET .../status`                                         |
| Title, summary, schema, spec scope | `GET /changes/{name}`                                                                    |
| Blockers + `nextAction`            | `GET .../status`                                                                         |
| Available transitions              | Derive from `VALID_TRANSITIONS` + current state + gates (presenter; same logic CLI uses) |
| Primary actions                    | Buttons → `POST validate`, `POST transition`, `POST draft`, etc.                         |
| Active approvals / invalidated     | History events on change                                                                 |
| Spec overlap warning               | `GET /changes/overlaps` or status `review.overlapDetail`                                 |
| Touched specs list                 | `specIds` with link to spec view / preview                                               |

**Honesty copy:** “Structural validation” vs “semantic review” labels when showing pass/fail.

### 8.2. Artifacts (keep)

| Content                     | API                            |
| --------------------------- | ------------------------------ |
| Table of artifact types     | `GET .../artifacts`            |
| Per-file state, drift, skip | `GET .../status`               |
| Open in inspector           | `GET .../artifacts/{filename}` |
| Edit (desktop / trusted)    | `PUT .../artifacts/{filename}` |

### 8.3. Validation (keep — rename mentally to “Checks”)

**Not** a stored report. Two panels:

| Panel                    | Behaviour                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Status (read)**        | `GET .../status` — dependency-blocked artifacts, missing required, drift (`complete-with-drift`).              |
| **Run validate (write)** | `POST .../validate` with spec/`all`/artifact selector; show last response `failures` + `notes` until next run. |

Optional: “Validate all specs in change” drives `all=true`.

### 8.4. Tasks (keep)

| Content                          | API                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Task lists from `tasks` artifact | `GET .../artifacts/tasks.md` (or parsed via status `taskCompletion`)           |
| Completion counts                | `GET .../status` (`taskCompletion` per artifact type)                          |
| Gate explanation                 | Transition to `verifying` blocked until tasks complete (`core:workflow-model`) |

### 8.5. Events (keep)

| Content             | API                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Append-only history | `GET /changes/{name}` → `history[]`                                                                 |
| Event types         | `transitioned`, `validated`, `invalidated`, `spec-approved`, `signed-off`, `drafted`, `restored`, … |
| Actor + timestamp   | From each event’s `by`, `at`                                                                        |

Useful for audit and debugging; not a place to edit state.

### 8.6. Context (keep)

| Content                                  | API                                       |
| ---------------------------------------- | ----------------------------------------- |
| Compiled agent context for selected step | `GET .../context?step=designing` (etc.)   |
| Fingerprint / unchanged                  | Pass `fingerprint` query to avoid refetch |
| Copy for agents                          | Export markdown block                     |

Does not replace reading individual artifacts.

### 8.7. Transitions (drop as separate tab)

**Why it weakens UX:** Lifecycle transitions are **actions**, not a dataset. A tab suggests browsing transitions vs performing them.

**Instead, fold into Overview:**

- State diagram or stepper (current state highlighted).
- **Allowed transitions** as buttons (disabled with tooltip citing blocker `code` from status).
- **Confirm modals** for destructive/archive paths.
- Optional expandable “transition help” showing hook / instruction hints (`GET hook-instructions`).

If history is needed, **Events** already lists `transitioned` entries.

### 8.8. Impact (keep; optional in v1)

| Content                     | API                                            |
| --------------------------- | ---------------------------------------------- |
| Specs/files/symbols touched | `GET /graph/changes/{name}` + change `specIds` |
| Downstream impact preview   | `GET /graph/impact` for selected symbol/file   |
| Related tests               | From graph linkage                             |

Mark results stale when graph is stale.

### 8.9. Implementation (merge into Overview or Status in v1)

If `implementation-tracking` is enabled:

| Content                 | API                                        |
| ----------------------- | ------------------------------------------ |
| Tracked files / symbols | `GET .../status` implementation projection |
| Review detail           | `GET .../implementation-review`            |
| Refresh                 | `?refreshImplementation=true` on status    |

Could be a sub-section of **Overview** until the feature stabilizes.

---

## 9. Spec view — main panel tabs (workspace truth)

Selecting a canonical spec under **Workspaces**.

### 9.1. Overview (keep)

| Content                           | API                                 |
| --------------------------------- | ----------------------------------- |
| Workspace, path, metadata summary | `GET /workspaces/{ws}/specs/{path}` |
| Linked active changes             | Presenter scan `GET /changes`       |
| Dependency summary                | Metadata + `GET .../context` deps   |

### 9.2. Artifacts (keep)

| Content                      | API                                                      |
| ---------------------------- | -------------------------------------------------------- |
| `spec.md`, `verify.md`, etc. | List from spec metadata + `GET .../artifacts/{filename}` |
| Open verify next to spec     | Inspector tabs                                           |

### 9.3. Metadata (keep)

| Content                              | API                                      |
| ------------------------------------ | ---------------------------------------- |
| `.specd-metadata.yaml` parsed fields | Part of `GET spec` or dedicated artifact |
| Stale metadata warnings              | Freshness checks when generating context |

### 9.4. Dependencies (keep)

| Content                  | API                                            |
| ------------------------ | ---------------------------------------------- |
| `dependsOn` / references | Metadata + `GET .../context` with `followDeps` |

### 9.5. Linked changes (keep)

| Content                                    | API                |
| ------------------------------------------ | ------------------ |
| Active/archived changes touching this spec | Cross-list changes |

### 9.6. Schema (keep)

| Content                          | API                                         |
| -------------------------------- | ------------------------------------------- |
| Applicable artifact types, rules | `GET /project/schema` + spec’s schema slice |

### 9.7. Code graph (keep)

| Content                    | API                            |
| -------------------------- | ------------------------------ |
| Linked files/symbols/tests | `GET /graph/specs/{ws}/{path}` |
| Stale warning              | `GET /graph/status`            |

### 9.8. History (optional / v2)

Canonical specs do not carry change-style event logs. **History** tab only makes sense for:

- Git history (desktop / future integration), or
- Archived change records that touched this spec.

Otherwise **drop** or rename to **Archive activity** with linked archived changes.

### 9.9. Context (keep)

| Content                     | API                                         |
| --------------------------- | ------------------------------------------- |
| Spec-level compiled context | `GET /workspaces/{ws}/specs/{path}/context` |

---

## 10. Right inspector panel (artifact-selected)

| Tab          | Content                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Preview**  | Rendered markdown (or structured preview for deltas). Change: merged preview via `GET .../preview` when applicable. |
| **Raw**      | Exact file from artifact GET.                                                                                       |
| **Diff**     | Delta vs base for change-scoped spec artifacts; disabled for canonical-only view.                                   |
| **Metadata** | Hashes, `validatedHash`, updated times, parser format.                                                              |
| **Schema**   | Validation rules for this artifact type.                                                                            |
| **Graph**    | Symbol/file links for cursor position (graph package).                                                              |

---

## 11. Bottom panel

| Tab              | Web                                        | Desktop                                |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| **Problems**     | Validate failures + blockers               | Same                                   |
| **Output**       | Last `POST validate` / transition messages | Same                                   |
| **Logs**         | API/server logs if remote                  | Main process logs                      |
| **Terminal**     | Not available                              | xterm + `node-pty`                     |
| **Git**          | Not available (v1)                         | Status/diff optional                   |
| **Agent events** | Optional external stream (v2)              | Not MCP replay — separate integrations |

---

## 12. Phased delivery

| Phase | Deliverables                                                                           |
| ----- | -------------------------------------------------------------------------------------- |
| **0** | Specd change + package specs (`api`, `client`, `ui`); ADR for Studio vs `public-web`.  |
| **1** | `@specd/api` read-only + `GET .../status` + artifacts + specs list; auth static token. |
| **2** | `@specd/ui` read-only + `specd-studio-web`; inspector preview/raw.                     |
| **3** | Mutations: validate, transition, draft/restore; Overview actions (no Transitions tab). |
| **4** | Code graph routes + Impact tab.                                                        |
| **5** | `specd-studio-desktop` + IPC kernel.                                                   |
| **6** | JWT scopes, multi-tenant roots, audit.                                                 |

---

## 13. Global spec compliance checklist

| Global spec                  | Studio compliance                                                   |
| ---------------------------- | ------------------------------------------------------------------- |
| `architecture`               | API as adapter; `createKernel`; presenters; no core in UI.          |
| `conventions`                | Lazy lists; ESM; named exports (framework exceptions documented).   |
| `error-handling-conventions` | `SpecdError` → problem JSON with stable `code`.                     |
| `testing`                    | Vitest; typed port mocks; no snapshots.                             |
| `docs`                       | This file under `docs/design/`; binding specs created via workflow. |
| `core:change`                | UI respects gates, history-derived state, invalidation.             |
| `cli:change-validate`        | `POST validate` semantics match; no fake semantic pass.             |

---

## 14. Summary

- **API** = direct `createKernel` + `createCodeGraphProvider`, never CLI/MCP.
- **`GET .../status`** is the read model for lifecycle and artifact readiness; **`POST .../validate`** runs checks.
- **Drop `GET .../validation`** and the **Transitions tab**; use **Overview + Events** instead.
- **Auth** = bearer/JWT at API edge + `ActorResolver` for history; desktop trusts main process.
- **`public-web`** stays separate; Studio apps use new package names above.
