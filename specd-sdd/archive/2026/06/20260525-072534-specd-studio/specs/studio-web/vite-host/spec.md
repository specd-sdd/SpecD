# Vite Host

## Purpose

Browser host for standalone Studio — **Vite Host**. Does not load a project kernel; users supply an API base URL and optional token before the shared `@specd/ui` IDE mounts.

## Requirements

### Requirement: package exposes standard vite scripts

`@specd/studio-web` MUST provide `dev`, `build`, and `preview` scripts that bundle the renderer importing `@specd/ui`.

### Requirement: host does not bootstrap a Specd kernel

The Vite host MUST NOT load `specd.yaml`, MUST NOT call `createKernel`, and MUST NOT start an API process — the API is started separately (e.g. `specd ui serve`).

### Requirement: Vite receives API base from ui serve

When `SPECD_API_BASE_URL` is set by `specd ui serve`, Vite MUST expose it to the renderer (e.g. `import.meta.env.VITE_SPECD_API_BASE_URL`) so `SpecdApp` auto-connects to the API origin. CORS for the UI origin is configured by the CLI (see `cli:serve-ui`), not via a dev proxy.

## Spec Dependencies

_none_
