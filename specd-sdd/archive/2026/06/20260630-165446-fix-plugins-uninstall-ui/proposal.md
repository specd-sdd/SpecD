# Proposal: fix-plugins-uninstall-ui

## Motivation

UI plugins installed under `plugins.ui` cannot be removed or updated via CLI because uninstall and update only target `plugins.agents`.

## Current behaviour

- `plugins uninstall` always calls `removePlugin` with bucket `agents`.
- `plugins update` only lists and updates plugins from `config.plugins.agents`.

## Proposed solution

Resolve plugin type bucket from loaded plugin type (uninstall) or from declaration buckets (update). Share bucket mapping with install via `plugin-bucket.ts`.

## Specs affected

### Modified specs

- `cli:plugins-uninstall`: bucket-aware `removePlugin` after `LoadPlugin`.
- `cli:plugins-update`: include `plugins.ui` in declaration enumeration and update set.

## Impact

- `packages/cli/src/commands/plugins/plugin-bucket.ts` (new)
- `packages/cli/src/commands/plugins/uninstall.ts`
- `packages/cli/src/commands/plugins/update.ts`
- `packages/cli/src/commands/plugins/install.ts` (import shared helper)
- Tests in `plugins.spec.ts`, `plugins-update.spec.ts`

## Open questions

None.
