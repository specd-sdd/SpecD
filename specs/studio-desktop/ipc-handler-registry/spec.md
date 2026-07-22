# Ipc Handler Registry

## Purpose

Electron desktop host concern — **Ipc Handler Registry**. Local mode uses an SDK-bootstrapped kernel in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Register main-process IPC channels that implement `client:port-*` semantics without HTTP.

## Requirements

### Requirement: IPC handlers mirror SpecdDataPort operations

Each handler MUST call the same kernel use cases as the HTTP API would for the equivalent port method (no duplicated business rules in the renderer). Kernel access MUST go through the process-scoped SDK host context created by `createSdkContext`.

v1 local desktop MUST implement draft-aware port methods `previewChangeDraft`, `outlineChangeArtifact`, and `outlineSpecDraft` via the same kernel use cases as `POST` preview/outline routes.

### Requirement: handlers use ipc-message-envelope

Request/response serialization MUST follow `client:ipc-message-envelope`.

### Requirement: SDK kernel access in IPC handlers

IPC handlers MUST invoke kernel use cases on the process-scoped kernel from `createSdkContext`. They MUST NOT construct a separate kernel per handler invocation.

### Requirement: graph IPC methods use the Electron graph runtime

Desktop-local graph IPC methods MUST reuse a long-lived, already-open
`CodeGraphProvider` owned by the process/project SDK host context — not open and
close a provider per IPC call, and not call `createCodeGraphProvider` directly.

The host context MUST be constructed with SDK `graph` options that select
`graphStoreId: 'sqlite-electron'` and register the additive factory from
`@specd/code-graph-sqlite-electron`.

On `GraphProviderStaleError`, the desktop host MUST `close()` and `open()` (or
replace) the long-lived provider before retrying the IPC operation. On project
switch or host teardown, the desktop host MUST `close()` the long-lived provider.

Desktop MUST NOT use `withOpenGraphProvider` for routine graph IPC. Graph index IPC
MUST call `runIndexProjectGraph` from `@specd/sdk` with `provider` set to the
session long-lived opened provider. Desktop MUST NOT index by calling
`createIndexProjectGraph` directly as the routine path, and MUST NOT replace/reopen
the long-lived provider solely because index completed — including when `force: true`
(provider-owned recreate updates that same instance).

The Electron main process MUST keep graph execution inside the desktop-local host
runtime. Renderer code MUST continue to call the shared `SpecdDataPort` surface and
MUST NOT import graph runtime packages directly.

Desktop-local graph IPC MUST NOT import `@specd/code-graph-electron` for provider
construction on this path.

### Requirement: project status uses the canonical client mapper

The local project-status IPC handler MUST map its kernel, graph-health, and auth inputs through the pure project-status mapper exported by `@specd/client`.

The IPC result MUST have the same `ProjectStatusDto` shape and optional-field semantics as the HTTP project-status response. The handler MUST NOT maintain a second status presenter.

## Spec Dependencies

- [`sdk:host-context`](../../sdk/host-context/spec.md) — SDK bootstrap for IPC main process
- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
- [`client:ipc-message-envelope`](../../../../../../specs/client/ipc-message-envelope/spec.md) — IPC envelope types used by preload bridge
- [`client:dto-project-status`](../../client/dto-project-status/spec.md) — canonical status DTO and pure mapper shared with HTTP
- [`code-graph-sqlite-electron:sqlite-electron-store`](../../code-graph-sqlite-electron/sqlite-electron-store/spec.md) — Electron SQLite factory used by local graph IPC
- [`code-graph:composition`](../../code-graph/composition/spec.md) — long-lived provider lifecycle for Electron hosts
- [`sdk:run-index-project-graph`](../../sdk/run-index-project-graph/spec.md) — project index orchestration with optional injected provider
