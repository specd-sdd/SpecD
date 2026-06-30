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

Desktop-local graph IPC methods MUST create and use their graph provider from
`@specd/code-graph-electron`.

The Electron main process MUST keep graph execution inside the desktop-local host
runtime, including the SQLite-backed local graph operations exposed through IPC.
Renderer code MUST continue to call the shared `SpecdDataPort` surface and MUST
NOT import graph runtime packages directly.

## Spec Dependencies

- [`sdk:host-context`](../../sdk/host-context/spec.md) — SDK bootstrap for IPC main process
- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
- [`client:ipc-message-envelope`](../../../../../../specs/client/ipc-message-envelope/spec.md) — IPC envelope types used by preload bridge
