# Ipc Handler Registry

## Purpose

Electron desktop host concern — **Ipc Handler Registry**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Register main-process IPC channels that implement `client:port-*` semantics without HTTP.

## Requirements

### Requirement: IPC handlers mirror SpecdDataPort operations

Each handler MUST call the same kernel use cases as the HTTP API would for the equivalent port method (no duplicated business rules in the renderer).

v1 local desktop MUST implement draft-aware port methods `previewChangeDraft`, `outlineChangeArtifact`, and `outlineSpecDraft` via the same kernel use cases as `POST` preview/outline routes.

### Requirement: handlers use ipc-message-envelope

Request/response serialization MUST follow `client:ipc-message-envelope`.

## Spec Dependencies

_none_
