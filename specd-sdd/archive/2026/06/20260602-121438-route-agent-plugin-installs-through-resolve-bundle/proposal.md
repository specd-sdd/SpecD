# Proposal: route-agent-plugin-installs-through-resolve-bundle

## Motivation

Agent plugin installs currently bypass the `ResolveBundle` use case and call the
skill repository directly. That split already caused a real regression where
installed skill markdown kept `@{{sharedFolder}}/shared.md` unresolved because the
built-in render defaults were only injected on the `ResolveBundle` path.

## Current behaviour

`@specd/skills` already defines a canonical install-time use case in
`skills:resolve-bundle`, including built-in safe variable injection for
`configPath`, `schemaRef`, and the default relative `sharedFolder`.

However, the five `plugin-agent-*` install flows still resolve bundles by calling
`SkillRepository.getBundle(...)` directly from their local `InstallSkills` use
cases. That means plugins duplicate part of the render-context preparation and can
drift from the behavior already defined in `ResolveBundle`.

## Proposed solution

Route agent-plugin skill installs through `ResolveBundle` instead of calling the
repository directly. `@specd/skills` should remain the single owner of built-in
install-time render defaults, while plugins continue to provide runtime-specific
capabilities and frontmatter source values.

This change does not redesign the template contract. It narrows the install path so
all plugins use the same application boundary for bundle resolution and future
built-in render defaults cannot be skipped accidentally.

## Specs affected

### New specs

None.

### Modified specs

- `skills:resolve-bundle`: clarify that agent-plugin installs are expected to route
  bundle resolution through this use case so built-in render defaults are applied
  centrally.
  - Depends on (added): none
  - Depends on (removed): none

- `plugin-agent-claude:plugin-agent`: change the install contract so Claude resolves
  skill bundles through `ResolveBundle` instead of preparing bundle rendering by
  calling the repository directly.
  - Depends on (added): `skills:resolve-bundle`
  - Depends on (removed): none

- `plugin-agent-copilot:plugin-agent`: change the install contract so Copilot
  resolves skill bundles through `ResolveBundle` instead of preparing bundle
  rendering by calling the repository directly.
  - Depends on (added): `skills:resolve-bundle`
  - Depends on (removed): none

- `plugin-agent-codex:plugin-agent`: change the install contract so Codex resolves
  skill bundles through `ResolveBundle` instead of preparing bundle rendering by
  calling the repository directly.
  - Depends on (added): `skills:resolve-bundle`
  - Depends on (removed): none

- `plugin-agent-opencode:plugin-agent`: change the install contract so Open Code
  resolves skill bundles through `ResolveBundle` instead of preparing bundle
  rendering by calling the repository directly.
  - Depends on (added): `skills:resolve-bundle`
  - Depends on (removed): none

- `plugin-agent-standard:plugin-agent`: change the install contract so the standard
  agent plugin resolves skill bundles through `ResolveBundle` instead of preparing
  bundle rendering by calling the repository directly.
  - Depends on (added): `skills:resolve-bundle`
  - Depends on (removed): none

## Impact

Affected code areas are the `skills` application use case layer and the five
plugin install adapters:

- `packages/skills/src/application/use-cases/resolve-bundle.ts`
- `packages/plugin-agent-*/src/application/use-cases/install-skills.ts`
- matching install tests in each plugin package

The change should reduce duplication in plugin install flows and make future
template-context defaults less fragile. No new external dependency is expected.

## Technical context

The issue was discovered after the capability-aware template archive: installed
skills still contained `@{{sharedFolder}}/shared.md`.

Code investigation showed:

- `ResolveBundle.execute(...)` injects built-in safe values, including the default
  relative `sharedFolder`
- `SkillRepository.getBundle(...)` only renders the context it receives
- all five plugin `InstallSkills` flows were calling `getBundle(...)` directly

A temporary implementation fix forced plugins to always pass the resolved default
`sharedFolder` into the repository call, but that was treated as a stopgap. The
agreed direction is to remove the split path and make `ResolveBundle` the canonical
install-time boundary.

## Open questions

None blocking at proposal level. The exact wiring details inside plugin install
use cases and whether any plugin-local helpers become redundant can be settled in
`design.md`.
