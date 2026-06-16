# Ipc Handler Registry

## Purpose

Electron desktop host concern — **Ipc Handler Registry**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Register main-process IPC channels that implement `client:port-*` semantics without HTTP.

## Requirements

### Requirement: IPC handlers mirror SpecdDataPort operations

Each handler MUST call the same kernel use cases as the HTTP API would for the equivalent port method (no duplicated business rules in the renderer).

v1 local desktop MUST implement draft-aware port methods `previewChangeDraft`, `outlineChangeArtifact`, and `outlineSpecDraft` via the same kernel use cases as `POST` preview/outline routes.

### Requirement: handlers use ipc-message-envelope

Request/response serialization MUST follow `client:ipc-message-envelope`.

### Requirement: graph IPC methods use the Electron graph runtime

Desktop-local graph IPC methods MUST create and use their graph provider from
`@specd/code-graph-electron`.

The Electron main process MUST keep graph execution inside the desktop-local host
runtime, including the SQLite-backed local graph operations exposed through IPC.
Renderer code MUST continue to call the shared `SpecdDataPort` surface and MUST
NOT import graph runtime packages directly.

## Spec Dependencies

_none_
