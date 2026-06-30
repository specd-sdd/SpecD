# Bottom Panel Terminal

## Purpose

Electron desktop host concern — **Bottom Panel Terminal**. Local mode bootstraps an SDK host context (`createSdkContext`) in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack. Optional integrated terminal (xterm + node-pty) in the desktop bottom panel.

## Requirements

### Requirement: terminal cwd defaults to open project root

When a local project is active, new terminal sessions MUST start with `cwd` set to the project root unless the user overrides.

## Spec Dependencies

- [`client:specd-data-port`](../../../../../../specs/client/specd-data-port/spec.md) — IPC data contract implemented by the desktop adapter
