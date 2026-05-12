# Proposal: context-display-mode-config

## Motivation

The compiled spec context currently hardcodes a tiered `lazy`/`full` presentation model that is not expressive enough for different agent and reviewer needs. This change is needed now because users want to choose whether context is emitted as a bare list, a summary catalogue, full content, or the current hybrid tiered output without changing the underlying spec-selection rules.

## Current behaviour

Today `CompileContext` accepts only `contextMode: 'lazy' | 'full'`. In `lazy` mode, `change.specIds` are always seeded into the context and rendered in full, while other collected specs are rendered as summaries; the CLI text output then tells the reader to use `specd spec show <spec-id>` for full content. This does not let the user choose a list-only or summary-first presentation, does not separate direct change-spec inclusion from dependency traversal, and makes the display policy too tightly coupled to the current tier implementation.

In addition, there are still legacy `lazy`/tier statements in related specs and verify scenarios that now conflict with the intended model (`list|summary|full|hybrid`). This change also cleans those residual references so the spec set is internally consistent.

## Proposed solution

Reuse the existing project-level `contextMode` config to support explicit display modes `list`, `summary`, `full`, and `hybrid`, with `summary` as the new default across all context commands (`change context`, `project context`, and `spec context`). The legacy `lazy` value disappears rather than being kept as an alias or fallback. Add `--include-change-specs` to `specd change context`, defaulting to `false`, so direct inclusion of `change.specIds` can be enabled or disabled independently of `dependsOn` traversal and include-pattern matching. When `--include-change-specs=false`, only the direct change-spec seed is suppressed; the same specs may still appear if selected by include patterns or dependency traversal. Update compiled-context rendering and CLI text output so non-full entries are clearly labeled as lists or summaries and direct users to `specd change spec-preview <change-name> <specId>` when they need the merged full spec for a change-scoped spec. Section flags such as `--rules`, `--constraints`, and scenario filtering continue to apply only when a spec is being rendered with full content; in `list` and `summary` modes they have no effect and the output remains list/summary shaped regardless of the requested section filters.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/compile-context`: replace the current `lazy|full` tier-classification rules with configurable `list|summary|full|hybrid` display modes, and stop treating direct `change.specIds` inclusion as an unconditional seed when the caller does not request it.
  - Depends on (added): none

- `core:core/config`: redefine `contextMode` so the accepted values and default match the new display modes while keeping it project-level only.
  - Depends on (added): none

- `cli:cli/change-context`: add `--include-change-specs`, map CLI flags onto the updated compile-context inputs, and update text rendering/instructions so non-full entries are labeled explicitly and the user is directed to `specd change spec-preview <change-name> <specId>` for full merged content.
  - Depends on (added): `cli:cli/change-spec-preview`

- `core:core/get-project-context`: apply `contextMode` to project-level context compilation instead of always returning full-mode specs, and remove old wording that ties project context behavior to `lazy` tier classification.
  - Depends on (added): none

- `core:core/get-spec-context`: apply `contextMode` to single-spec context output so `spec context` can emit list, summary, or full-shaped entries consistently with other context commands.
  - Depends on (added): `core:core/config`, `core:core/compile-context`

- `cli:cli/project-context`: map config-driven context modes into `specd project context` output and preserve section-filter behavior only for full-mode entries.
  - Depends on (added): none

- `cli:cli/spec-context`: map config-driven context modes into `specd spec context` output and preserve section-filter behavior only for full-mode entries.
  - Depends on (added): `core:core/config`, `core:core/get-spec-context`

`cli:cli/change-context` and `core:core/get-project-context` verify/spec artifacts also receive cleanup of remaining `lazy`/tier-era phrasing to keep scenarios aligned with the new mode semantics.

## Impact

Affected code areas are concentrated in:

- `packages/core/src/application/use-cases/compile-context.ts` for collection, classification, and emitted `ContextSpecEntry` behavior
- `packages/core/src/application/use-cases/get-project-context.ts` and `packages/core/src/application/use-cases/get-spec-context.ts` for applying the same display modes outside change-scoped context
- `packages/core/src/application/specd-config.ts` and `packages/core/src/infrastructure/fs/config-loader.ts` for config typing and validation of `contextMode`
- `packages/cli/src/commands/change/context.ts`, `packages/cli/src/commands/project/context.ts`, and the spec-context command implementation for flag parsing, config construction, and text output rendering
- `packages/cli/test/commands/change-context.spec.ts`, `packages/cli/test/commands/project-context.spec.ts`, `packages/cli/test/commands/spec-context.spec.ts`, and related core tests covering config loading and context-mode semantics

`CompileContext` is a CRITICAL hotspot in the code graph with downstream impact across core context helpers and CLI consumers, so the spec and verify artifacts need to keep behaviour boundaries explicit to avoid accidental regressions in context compilation and rendering.

There is also workflow impact: `core:core/config` is already in scope for the active change `plugin-system-phase-1`, so this change will need to stay precise about the `contextMode` delta to avoid overlapping spec edits unnecessarily.

## Technical context

The current implementation and specs line up around a narrow model:

- `CompileContextConfig` and `SpecdConfig` currently type `contextMode` as `'full' | 'lazy'`
- `config-loader` currently validates `contextMode` with `z.enum(['full', 'lazy'])`
- `CompileContext` currently derives `mode` with logic equivalent to `contextMode === 'lazy' && source !== 'specIds' ? 'summary' : 'full'`
- `cli change context` currently tells readers to use `specd spec show <spec-id>` for full content of summary entries
- `specd change spec-preview` already exists and is the correct change-scoped way to inspect merged spec content

The user explicitly asked to reuse the existing context-mode setting rather than introducing a second config knob, to preserve section filters such as `--rules` and `--constraints`, and to keep direct change-spec inclusion independent from `dependsOn`. The user clarified that section-filter flags must not change the emitted shape in `list` or `summary` modes: those modes still output lists or summaries even if flags such as `--rules` or `--constraints` are passed, because there is no full spec body to filter there. The user also decided that there is no fallback or alias for `lazy`; once this change lands, `lazy` is removed from the accepted config values.

The user resolved the remaining scope questions:

- The new display modes apply to all context commands, including `specd change context`, `specd project context`, and `specd spec context`.
- `--include-change-specs=false` suppresses only the direct `change.specIds` seed; if one of those specs is selected later by include patterns or dependency traversal, it is included normally.

## Open questions

_none_
