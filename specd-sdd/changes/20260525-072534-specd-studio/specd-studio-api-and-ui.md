# SpecD Studio — API, UI, and authentication (design draft)

> **Status:** Design draft (English). Not a binding spec. Promote via a specd change before implementation.  
> **Location:** Change `specd-studio` reference draft (not a spec artifact).  
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
5. **Delivery modes:** CLI-integrated local stack vs standalone `specd-studio-web` client (§2.2).

### 1.1. Hard rule: no CLI or MCP in the API path

| Layer               | Role                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `@specd/core`       | Business logic (`createKernel` → use cases)                                                              |
| `@specd/code-graph` | Graph index, search, impact (separate package; not in `Kernel` today)                                    |
| `@specd/api`        | HTTP adapter: validate input → call use case → present DTO                                               |
| `@specd/cli`        | **Not in the HTTP handler path**; may **start** `@specd/api` via `specd serve` / `specd ui serve` (§2.2) |
| `@specd/mcp`        | **Not used** by Studio API (agents keep using MCP independently)                                         |

The API server is a **delivery adapter** in the same sense as the CLI: it must follow `default:_global/architecture` (handlers thin, composition wires `createKernel`, no duplicated business rules). Incoming HTTP requests are handled only inside `@specd/api`, even when the process was spawned by the CLI.

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
  api/               # NEW — Fastify + Zod + OpenAPI (importable by CLI)
  client/            # NEW — SpecdDataPort + remote adapter
  ui/                # NEW — shared Studio IDE (React; no core/fs)
  cli/               # existing — adds serve / ui serve (depends on api + ui dist)

apps/
  public-web/        # existing — marketing/docs only
  specd-studio-web/  # NEW — standalone browser client (see §2.2)
  specd-studio-desktop/  # NEW — Electron; main → core, renderer → ui
```

**Naming:** Avoid `apps/web` because `public-web` already exists.

### 2.1. Packages vs apps

| Location        | Criterion                                                                            | Examples                                                 |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **`packages/`** | Published or imported workspace units; delivery adapters (`cli`, `api`, `mcp`)       | `core`, `cli`, `api`, `ui`, `client`                     |
| **`apps/`**     | Deployable **hosts** that are not dependencies of other workspaces (`private: true`) | `public-web`, `specd-studio-web`, `specd-studio-desktop` |

The CLI stays in **`packages/cli`** because `@specd/specd` and npm publish depend on `@specd/cli` — same as `mcp`, not because it is “less deployable”.

**`@specd/ui` vs `apps/specd-studio-web`:**

|                | `@specd/ui`                                      | `apps/specd-studio-web`                                    |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Role           | IDE product: layout, tabs, hooks, `<SpecdApp />` | Browser **host**: Vite, env, Connect screen, static deploy |
| Imports        | `@specd/client` only                             | `@specd/ui`, `@specd/client`                               |
| Used by        | CLI embedded serve, studio-web, desktop renderer | End users / devs running client **without** CLI            |
| Project / core | Never                                            | Never                                                      |

### 2.2. Delivery modes: integrated vs standalone

Two ways to run the same `@specd/ui` IDE against an API:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Integrated (CLI) — project-bound                               │
│  specd serve          → API only (cwd = SpecdConfig project)      │
│  specd ui serve       → API + static UI (same origin)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │  HTTP /v1
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Standalone (studio-web) — endpoint chosen by user              │
│  pnpm --filter @specd/studio-web dev | build + preview           │
│  → Vite dev server or static hosting                            │
│  → Connect UI: API base URL + bearer token                      │
│  → RemoteSpecdDataAdapter → any reachable @specd/api            │
└─────────────────────────────────────────────────────────────────┘
```

#### Integrated mode (`specd ui serve`)

- **Launcher:** `packages/cli` imports `createApiServer()` from `@specd/api`.
- **API:** `createKernel(config)` for the **current working directory** (discovered `specd.yaml`).
- **UI:** Fastify (or equivalent) serves prebuilt assets from `@specd/ui/dist` (or a dedicated `embedded` build).
- **Client config:** `apiBase = '/'` (same origin); auth optional on loopback (see §4).
- **No Connect screen** in v1 embedded build — opening the URL is enough.

```bash
specd serve [--port 4400] [--host 127.0.0.1] [--token <secret>]
specd ui serve [--port 4400] [--open]
```

`specd serve` is API-only (for studio-web or other clients pointing at localhost). `specd ui serve` is the local “open Studio on this repo” experience.

**CLI dependency additions:**

```text
@specd/cli → @specd/api (serve)
@specd/cli → path to @specd/ui/dist at runtime (ui serve; bundled in @specd/specd release)
```

The CLI still does **not** implement HTTP handlers; it only starts the server composed in `@specd/api`.

#### Standalone mode (`specd-studio-web`)

- **Launcher:** `apps/specd-studio-web` scripts (`dev`, `build`, `preview`) — **no `specd` binary required**.
- **Does not** load `specd.yaml`, **does not** start `createKernel`, **does not** spawn core.
- **First-run / settings:** user enters API base URL (e.g. `http://127.0.0.1:4400/v1` or `https://studio-api.company.com/v1`), optional bearer token, “Test connection” via `GET /project` or `GET /project/status`.
- **Persistence:** `localStorage` (or similar) for URL + token; optional query param `?api=` for shareable links.
- **CORS:** assumes API may be on another origin; `@specd/api` must allow configured origins in remote deployments.
- **Deploy:** static SPA to CDN/object storage; pairs with separately hosted `specd serve` or team API.

```bash
pnpm --filter @specd/studio-web dev
pnpm --filter @specd/studio-web build && pnpm --filter @specd/studio-web preview
```

#### Desktop (`specd-studio-desktop`)

Desktop is a **dual-mode host**: same `@specd/ui` IDE as web, but the user can attach either to a **local SpecD project** or a **remote HTTP API** (equivalent to `specd-studio-web` + `specd serve` on another machine).

```text
┌──────────────────────────────────────────────────────────────┐
│  Welcome / File menu                                         │
│    Open local project…  │  Connect to remote API…  │ Recent  │
└──────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
  Local profile                 Remote profile
  specd.yaml / folder           https://host/v1 + token
  main: createKernel            renderer: RemoteSpecdDataAdapter
  renderer: IpcSpecdDataAdapter   (or main proxies HTTP)
```

##### Connection profiles

| Profile           | User input                                                                                              | Data path                                                                                                                  | Editing                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Local project** | Pick **project folder** or **`specd.yaml` file** (dialog); resolve `projectRoot` from discovered config | Main: `ConfigLoader` → `createKernel(projectRoot)`; renderer: **`IpcSpecdDataAdapter`** (preload → main invokes use cases) | Full: artifacts `PUT`, `PATCH /changes`, validate, transition (same as integrated CLI) |
| **Remote API**    | **API base URL** + optional **bearer token**; “Test connection” (`GET /project`)                        | Renderer: **`RemoteSpecdDataAdapter`** → remote `@specd/api`                                                               | Same rules as standalone web (read-only v1, write when API auth allows)                |

Local and remote are **first-class**, not a fallback. `studio-web` remains **remote-only**; desktop adds **local-only** affordances (terminal, git, no CORS).

##### Opening a local project

- **Open folder:** choose directory; main walks up / reads `specd.yaml` in folder (same discovery as CLI `--config`).
- **Open `specd.yaml`:** user selects the file directly; `projectRoot` = parent directory of that file (or directory containing the file per `ConfigLoader` rules).
- On success: load kernel, set window title from project + schema ref; navigate to Studio IDE (sidebar Changes / Workspaces).
- On failure: show `ConfigValidationError` / missing config message; do not partial-load.

##### Remote connection

- Reuse **`ConnectPanel`** from `@specd/ui` (shared with `studio-web`): URL, token, test, save.
- Normalized base URL ends with `/v1` (or app stores origin + prefixes paths consistently).
- Electron may call remote API from **renderer** (fetch) with token in memory, or **main** as HTTP proxy to avoid exposing token to renderer — v1 can use renderer fetch like web; harden in v2.

##### Recent / history (menus)

Persist on disk in app user data (e.g. `recent-connections.json`), cap **20** entries, MRU order.

| Entry type | Stored fields                                                           | Menu label example          |
| ---------- | ----------------------------------------------------------------------- | --------------------------- |
| `local`    | `projectRoot`, optional `configPath`, `openedAt`, `label` (folder name) | `~/projects/specd`          |
| `remote`   | `apiBaseUrl`, `openedAt`, `label` (host)                                | `api.team.internal (specd)` |

**Menus (main process / application menu):**

```text
File
  Open Local Project…       → folder or specd.yaml dialog
  Connect to Remote API…    → ConnectPanel modal
  Open Recent               → submenu (local + remote icons)
    ─────────────────
    Clear Recent
```

**Welcome screen** (no session active): show last **5–10** recents + two primary buttons (same actions as File menu).

- Selecting a recent **local** entry: re-validate `specd.yaml` exists, re-init kernel, open IDE.
- Selecting a recent **remote** entry: pre-fill URL/token (token from OS keychain in v2; v1 may require re-enter token for security).
- Remove one recent / clear all from submenu or settings.

Do **not** mix profiles in one session: switching local ↔ remote closes current session (confirm if dirty editor buffers exist in v2).

##### Desktop vs `specd ui serve`

|              | `specd ui serve` | Desktop local    | Desktop remote |
| ------------ | ---------------- | ---------------- | -------------- |
| Launcher     | CLI              | Electron app     | Electron app   |
| Pick project | cwd              | Dialog + recents | URL + recents  |
| Kernel       | CLI process      | Main process     | Remote server  |

##### Implementation notes (`apps/specd-studio-desktop`)

```text
main/
  connection/
    open-local-project.ts
    open-remote-connection.ts
    recent-connections-store.ts
  kernel/
    session-manager.ts          # one active profile at a time
  ipc/
    specd-data-handlers.ts      # local profile only

renderer/
  welcome-screen.tsx
  connect-remote-screen.tsx     # or shared from @specd/ui
```

`@specd/ui` props:

```tsx
<SpecdApp
  connection={{ type: 'local' } | { type: 'remote', apiBase: string, token?: string }}
  dataPort={localPort | remotePort}
/>
```

#### Build variants (`@specd/ui`)

Avoid duplicating two full codebases; use one package with host-specific entry or props:

```tsx
<SpecdApp
  mode="embedded"       // specd ui serve: apiBase="/", no Connect gate
  mode="standalone"     // studio-web: remote only, Connect gate
  mode="desktop"        // local or remote session; welcome + recents in host shell
  dataPort={...}        // IpcSpecdDataAdapter | RemoteSpecdDataAdapter
/>
```

| Build output                  | Consumed by                            |
| ----------------------------- | -------------------------------------- |
| `ui/dist` embedded            | `specd ui serve` (static mount)        |
| `studio-web/dist` standalone  | Static hosting; includes Connect shell |
| Shared chunk from `@specd/ui` | Both (Vite lib + app entries)          |

**Dependency graph (must stay acyclic):**

```text
api → core, code-graph
client → (no specd packages except shared types if split later)
ui → client
cli → api (+ ui dist path at runtime for ui serve)
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

| App                  | Sessions                                                          | Auth                                                                  |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Desktop local**    | `projectRoot` from folder / `specd.yaml`; **recents** in app menu | No HTTP auth; main runs kernel; actor from OS/git via `ActorResolver` |
| **Desktop remote**   | API URL + token; **recents** in app menu                          | Bearer on each `RemoteSpecdDataAdapter` request (same as web)         |
| **studio-web**       | Remote only; recents in `localStorage`                            | Bearer token per request                                              |
| **`specd ui serve`** | Single local project (cwd)                                        | Loopback API; auth optional                                           |

Renderer **local** profile: no token; **preload → main → kernel**. Renderer **remote** profile: same as web.

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

| Method | Path                                                 | Core mapping                                 | Description                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/changes/{name}`                                    | `kernel.changes.repo.get`                    | Change detail without artifact **content**: lifecycle state (derived from history), `specIds`, `specDependsOn`, schema name/version, approval summaries, **history events** (append-only log).                                                                                                                                                                               |
| `GET`  | `/changes/{name}/status`                             | `kernel.changes.status` (+ optional refresh) | **Primary “validation/lifecycle” read model**: artifact DAG, per-file states, drift, blockers, `nextAction`, task completion, implementation-tracking projection, review/overlap summary. Query: `?refreshImplementation=true` runs `refreshImplementationTracking` before `GetStatus`.                                                                                      |
| `GET`  | `/changes/{name}/artifacts`                          | From `Change` entity                         | List artifact types + filenames + aggregate states (no bodies).                                                                                                                                                                                                                                                                                                              |
| `GET`  | `/changes/{name}/artifacts/{filename}`               | `kernel.changes.repo.artifact`               | Raw artifact file content + hash metadata.                                                                                                                                                                                                                                                                                                                                   |
| `GET`  | `/changes/{name}/context`                            | `kernel.changes.compile`                     | Compiled context for a lifecycle `step` (query: `step`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, `fingerprint`).                                                                                                                                                                                                                                             |
| `GET`  | `/changes/{name}/preview`                            | `kernel.changes.preview`                     | Merged spec preview for a spec in scope. Query: `specId` (required), optional `artifactId` (filter to one artifact file, same as CLI `--artifact`). Response per file: `filename`, `base`, `merged`, `status`. Optional presenter query `?diff=unified` returns precomputed unified diff per file (CLI parity); UI may also compute diff client-side from `base` + `merged`. |
| `GET`  | `/changes/{name}/implementation-review`              | `kernel.changes.getImplementationReview`     | Implementation-tracking review projection.                                                                                                                                                                                                                                                                                                                                   |
| `GET`  | `/changes/{name}/hook-instructions`                  | `kernel.changes.getHookInstructions`         | Instruction text for workflow step/phase (query params per use case).                                                                                                                                                                                                                                                                                                        |
| `GET`  | `/changes/{name}/artifacts/{artifactId}/instruction` | `kernel.changes.getArtifactInstruction`      | Artifact-specific rules/delta guidance.                                                                                                                                                                                                                                                                                                                                      |

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
| `PATCH` | `/changes/{name}`                         | `kernel.changes.edit`                         | Change metadata (body fields below). Response includes `invalidated: boolean`.                                                                                                                                                             |
| `PATCH` | `/changes/{name}/spec-dependencies`       | `kernel.changes.updateSpecDeps`               | Update `specDependsOn` for one spec (`specId`, `add` / `remove` / `set`).                                                                                                                                                                  |
| `PATCH` | `/changes/{name}/implementation-tracking` | `kernel.changes.updateImplementationTracking` | Manual add/remove/ignore tracked files.                                                                                                                                                                                                    |

**`PATCH /changes/{name}` body** (maps to `EditChangeInput`; same semantics as `specd changes edit`):

| Field                          | Invalidates approvals?                      | Notes                                                                                                              |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `description`                  | **No**                                      | Free text; appends `description-updated` history event. Safe default for Studio “edit change”.                     |
| `addSpecIds` / `removeSpecIds` | **Yes**, if effective `specIds` set changes | Triggers `updateSpecIds` → invalidation + scaffold/unscaffold. UI must confirm.                                    |
| `invalidationPolicy`           | **No** (by itself)                          | `none` \| `surgical` \| `downstream` \| `global`; affects **future** drift invalidation only (`core:edit-change`). |

Cannot edit via API v1: **change name** (directory slug), lifecycle **state** (use `POST .../transition`), history (append-only).

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
| `GET`  | `/workspaces/{ws}/specs/{path}/artifacts/{filename}` | `specs.repos.get(ws).artifact`                   | Canonical spec artifact content (read-only in Studio v1; see §10.5).                             |
| `GET`  | `/workspaces/{ws}/specs/{path}/outline`              | `kernel.specs.getOutline`                        | Navigable outline for an artifact (e.g. requirements headings).                                  |
| `GET`  | `/workspaces/{ws}/specs/{path}/context`              | `kernel.specs.getContext`                        | Spec-level compiled context (dependencies traversal).                                            |
| `POST` | `/workspaces/{ws}/specs/validate`                    | `kernel.specs.validate`                          | Validate workspace specs structurally (not change-scoped). Query: `specPath` or whole workspace. |
| `POST` | `/workspaces/{ws}/specs/{path}/metadata`             | `kernel.specs.saveMetadata` / `generateMetadata` | Write or regenerate `.specd-metadata` (privileged).                                              |
| `GET`  | `/specs/search`                                      | `kernel.specs.search`                            | Full-text search (query: `q`, workspace filter).                                                 |

No dedicated “linked changes” API or spec-view tab — overlap and scope are handled from the **change** side (`GET /changes/overlaps`, change `specIds`, spec Overview without a reverse lookup list).

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

### 7.1.1. Code editor stack (`@specd/ui`)

Use **Monaco Editor** (`@monaco-editor/react`) as the single editing surface for artifact text:

| Format                    | Monaco language | Notes                                                                                          |
| ------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `*.md`                    | `markdown`      | Source editing; optional side-by-side **rendered** markdown (same content, not a second file). |
| `*.yaml` / `*.delta.yaml` | `yaml`          | Delta files and config-like artifacts.                                                         |
| `*.json`                  | `json`          | Metadata, lock files when opened as artifacts.                                                 |
| Plain text                | `plaintext`     | Fallback.                                                                                      |

**Markdown:** Monaco does not replace a markdown preview — pair **Edit** (Monaco) with **Preview** (rendered HTML/MDX-safe subset via `react-markdown` or unified pipeline aligned with core parsers). WYSIWYG is out of scope for v1.

**Shared component:** `ArtifactEditor` (Monaco + toolbar: Save, language badge, read-only when `!editingEnabled`). Used from inspector tabs below.

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
| **Change settings** (inline)       | `PATCH /changes/{name}` — see §8.1.1                                                     |

**Honesty copy:** “Structural validation” vs “semantic review” labels when showing pass/fail.

### 8.1.1. Editing change metadata (Overview)

Studio SHOULD expose basic change editing from **Overview** (not a separate tab), grouped as **safe** vs **scope** edits.

| Field                    | UI control                            | API                                                 | Invalidates?                                                                                                            |
| ------------------------ | ------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Description**          | Multiline text + Save                 | `PATCH` `{ "description": "..." }` only             | **No** — primary “edit change” affordance                                                                               |
| **Spec scope**           | Add/remove spec IDs (picker or chips) | `PATCH` `{ "addSpecIds": [], "removeSpecIds": [] }` | **Yes** when the effective set changes — modal: “Scope change will invalidate approvals and may remove scaffolded dirs” |
| **Invalidation policy**  | Advanced select (collapsed)           | `PATCH` `{ "invalidationPolicy": "surgical" }`      | **No** by itself; explain that it changes drift behaviour on later edits                                                |
| **Per-spec `dependsOn`** | Optional sub-panel per spec           | `PATCH .../spec-dependencies`                       | **No** (`core:change` — `specDependsOn` not subject to approval invalidation)                                           |
| **Name**                 | Read-only label                       | —                                                   | Rename not supported (would move `changes/<name>/`)                                                                     |
| **Schema**               | Read-only (set at create)             | —                                                   | —                                                                                                                       |

After a **safe** description save: refresh `GET /changes/{name}` (history shows `description-updated`); no status DAG reset.

After **scope** save when `invalidated: true`: refresh `GET .../status`, show invalidation banner, expect artifacts back to review states per core rules.

**Phase:** description edit with phase 3 mutations; scope edit same phase with confirmation; `spec-dependencies` can follow in 3 or 4.

### 8.2. Artifacts (keep)

| Content                     | API                                                         |
| --------------------------- | ----------------------------------------------------------- |
| Table of artifact types     | `GET .../artifacts`                                         |
| Per-file state, drift, skip | `GET .../status`                                            |
| Open in inspector           | `GET .../artifacts/{filename}`                              |
| Edit change artifacts       | `PUT .../artifacts/{filename}` when editing enabled (§10.5) |

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

**Dropped tab:** **Linked changes** — no reverse list of changes per spec in the UI. Users see which specs a change touches from the change Overview; use `GET /changes/overlaps` when multiple active changes conflict.

### 9.1. Overview (keep)

| Content                           | API                                 |
| --------------------------------- | ----------------------------------- |
| Workspace, path, metadata summary | `GET /workspaces/{ws}/specs/{path}` |
| Dependency summary                | Metadata + `GET .../context` deps   |

### 9.2. Artifacts (keep)

| Content                      | API                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `spec.md`, `verify.md`, etc. | List from spec metadata + `GET .../artifacts/{filename}` (read-only)              |
| Open verify next to spec     | Inspector tabs; edit only via an active **change** that owns deltas for this spec |

### 9.3. Metadata (keep)

| Content                              | API                                      |
| ------------------------------------ | ---------------------------------------- |
| `.specd-metadata.yaml` parsed fields | Part of `GET spec` or dedicated artifact |
| Stale metadata warnings              | Freshness checks when generating context |

### 9.4. Dependencies (keep)

| Content                  | API                                            |
| ------------------------ | ---------------------------------------------- |
| `dependsOn` / references | Metadata + `GET .../context` with `followDeps` |

### 9.5. Schema (keep)

| Content                          | API                                         |
| -------------------------------- | ------------------------------------------- |
| Applicable artifact types, rules | `GET /project/schema` + spec’s schema slice |

### 9.6. Code graph (keep)

| Content                    | API                            |
| -------------------------- | ------------------------------ |
| Linked files/symbols/tests | `GET /graph/specs/{ws}/{path}` |
| Stale warning              | `GET /graph/status`            |

### 9.7. History (optional / v2)

Canonical specs do not carry change-style event logs. **History** tab only makes sense for:

- Git history (desktop / future integration), or
- A minimal archive activity list (changes that merged this spec), if needed later — not a v1 tab.

Otherwise **drop** in v1.

### 9.8. Context (keep)

| Content                     | API                                         |
| --------------------------- | ------------------------------------------- |
| Spec-level compiled context | `GET /workspaces/{ws}/specs/{path}/context` |

---

## 10. Right inspector panel (artifact-selected)

Inspector tabs depend on **artifact kind** (§10.2–10.4). Editor: **Monaco** (§7.1.1). Shared tabs on every selection:

| Tab          | Content                                                         |
| ------------ | --------------------------------------------------------------- |
| **Metadata** | Hashes, `validatedHash`, updated times, parser format.          |
| **Schema**   | Validation rules for this artifact type (from active schema).   |
| **Graph**    | Symbol/file links when cursor maps to code graph (optional v2). |

### 10.2. Non-delta artifacts (e.g. `proposal.md`, `design.md`, `tasks.md`)

| Tab         | Content                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| **Edit**    | `ArtifactEditor` (Monaco) on `GET .../artifacts/{filename}`; **Save** → `PUT` when §10.5 allows. |
| **Preview** | Rendered markdown (or format-appropriate read-only view); read-only.                             |

No **Full diff** — no canonical `base`/`merged` pair from `PreviewSpec` for these files.

### 10.3. Delta-backed spec artifacts (e.g. `deltas/.../*.delta.yaml`)

When the open file is a **delta** for a spec in the change (or the user selects a spec-scoped artifact row), show **three primary tabs** plus Metadata/Schema:

| Tab           | Content                                                                                                             | API                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delta**     | Monaco (`yaml`) editing the delta file on disk                                                                      | `GET` / `PUT .../artifacts/{deltaFilename}`                                                                                                       |
| **Preview**   | Read-only **merged** output for the target artifact (full `spec.md` / `verify.md` text after apply)                 | `GET /changes/{name}/preview?specId=&artifactId=` → `files[].merged`                                                                              |
| **Full diff** | **Unified diff of entire files** `base` → `merged` (one patch per preview file), **not** a per-op delta hunk viewer | Same preview payload; compute with `diff.createTwoFilesPatch` in UI (CLI `spec-preview --diff` parity). Optional API: `?diff=unified` on preview. |

**Full diff rules:**

- Compare **whole artifact files** (e.g. complete `spec.md`), not isolated delta operations.
- Selector when preview returns multiple files (`spec.md`, `verify.md`).
- `base: null` → treat as new file (all lines added). `status: no-op` / `missing` → explicit empty or error state, not a broken diff.
- After **Delta** save → refetch preview before **Preview** / **Full diff**.

### 10.4. Canonical workspace spec (read-only v1)

From `GET /workspaces/.../artifacts/{filename}`:

| Tab         | Content                        |
| ----------- | ------------------------------ |
| **Preview** | Rendered markdown.             |
| **Source**  | Monaco read-only (`markdown`). |

No **Delta** / **Full diff** without an active change context.

### 10.5. Artifact editing policy

**Yes for change artifacts** — otherwise Studio is only a viewer. The core already supports writes via `ChangeRepository.saveArtifact()` with `originalHash` optimistic concurrency (`ArtifactConflictError` on drift).

**No direct edit of canonical workspace specs in v1** — specs under `specs/<workspace>/` are source of truth; the normal path is edit **change** artifacts (including deltas), then validate → archive. Studio must not become a second bypass around the change workflow.

| Surface                                                              | Editable?        | API                                           | Notes                                                                                                                           |
| -------------------------------------------------------------------- | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Change** artifacts (`proposal`, `design`, `tasks`, delta files, …) | **Yes** (phased) | `PUT /changes/{name}/artifacts/{filename}`    | After save, artifact/file state returns to `in-progress`; user runs `POST .../validate`. May invalidate approvals (core rules). |
| **Workspace** canonical `spec.md` / `verify.md`                      | **No** (v1)      | No `PUT` on `/workspaces/.../artifacts` in v1 | Read-only browse; optional “open in editor” deep link (desktop) is out of band, not Studio write API.                           |
| **Archived** changes                                                 | **No**           | —                                             | Read-only.                                                                                                                      |

**By delivery mode:**

| Mode                                        | Change artifact edit                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `specd ui serve` / desktop (local project)  | **On** from phase 3 — primary authoring surface alongside agents/CLI.                                                 |
| `specd-studio-web` (standalone, remote API) | **Off** in v1 (read-only client); **On** in v2+ when API auth + `specd:changes:write` (and UI shows conflict/errors). |
| Embedded vs standalone                      | Same `@specd/ui` editor; host passes `editingEnabled` prop from trust/policy.                                         |

**UX requirements when edit is on:**

1. **Load** `GET` artifact → keep `originalHash` for the save body.
2. **Save** `PUT` with content + `originalHash`; on `409` / `ArtifactConflictError`, show diff or “file changed on disk” (agent, CLI, or other tab).
3. **After save:** refresh `GET .../status` — expect `in-progress`, possible approval invalidation banner.
4. **No autosave to cloud without intent** in v1 — explicit Save (optional local draft in `localStorage` for standalone only, never written until Save).
5. **Tasks / structured artifacts:** markdown/YAML/text first; structured task UI is v2+.

**Inspector:** editing on **Edit** / **Delta** (Monaco); **Preview** and **Full diff** are read-only and driven by `PreviewSpec` (§10.3).

**Dependencies (`@specd/ui`) — v1 stack (see change spec `ui:design-system`):**

| Layer                          | Packages                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| Styling                        | `tailwindcss`, `tailwind-merge`, `class-variance-authority`, `clsx` |
| Components                     | **shadcn/ui** (Radix primitives), `lucide-react`                    |
| Layout                         | `react-resizable-panels`                                            |
| Trees                          | `react-arborist`                                                    |
| Editor                         | `@monaco-editor/react`, `monaco-editor`                             |
| Preview / diff (artifact only) | `react-markdown` (or unified), `diff`                               |
| Desktop terminal               | `xterm` (+ addons), `node-pty` in Electron main                     |

shadcn components live under `packages/ui/src/components/ui/` and MUST be re-themed to GitHub-dark IDE density—not default marketing card layouts.

**Optional v2:** privileged “edit canonical spec” behind dangerous flag + separate scope — not planned for initial Studio.

---

## 11. Bottom panel

| Tab (left → right)   | Web                                                                                                    | Desktop                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Output** (default) | Full studio output stream (`POST/GET /v1/studio/output`) — saves, validate, scope, etc.                | Same                                   |
| **Problems**         | Warn/error filter of studio output stream (validation lines included when `warn`/`error`)              | Same                                   |
| **Logs**             | In-memory specd log readback (`GET /v1/logs`); UI actions also emit `debug` traces via `POST /v1/logs` | Same                                   |
| **Terminal**         | Not available                                                                                          | xterm + `node-pty`                     |
| **Git**              | Not available (v1)                                                                                     | Status/diff optional                   |
| **Agent events**     | Optional external stream (v2)                                                                          | Not MCP replay — separate integrations |

---

## 12. Phased delivery

| Phase  | Deliverables                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| **0**  | Specd change + package specs (`api`, `client`, `ui`); ADR for Studio vs `public-web`; dual delivery (§2.2).          |
| **1**  | `@specd/api` read-only; `specd serve`; auth static token.                                                            |
| **2**  | `@specd/ui` + Monaco read-only + markdown preview; delta **Preview** + **Full diff** tabs (`GET .../preview`).       |
| **2b** | `specd ui serve` (embedded); `specd-studio-web` Connect + read-only IDE.                                             |
| **3**  | Mutations + **Edit/Delta** save (`PUT`); validate, transition, draft/restore; Overview actions (no Transitions tab). |
| **3b** | Standalone web: artifact editing when remote API grants write scope.                                                 |
| **4**  | Code graph routes + Impact tab.                                                                                      |
| **5**  | `specd-studio-desktop`: welcome, open local / remote, **recent menu**, IPC kernel (local) + remote adapter.          |
| **6**  | JWT scopes, multi-tenant roots, CORS for standalone client, audit.                                                   |

---

## 13. Global spec compliance checklist

| Global spec                  | Studio compliance                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `architecture`               | API as adapter; `createKernel`; presenters; no core in UI.                                                  |
| `conventions`                | Lazy lists; ESM; named exports (framework exceptions documented).                                           |
| `error-handling-conventions` | `SpecdError` → problem JSON with stable `code`.                                                             |
| `testing`                    | Vitest; typed port mocks; no snapshots.                                                                     |
| `docs`                       | This draft lives at repo root (not under `docs/`); promote via specd workflow into formal specs when ready. |
| `core:change`                | UI respects gates, history-derived state, invalidation.                                                     |
| `cli:change-validate`        | `POST validate` semantics match; no fake semantic pass.                                                     |

---

## 14. Summary

- **API** = direct `createKernel` + `createCodeGraphProvider`; HTTP handlers never call CLI/MCP subprocesses.
- **`GET .../status`** is the read model for lifecycle and artifact readiness; **`POST .../validate`** runs checks.
- **Drop `GET .../validation`** and the **Transitions tab**; use **Overview + Events** instead.
- **Auth** = bearer/JWT at API edge + `ActorResolver` for history; desktop trusts main process.
- **Integrated:** `specd ui serve` = CLI starts `@specd/api` + serves `@specd/ui` for the **current project**.
- **Standalone:** `specd-studio-web` = Vite app without CLI; user picks API URL; uses `@specd/ui` in `standalone` mode.
- **Desktop:** **local** (folder / `specd.yaml`, kernel + IPC) or **remote** (URL + token); **File → Open Recent** history for both.
- **`@specd/ui`** = shared IDE; **`specd-studio-web`** = universal web client host; **`packages/cli`** = local stack launcher.
- **`public-web`** stays separate; Studio uses the package/app names in §2.
