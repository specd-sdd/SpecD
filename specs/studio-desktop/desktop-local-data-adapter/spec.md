# Desktop Local Data Adapter

## Purpose

Electron desktop host concern — **Desktop Local Data Adapter**. Renderer-side `SpecdDataPort` that calls IPC instead of HTTP when the desktop app has opened a local project folder. Kernel ownership stays in the main process SDK host context — not in the renderer adapter.

## Requirements

### Requirement: local adapter is selected for opened project folders

When the user opens a local project in desktop, the renderer MUST use this adapter instead of `adapter-remote-specd-data`.

### Requirement: local adapter does not attach Authorization headers

The local profile MUST NOT use `client:adapter-bearer-auth`.

### Requirement: renderer does not bootstrap kernel

The local data adapter MUST NOT call `createKernel` or `createSdkContext`. Kernel ownership remains in the Electron main process.

## Spec Dependencies

- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
