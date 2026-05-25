# Serve Ui

## Purpose

`specd ui serve` is the “open Studio on this repo” experience: same API as `specd serve` plus static `@specd/ui` on one origin so the IDE skips the remote connect gate and uses relative `/v1` calls.

## Requirements

### Requirement: ui serve inherits serve-api flags plus open and ui-dist

`specd ui serve` MUST expose all `cli:serve-api` flags and add `--open|-o` and `--ui-dist`.

### Requirement: ui serve mounts static UI distribution

The command MUST pass `uiDistPath` into `createApiServer` so `api:http-server-static-ui` serves the built `@specd/ui` assets.

### Requirement: embedded Studio skips remote connect gate

The embedded client configuration MUST set same-origin `apiBase` and MUST NOT require `ui:connect-panel` before showing the IDE.

## Spec Dependencies

- [`api:composition-create-api-server`](../../api/composition-create-api-server/spec.md) — starts server
- [`cli:serve-api`](../serve-api/spec.md) — shared flags
