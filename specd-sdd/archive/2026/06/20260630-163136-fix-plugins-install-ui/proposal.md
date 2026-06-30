# Proposal: fix-plugins-install-ui

## Motivation

`specd plugins install` cannot install Studio UI plugins because the CLI always calls the agent install path. Users hit a validation error instead of getting `plugins.ui` populated, blocking `specd ui serve` and documented onboarding.

## Current behaviour

- Every install uses `InstallPlugin` and writes to `plugins.agents`.
- UI plugins are rejected by `InstallPlugin` with a message to use `InstallUiPlugin`.
- `cli:plugins-install` spec describes agent-only workflow.
- `plugin-ui-studio:bundle-plugin` and docs already require UI routing.

## Proposed solution

Route installation by loaded plugin type: agents use `InstallPlugin` + `plugins.agents`; UI plugins use `InstallUiPlugin` + `plugins.ui`. Detect already-installed plugins per type bucket before installing.

## Specs affected

### New specs

None.

### Modified specs

- `cli:plugins-install`: document type-based install routing, bucket mapping (`agents` / `ui`), and UI install scenario.
  - Depends on (added): `plugin-manager:ui-plugin-type`
  - Depends on (removed): none

## Impact

- `packages/cli/src/commands/plugins/install.ts`
- `packages/cli/test/commands/plugins.spec.ts`
- Enables `specd plugins install @specd/plugin-ui-studio` without manual `specd.yaml` edits

## Technical context

- `toPluginBucket('ui')` must return `ui`, not `uis`.
- Load plugin before install to determine type and bucket for skip detection.
- Code change implemented on branch prior to this change.

## Open questions

None.
