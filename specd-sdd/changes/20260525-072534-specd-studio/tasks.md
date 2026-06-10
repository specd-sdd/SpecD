# Tasks: specd-studio

## Before you implement — read this first

**`design.md` is only an index** (package layout, spec ID tables, phase order). It does **not** contain full requirements, HTTP contracts, or UI behaviour.

For **every** task below you MUST read, before coding:

1. **`proposal.md`** — save pipeline (§`SaveChangeArtifact`), polling model, handler→kernel matrix, granularity rules.
2. **The matching `spec.md` + `verify.md`** under `specd-sdd/changes/20260525-072534-specd-studio/specs/<workspace>/<capability>/` (or `deltas/` for core/global). Implement to satisfy **all** requirements and implement tests from **verify scenarios**.
3. **`.specd-exploration.md`** — preserved discovery snapshot. Use it only as orientation; if it conflicts with current change specs or artifacts, **the current change wins**.

Use `node packages/cli/dist/index.js changes spec-preview specd-studio <specId> --artifact specs|verify` for merged deltas. Do not implement from `design.md` or the reference draft alone.

---

## 0. Orientation

- [x] 0.1 Load change context and spec index
      `specd-sdd/changes/20260525-072534-specd-studio/design.md` §Spec catalog — list all 148 `specId`s in scope
      Approach: run `node packages/cli/dist/index.js change status specd-studio --format toon`; keep a checklist of spec IDs; mark each complete when code + tests satisfy its `verify.md`
      (Req: change scope)

- [x] 0.2 Verify package boundaries before first PR
      `packages/ui`, `packages/client`, `packages/api` — import graph
      Approach: `ui` must not import `@specd/core`; `client` must not import `@specd/core`; `api` may import `core` and `code-graph` only per `default:_global/architecture` delta
      (Req: SpecD Studio package graph)

---

## 1. Core — manifest, status, artifact I/O

Read deltas + new specs: `deltas/core/change-manifest`, `deltas/core/change`, `deltas/core/get-status`, `deltas/core/change-repository-port`, `specs/core/save-change-artifact`, `specs/core/get-change-artifact`.

- [x] 1.1 Persist `updatedAt` on manifest load/save
      `packages/core/src/infrastructure/fs/change-repository.ts`: manifest serialization
      Approach: on create set `updatedAt === createdAt`; on every `save(change)` set ISO `updatedAt`; legacy manifests backfill once then persist on next save
      (Req: `core:change-manifest` — updatedAt revision clock)

- [x] 1.2 Expose `updatedAt` on `Change` entity
      `packages/core/src/domain/entities/change.ts`
      Approach: load field from manifest; factory rejects `updatedAt < createdAt`
      (Req: `core:change` — Identity)

- [x] 1.3 `GetStatus` supports `ifModifiedSince` short-circuit
      `packages/core/src/application/use-cases/get-status.ts`
      Approach: when `ifModifiedSince >= change.updatedAt` return `{ unchanged: true, updatedAt }` without building artifact DAG; else full status including `updatedAt`
      (Req: `core:get-status` — Optional ifModifiedSince short-circuit, Exposes updatedAt)

- [x] 1.4 Shared drift reconciliation hook
      `packages/core/src/infrastructure/fs/change-repository.ts`
      Approach: extract algorithm from end-of-`get()`; call from `get()` and from `SaveChangeArtifact` after write with `excludeFileKeys` containing saved filename
      (Req: `core:change-repository-port` — Shared drift reconciliation hook)

- [x] 1.5 Implement `GetChangeArtifact` use case
      `packages/core/src/application/use-cases/get-change-artifact.ts` + kernel registration
      Approach: `ChangeRepository.mutate` → `artifact()` → `{ content, originalHash }`; reject untracked filenames
      (Req: `core:get-change-artifact` — all requirements)

- [x] 1.6 Implement `SaveChangeArtifact` use case
      `packages/core/src/application/use-cases/save-change-artifact.ts` + kernel registration
      Approach: follow proposal §SaveChangeArtifact steps (guard, `SaveRequiresForceError`, `ArtifactConflictError`, in-progress file, drift exclude self, `save` → new `updatedAt`)
      (Req: `core:save-change-artifact` — all requirements)

- [x] 1.7 Core automated tests from verify deltas
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`, `packages/core/test/application/use-cases/`
      Approach: add cases for `updatedAt`, conditional status, save 409/force, drift hook exclusion; map each scenario in core verify deltas
      (Req: verify scenarios for core deltas and new core specs)

---

## 2. Project config and `@specd/api` scaffold

Read: `deltas/core/config` (spec + verify), `api:composition-create-api-server`, workspace `specs/core/config` for surrounding config rules.

**Deferred (not this change):** `updatedAt` on workspace specs / spec-lock — spec tabs use light metadata poll only (`ui:spec-tab-*`).

- [x] 2.1 Add `api.auth` to config spec and `specd.yaml` schema
      `deltas/core/config` → `packages/core` config loader/validation; `packages/schema-std/schema.yaml` (or schema module used by `ConfigLoader`)
      Approach: implement `core:config` delta (`api.auth.type`, optional `api.auth.config`; default `disabled`; startup rejects unknown `type` in v1); mirror shape in JSON schema; CLI `--auth` may override for one process
      (Req: `core:config` — API authentication settings; `api:composition-create-api-server` — auth configuration is read from specd.yaml api.auth only)

- [x] 2.2 Scaffold `packages/api` package
      `packages/api/package.json`, `packages/api/src/index.ts`, folder tree per `design.md` §Package layout
      Approach: ESM `NodeNext`; export `createApiServer`; wire workspace in root `pnpm` / `specd.yaml`
      (Req: `default:_global/architecture` — SpecD Studio package graph)

---

## 3. API — auth, context, server composition

Read specs: `api:domain-api-actor`, `api:port-api-token-verifier`, `api:auth-adapter-registry`, `api:adapter-auth-disabled`, `api:adapter-api-actor-resolver`, `api:middleware-auth`, `api:composition-create-api-context`, `api:composition-create-api-server`, `api:composition-graph-provider`, `api:http-server-bootstrap`.

- [x] 3.1 Auth domain, port, registry, disabled adapter
      `packages/api/src/domain/auth/`, `application/ports/`, `application/auth/`, `infrastructure/auth/disabled-verifier.ts`
      Approach: `defaultAuthAdapterRegistry()` registers only `disabled`; `resolve` throws on unknown type; disabled verifier does not read Bearer
      (Req: `api:domain-api-actor`, `api:port-api-token-verifier`, `api:auth-adapter-registry`, `api:adapter-auth-disabled`)

- [x] 3.2 ApiActor → ActorResolver bridge
      `packages/api/src/infrastructure/auth/` (adapter-api-actor-resolver)
      Approach: per-request map `ApiActor` to `ActorIdentity`; disabled path delegates to kernel `ActorResolver`
      (Req: `api:adapter-api-actor-resolver`)

- [x] 3.3 Auth middleware and request context
      `packages/api/src/delivery/http/middleware/auth.ts`, `composition/create-api-context.ts`
      Approach: middleware attaches actor; `createApiContext` returns `{ kernel, actor, createGraphProvider }`; v1 pass-through for disabled
      (Req: `api:middleware-auth`, `api:composition-create-api-context`)

- [x] 3.4 `createApiServer` and graph provider factory
      `packages/api/src/composition/create-api-server.ts`, `composition/graph-provider.ts`
      Approach: load config; `registry.resolve(api.auth.type)`; single process-scoped `Kernel`; register all `/v1` routes; optional `uiDistPath`
      (Req: `api:composition-create-api-server`, `api:composition-graph-provider`)

- [x] 3.5 HTTP bootstrap — listen, `/v1`, health, shutdown
      `packages/api/src/` server entry wired from composition
      Approach: `GET /v1/health` exposes `auth.type`; SIGINT graceful shutdown; no duplicate unprefixed routes
      (Req: `api:http-server-bootstrap`)

---

## 4. API — errors, CORS, static UI, OpenAPI

Read: `api:problem-json`, `api:presenter-problem`, `api:middleware-cors`, `api:http-server-static-ui`, `api:openapi-generation`, `api:openapi-docs-route`.

- [x] 4.1 Problem+json mapping
      `packages/api/src/delivery/http/problem-json.ts`, `presenters/presenter-problem.ts`
      Approach: map `SpecdError` to RFC 7807; preserve specd error codes for client adapter
      (Req: `api:problem-json`, `api:presenter-problem`)

- [x] 4.2 CORS middleware
      `packages/api/src/delivery/http/middleware/cors.ts`
      Approach: configurable origins from `specd.yaml`; explicit credentials mode
      (Req: `api:middleware-cors`)

- [x] 4.3 Static UI mount for `specd ui serve`
      `packages/api/src/` static plugin
      Approach: serve `uiDistPath` at `/`; SPA fallback `index.html`; `/v1` not captured by fallback
      (Req: `api:http-server-static-ui`)

- [x] 4.4 OpenAPI document and docs route
      `packages/api/src/delivery/openapi/`
      Approach: generate from Zod/DTO modules; `GET /v1/openapi.json`; gate `/docs` by environment
      (Req: `api:openapi-generation`, `api:openapi-docs-route`)

---

## 5. API — DTOs (16 specs)

For **each** `api:dto-*` spec in `specs/api/dto-*/spec.md`: read spec + verify, then implement matching TypeScript type / Zod schema used by presenters and OpenAPI.

- [x] 5.1 Implement project and change DTOs
      `packages/api/src/delivery/http/dto/` — project, project-status, change-summary, change-detail, change-status, artifact-content
      Approach: `ChangeStatusDto` includes `updatedAt` and unchanged short-circuit shape; camelCase; optional fields omitted when absent
      (Req: `api:dto-project`, `api:dto-project-status`, `api:dto-change-summary`, `api:dto-change-detail`, `api:dto-change-status`, `api:dto-artifact-content`)

- [x] 5.2 Implement validate, context, preview, spec DTOs
      Same directory — validate-result, compiled-context, preview-result, spec-summary, spec-detail, workspace-spec-tree
      (Req: `api:dto-validate-result`, `api:dto-compiled-context`, `api:dto-preview-result`, `api:dto-spec-summary`, `api:dto-spec-detail`, `api:dto-workspace-spec-tree`)

- [x] 5.3 Implement graph DTOs
      Same directory — graph-status, graph-search, graph-impact, change-graph-view
      (Req: `api:dto-graph-status`, `api:dto-graph-search`, `api:dto-graph-impact`, `api:dto-change-graph-view`)

---

## 6. API — presenters (6 specs)

Read each `specs/api/presenter-*/spec.md` + verify before implementing mapper.

- [x] 6.1 Presenters: project, change, artifact
      `packages/api/src/delivery/http/presenters/`
      Approach: map kernel entities to DTOs; no business rules; change status includes `updatedAt` and transitions projection
      (Req: `api:presenter-project`, `api:presenter-change`, `api:presenter-artifact`)

- [x] 6.2 Presenters: spec, graph, problem
      Same directory
      (Req: `api:presenter-spec`, `api:presenter-graph`, `api:presenter-problem`)

---

## 7. API — route handlers (9 route + 9 handler spec pairs)

For each pair: read `api:routes-*` (contract) then `api:handler-*` (wiring). Handlers MUST NOT call `ChangeRepository` directly.

- [x] 7.1 Project routes + handler
      `handler-project.ts`
      Approach: `GET /v1/project`, `/project/status`, `/project/context`, `/project/schema`, schema validate — compose lists like CLI where needed
      (Req: `api:routes-project`, `api:handler-project`)

- [x] 7.2 Changes collection routes + handler
      `handler-changes-collection.ts`
      Approach: list changes/drafts/discarded/archived, `POST /changes`, overlaps
      (Req: `api:routes-changes-collection`, `api:handler-changes-collection`)

- [x] 7.3 Changes read routes + handler
      `handler-changes-read.ts`
      Approach: detail without bodies; status + `ifModifiedSince`; `refreshImplementation` query; **`GetChangeArtifact`** for artifact body; context/preview/instructions
      (Req: `api:routes-changes-read`, `api:handler-changes-read`)

- [x] 7.4 Changes mutate routes + handler
      `handler-changes-mutate.ts`
      Approach: **`SaveChangeArtifact`** on PUT artifact; validate, transition, PATCH metadata, lifecycle posts; pass request actor
      (Req: `api:routes-changes-mutate`, `api:handler-changes-mutate`)

- [x] 7.5 Archived changes routes + handler
      `handler-archived-changes.ts`
      (Req: `api:routes-archived-changes`, `api:handler-archived-changes`)

- [x] 7.6 Workspaces routes + handler
      `handler-workspaces.ts`
      Approach: workspaces list, spec tree, search — metadata-first reads
      (Req: `api:routes-workspaces`, `api:handler-workspaces`)

- [x] 7.7 Specs read routes + handler
      `handler-specs-read.ts`
      Approach: canonical spec artifacts read-only in v1; outline and context routes
      (Req: `api:routes-specs-read`, `api:handler-specs-read`)

- [x] 7.8 Specs mutate routes + handler
      `handler-specs-mutate.ts`
      (Req: `api:routes-specs-mutate`, `api:handler-specs-mutate`)

- [x] 7.9 Graph routes + handler
      `handler-graph.ts`
      Approach: status, index POST, search, impact, hotspots, spec/change linkage via `createGraphProvider`
      (Req: `api:routes-graph`, `api:handler-graph`)

- [x] 7.10 API handler integration tests
      `packages/api/test/` (add)
      Approach: one test module per handler group covering happy path + 404/409 from verify scenarios
      (Req: all `api:handler-*` verify files)

---

## 8. `@specd/client`

Read `client:specd-data-port` first, then ports, adapters, DTOs, transport.

- [x] 8.1 HTTP transport and error adapters
      `packages/client/src/transport/`, `adapters/bearer-auth.ts`, `adapters/problem-json-errors.ts`
      Approach: normalize base URL + `/v1`; `Accept: application/json`; optional Bearer; map problem+json to typed errors
      (Req: `client:port-http-transport`, `client:adapter-bearer-auth`, `client:adapter-problem-json-errors`)

- [x] 8.2 Client DTOs mirror API (16 specs)
      `packages/client/src/dto/`
      Approach: for each `client:dto-*` read paired `api:dto-*` spec; keep field names aligned
      (Req: all `client:dto-*`)

- [x] 8.3 Port interfaces per route group
      `packages/client/src/ports/port-*.ts`
      Approach: method signatures match `api:routes-*` contracts; `getChangeStatus` accepts `ifModifiedSince`
      (Req: `client:port-project`, `client:port-changes-collection`, `client:port-changes-read`, `client:port-changes-mutate`, `client:port-archived-changes`, `client:port-workspaces-specs`, `client:port-graph`)

- [x] 8.4 `SpecdDataPort` aggregate + remote adapter
      `packages/client/src/specd-data-port.ts`, `adapters/remote-specd-data.ts`
      Approach: compose ports; remote adapter stacks transport + bearer + problem; no core import
      (Req: `client:specd-data-port`, `client:adapter-remote-specd-data`)

- [x] 8.5 Memory adapter for tests/Storybook
      `packages/client/src/adapters/memory-specd-data.ts`
      (Req: `client:adapter-memory-specd-data`)

- [x] 8.6 IPC message envelope types
      `packages/client/src/ipc/envelope.ts` (or shared types package path)
      (Req: `client:ipc-message-envelope`)

---

## 9. CLI serve commands

Read: `cli:serve-api`, `cli:serve-ui`.

- [x] 9.1 `specd serve` command
      `packages/cli/src/commands/serve/serve-api.ts`
      Approach: flags `--port/-p`, `--host/-h`, `--config/-c`, `--auth disabled` only; call `createApiServer`; discover project from cwd
      (Req: `cli:serve-api` — all requirements)

- [x] 9.2 `specd ui serve` command
      `packages/cli/src/commands/serve/serve-ui.ts`
      Approach: inherit serve flags + `--open/-o`, `--ui-dist`; resolve `@specd/ui/dist`
      (Req: `cli:serve-ui` — all requirements)

---

## 10. `@specd/ui` — design system, shell, connect, global hooks

Read first: `ui:design-system` (full palette and IDE chrome rules). Then: `ui:shell-layout`, `ui:connect-panel`, `ui:command-palette`, `ui:hooks-project`, `ui:hooks-changes-collection`, `ui:hooks-workspaces-specs`, `ui:hooks-graph`.

- [x] 10.0 Tailwind + shadcn + design tokens
      `packages/ui/` — `tailwind.config`, `styles/globals.css`, `src/components/ui/`, `lib/utils.ts` (`cn` + tailwind-merge + cva)
      Approach: init shadcn for dark IDE theme mapped to Studio palette; deps: tailwindcss, cva, tailwind-merge, lucide-react, Radix peers; re-theme defaults away from SaaS card layout; import globals at `SpecdApp`
      (Req: `ui:design-system` — color tokens, UI stack, theme centralized)

- [x] 10.0b Layout and tree libraries
      `packages/ui/src/shell/`, `packages/ui/src/sidebars/`
      Approach: `react-resizable-panels` (via shadcn `Resizable`) for shell splits; shared Studio tree wrappers for workspace/change trees (with `react-arborist` optional, not mandatory); `@monaco-editor/react` wired in artifact-editor package path
      (Req: `ui:design-system` — layout panels, sidebar trees, artifact surfaces)

- [x] 10.1 `SpecdApp` + shell layout + global poll orchestration
      `packages/ui/src/SpecdApp.tsx`, `shell/`
      Approach: regions sidebar/tabs/inspector/bottom; poll 2–3s while `document.hasFocus()`; pause on blur; never import `@specd/core`
      (Req: `ui:shell-layout`)

- [x] 10.2 Connect panel (remote / standalone)
      `packages/ui/src/connect-panel/`
      Approach: URL + optional token; test via `GET /v1/project`; show `auth.type` from API only
      (Req: `ui:connect-panel`)

- [x] 10.3 Global data hooks
      `packages/ui/src/hooks/`
      Approach: dedupe in-flight; project + collection + workspaces hooks wired to ports; graph status for sidebar entry
      (Req: `ui:hooks-project`, `ui:hooks-changes-collection`, `ui:hooks-workspaces-specs`, `ui:hooks-graph`)

- [x] 10.4 Command palette
      `packages/ui/src/command-palette/`
      Approach: actions call `SpecdDataPort` methods (validate, open change, etc.)
      (Req: `ui:command-palette`)

---

## 11. `@specd/ui` — sidebars

Read each `ui:sidebar-*` spec + verify.

- [x] 11.1 Changes sidebars (in progress, drafts, archive, discarded)
      `packages/ui/src/sidebars/`
      Approach: render global poll data; wire open/discard/restore actions to ports
      (Req: `ui:sidebar-changes-in-progress`, `ui:sidebar-changes-drafts`, `ui:sidebar-changes-archive`, `ui:sidebar-changes-discarded`)

- [x] 11.2 Workspaces tree + graph entry
      `packages/ui/src/sidebars/`
      Approach: tree from workspaces/specs ports; stale graph badge from `getGraphStatus`
      (Req: `ui:sidebar-workspaces-tree`, `ui:sidebar-graph-entry`)

---

## 12. `@specd/ui` — change tabs

Read `ui:hooks-changes-read` plus **each** `ui:change-tab-*` and `ui:change-metadata-editor`.

- [x] 12.1 `hooks-changes-read` with tab-visible poll
      `packages/ui/src/hooks/changes-read.ts`
      Approach: pass `ifModifiedSince` from last `updatedAt`; refetch only visible tab sources when revision advances
      (Req: `ui:hooks-changes-read`)

- [x] 12.2 Change tabs: overview, artifacts, validation, tasks, events, context, impact
      `packages/ui/src/change-tabs/`
      Approach: one component module per spec; each documents which API calls refetch on `updatedAt` bump (see proposal polling table)
      (Req: `ui:change-tab-overview`, `ui:change-tab-artifacts`, `ui:change-tab-validation`, `ui:change-tab-tasks`, `ui:change-tab-events`, `ui:change-tab-context`, `ui:change-tab-impact`, `ui:change-metadata-editor`)

---

## 13. `@specd/ui` — spec tabs

Read each `ui:spec-tab-*` spec.

- [x] 13.1 Spec tabs (overview, artifacts, metadata, dependencies, schema, graph, context)
      `packages/ui/src/spec-tabs/`
      Approach: metadata poll while tab visible; no direct filesystem access
      (Req: `ui:spec-tab-overview`, `ui:spec-tab-artifacts`, `ui:spec-tab-metadata`, `ui:spec-tab-dependencies`, `ui:spec-tab-outline`, `ui:spec-tab-graph`, `ui:spec-tab-context`)

---

## 14. `@specd/ui` — editor, inspector, save hook, bottom panel

Read: `ui:artifact-editor`, `ui:hooks-inspector-save`, all `ui:inspector-*`, `ui:bottom-panel-*`, `ui:hooks-changes-mutate`.

- [x] 14.1 Inspector save hook
      `packages/ui/src/hooks/inspector-save.ts`
      Approach: send `content`, `originalHash`, optional `force`; 409 conflict UI; refetch artifact + status on success
      (Req: `ui:hooks-inspector-save`)

- [x] 14.2 Monaco artifact editor
      `packages/ui/src/artifact-editor/`
      Approach: load via port `getChangeArtifact`; explicit Save; Validate button; in-file find/replace; read-only when canonical
      (Req: `ui:artifact-editor`)

- [x] 14.3 Inspector modes (metadata, delta, preview, canonical readonly)
      `packages/ui/src/inspectors/`
      Approach: implement each `ui:inspector-*` spec; preview/delta/full-diff modes per spec
      (Req: `ui:inspector-metadata-schema`, `ui:inspector-edit-preview`, `ui:inspector-delta-edit`, `ui:inspector-delta-preview`, `ui:inspector-delta-full-diff`, `ui:inspector-canonical-readonly`)

- [x] 14.4 Mutate hook surfaces API errors
      `packages/ui/src/hooks/changes-mutate.ts`
      (Req: `ui:hooks-changes-mutate`)

- [x] 14.5 Bottom panel: problems, output, logs
      `packages/ui/src/bottom-panel/`
      (Req: `ui:bottom-panel-problems`, `ui:bottom-panel-output`, `ui:bottom-panel-logs`)

---

## 15. `specd-studio-web`

Read: `studio-web:vite-host`, `studio-web:remote-bootstrap`.

- [x] 15.1 Vite host package scripts and build
      `apps/specd-studio-web/`
      Approach: `dev`/`build`/`preview`; no kernel in dev server process
      (Req: `studio-web:vite-host`)

- [x] 15.2 Remote bootstrap + Connect gate
      `apps/specd-studio-web/src/`
      Approach: `mode="remote"`; persist connection profile; mount `<SpecdApp>` only after health succeeds
      (Req: `studio-web:remote-bootstrap`)

---

## 16. `specd-studio-desktop`

Read **each** `studio-desktop:*` spec before implementing that slice.

- [x] 16.1 Main kernel lifecycle and session manager
      `apps/specd-studio-desktop/main/kernel/`
      Approach: one kernel per local project; tear down on switch; validate `specd.yaml` on open
      (Req: `studio-desktop:main-kernel-lifecycle`)

- [x] 16.2 Window manager + welcome / file menu
      `apps/specd-studio-desktop/main/window/`, renderer welcome
      Approach: title reflects project or remote host; dirty editor close prompt
      (Req: `studio-desktop:main-window-manager`, `studio-desktop:welcome-and-file-menu`)

- [x] 16.3 Recent connections store
      `apps/specd-studio-desktop/main/connection/recent-connections-store.ts`
      (Req: `studio-desktop:recent-connections`)

- [x] 16.4 IPC preload bridge
      `apps/specd-studio-desktop/preload/`
      (Req: `studio-desktop:ipc-preload-bridge`)

- [x] 16.5 IPC handler registry (local profile)
      `apps/specd-studio-desktop/main/ipc/specd-data-handlers.ts`
      Approach: handlers satisfy `client:port-*` contracts via kernel; use `client:ipc-message-envelope`
      (Req: `studio-desktop:ipc-handler-registry`)

- [x] 16.6 Local and remote data adapters in renderer
      `apps/specd-studio-desktop/renderer/`
      Approach: local → IPC adapter without Authorization; remote → `adapter-remote-specd-data`
      (Req: `studio-desktop:desktop-local-data-adapter`, `studio-desktop:desktop-remote-profile`)

- [x] 16.7 Bottom panel terminal (desktop only)
      `apps/specd-studio-desktop/` xterm + node-pty
      (Req: `studio-desktop:bottom-panel-terminal`)

---

## 17. Integration, workspace wiring, release

- [x] 17.1 Monorepo workspace build graph
      Root `pnpm-workspace.yaml`, `specd.yaml`, package `package.json` files
      Approach: `api`, `client`, `ui`, studio apps compile; `@specd/specd` bundles ui dist for `ui serve`
      (Req: `default:_global/architecture`, `default:_global/conventions`)

- [x] 17.2 Architecture boundary lint or test
      `dev/scripts/` or package tests
      Approach: fail CI if `ui` or `client` imports `core`
      (Req: `default:_global/architecture` delta verify scenarios)

---

## 18. End-to-end and manual verification

Read `design.md` §Testing and proposal polling table.

- [ ] 18.1 Integrated smoke: `specd ui serve`
      Manual: loopback project with active change
      Approach: open Studio embedded; global poll updates sidebar; open change tab; verify `ifModifiedSince` after external manifest touch
      (Req: `ui:shell-layout`, `api:routes-changes-read`, polling model)

- [ ] 18.2 Save and conflict smoke
      Manual: edit `proposal.md` in Studio, Save, provoke 409, exercise force/reload UI
      Approach: covers `SaveChangeArtifact` + `hooks-inspector-save` + `handler-changes-mutate`
      (Req: `core:save-change-artifact`, `ui:hooks-inspector-save`)

- [ ] 18.3 Desktop dual profile smoke
      Manual: open local folder via IPC; connect remote URL; recents menu
      (Req: `studio-desktop:welcome-and-file-menu`, `studio-desktop:desktop-local-data-adapter`, `studio-desktop:desktop-remote-profile`)

- [ ] 18.4 Standalone web smoke
      Manual: `studio-web` dev against `specd serve` on another port with CORS configured
      (Req: `studio-web:remote-bootstrap`, `api:middleware-cors`)

---

## 19. shadcn/ui Migration

- [x] 19.0 Phase 0 & 1: Baseline and Primitives
      `packages/ui/components.json`, `tsconfig.json`, `src/components/ui/`
      Approach: Install all required shadcn primitives (`Dialog`, `Tabs`, `Accordion`, `Command`, `Card`, etc.) and set up path aliases.

- [x] 19.2 Phase 2: Dialog Migration
      `packages/ui/src/components/StudioDialog.tsx` and all dialog consumers
      Approach: Replace custom modal shell with thin shadcn `Dialog` wrapper; use `Button` components for all actions.

- [x] 19.3 Phase 3: Command Palette Migration
      `packages/ui/src/shell/CommandPalette.tsx`
      Approach: Replace custom command palette with shadcn `Command` + `Dialog` primitives.

- [x] 19.4 Phase 4: Tabs Migration
      `packages/ui/src/tabs/` (ChangeTabs, SpecTabs)
      Approach: Replace custom tab bar with shadcn `Tabs` while keeping Studio tab chrome through shared classes and theme tokens.

- [x] 19.5 Phase 5: Accordion Migration
      `packages/ui/src/change/ChangeMainView.tsx`, `packages/ui/src/spec/SpecMainView.tsx`
      Approach: Replace custom accordions with shadcn `Accordion`.

- [ ] 19.6 Phase 6: Card / Badge / Alert / Separator Migration
      Overview and Spec panels
      Approach: Continue replacing remaining ad hoc warning/error/divider blocks with shadcn `Card`, `Badge`, `Alert`, and `Separator`; `studio-card`/`studio-badge` now remain as wrapper skin classes behind shared primitives rather than feature-level widgets.

- [x] 19.6.1 Replace local card helpers and main panel surfaces
      `ChangeOverview`, `SpecOverview`, `ChangeStatusPanel`, `ChangeSpecsReadonlyPanel`, `ChangeDescriptionEditor`, `ChangeInvalidationPolicyEditor`, `ChangeScopeDialog`, `ChangeMainView`, `SpecMainView`, `ShellLayout`
      Approach: Recompose major overview/scope/spec surfaces with shadcn-backed `Card` and `Badge`.

- [x] 19.6.2 Normalize remaining alerts and separators
      Remaining warning, validation, and divider-heavy blocks
      Approach: Finish migrating residual ad hoc bordered status blocks to shadcn `Alert` / `Separator` where the custom markup still carries presentation weight.

- [x] 19.7 Phase 7: Sidebar and Tree Chrome Migration
      `packages/ui/src/sidebar/`
      Approach: Finish normalizing sidebar rows and sections with shadcn-backed Button, Badge, Card, and Collapsible; current workspace tree already uses shared wrappers but does not yet use a dedicated tree primitive.

- [x] 19.7.1 Recompose primary sidebar sections
      `ChangesSidebar`, `WorkspacesSidebar`, graph entry
      Approach: Move section chrome and badges onto shared shadcn-backed primitives while preserving Studio tree density.

- [x] 19.8 Phase 8: Form Composition Migration
      `ConnectPanel`, `ChangeDescriptionEditor`, `ChangeInvalidationPolicyEditor`
      Approach: Rework forms using shadcn `Input`, `Select`, `Textarea`.

- [x] 19.9 Phase 9: Top Bar and Shell Cleanup
      `StudioTopBar`, `ShellLayout`
      Approach: Replace raw buttons with shadcn `Button`, add `Tooltip` where appropriate, use `ScrollArea` for main containers, and normalize shell empty-state/status chrome.

- [x] 19.10 Phase 10: Final Cleanup and Artifact Closure
      All change artifacts
      Approach: Finish remaining spec/verify wording, close residual accessibility polish, and update all project artifacts to reflect the final shadcn-backed implementation.
