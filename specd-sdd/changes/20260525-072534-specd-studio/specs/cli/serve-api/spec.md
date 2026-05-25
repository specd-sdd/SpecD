# Serve Api

## Purpose

Developers and agents need an API-only entry point for a repo without bundling the UI. `specd serve` discovers `specd.yaml`, starts `createApiServer` on loopback, and in v1 accepts only `--auth disabled` so local Studio behavior matches embedded serve.

## Requirements

### Requirement: serve command exposes port host config and auth flags

The CLI MUST register `specd serve` with `--port|-p` (default 4400), `--host|-h` (default 127.0.0.1), `--config|-c`, and `--auth`.

### Requirement: serve auth flag accepts only disabled in v1

When `--auth` is provided, the only accepted value MUST be `disabled`; any other value MUST exit with a non-zero status and an explanatory message.

### Requirement: serve discovers project and starts default auth registry

The command MUST discover `specd.yaml`, build `createApiServer` with `defaultAuthAdapterRegistry()`, and listen until SIGINT.

## Spec Dependencies

- [`api:composition-create-api-server`](../../api/composition-create-api-server/spec.md) — starts server
