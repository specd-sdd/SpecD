# Ipc Preload Bridge

## Purpose

Electron desktop host concern — **Ipc Preload Bridge**. Local mode runs `createKernel` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Expose a narrow, typed IPC API to the renderer via `contextBridge`.

## Requirements

### Requirement: preload exposes only whitelisted IPC methods

The preload script MUST NOT enable `nodeIntegration` in the renderer. Exposed methods MUST map 1:1 to `studio-desktop:ipc-handler-registry` channels.

### Requirement: bridge API is typed for TypeScript consumers

The renderer MUST import types for the bridged surface so port adapters remain type-safe.

## Spec Dependencies

- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
- [`client:ipc-message-envelope`](../../../../../../specs/client/ipc-message-envelope/spec.md) — IPC envelope types used by preload bridge
