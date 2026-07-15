# Spec Compliance Audit

- Mode: `change`
- Change: `move-diff-to-core`
- Timestamp: `20260715-162045`
- Scope:
  - `core:preview-spec`
  - `cli:change-spec-preview`
  - `core:diff-generator`
  - Relevant global specs reviewed for constraints:
    - `default:_global/architecture`
    - `default:_global/conventions`
    - `default:_global/docs`
    - `default:_global/eslint`
    - `default:_global/testing`

## Summary

No compliance findings were identified in the audited scope.

The implementation remains aligned with the merged change specs:

- `PreviewSpec` now depends on a `DiffGenerator` application port and generates optional diff output only when `includeDiff` is requested.
- The default diff implementation is owned by core composition, while the concrete library remains encapsulated in core infrastructure.
- The CLI adapter delegates diff generation to core and limits itself to artifact filtering, warning presentation, and text colorization.

## Evidence

### `core:preview-spec`

- Constructor wiring matches the spec contract in `packages/core/src/application/use-cases/preview-spec.ts`.
- `includeDiff` is opt-in and only triggers diff generation for entries with `status: 'merged'`.
- New files pass `base: ''` to the diff generator when `base` is `null`.
- Diff failures append warnings without discarding merged preview results.
- File ordering keeps `spec.md` first, then sorts alphabetically.

Test evidence:

- `packages/core/test/application/use-cases/preview-spec.spec.ts`
- `packages/core/test/composition/use-cases/preview-spec.spec.ts`

### `core:diff-generator`

- The port is declared in `packages/core/src/application/ports/diff-generator.ts`.
- The default implementation lives in `packages/core/src/infrastructure/diff/diff-generator.ts`.
- `packages/core/src/composition/diff-generator.ts` provides the default factory, keeping the library choice out of callers and use cases.
- The implementation returns plain unified diff text with labels `a/<filename> (base)` and `b/<filename> (merged)`.
- Default context is 3 lines via `input.contextLines ?? 3`.

Test evidence:

- `packages/core/test/infrastructure/diff/diff-generator.spec.ts`
- `packages/core/test/composition/diff-generator.spec.ts`

### `cli:change-spec-preview`

- The command requests `includeDiff: true` only when `--diff` is passed.
- It renders the returned `diff` field and does not synthesize diffs locally.
- Artifact filtering still resolves schema artifact IDs to filenames and enforces scope/error behavior.
- ANSI colorization remains CLI-only and only for text output.
- `@specd/cli` no longer depends on the diff library; `diff` moved to `@specd/core`.

Test evidence:

- `packages/cli/test/commands/change/spec-preview.spec.ts`

## Global Constraint Review

- Architecture: compliant. The port lives in application, the concrete adapter in infrastructure, and default wiring in composition.
- Conventions/docs: compliant. Naming, exports, ESM imports, and JSDoc shape are consistent with repo conventions.
- Testing: compliant. Unit coverage exists for use case, composition, infrastructure, and CLI adapter behavior.
- ESLint/typecheck: compliant through successful `pnpm lint` and `pnpm typecheck` hook execution.

## Verification Signals

- `pnpm test`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- Manual smoke previously exercised:
  - `node packages/cli/dist/index.js changes spec-preview move-diff-to-core core:preview-spec --artifact specs`
  - `node packages/cli/dist/index.js changes spec-preview move-diff-to-core core:preview-spec --diff`
  - `node packages/cli/dist/index.js changes spec-preview move-diff-to-core core:preview-spec --diff --format json`

## Residual Risk

Low. The main remaining risk is future SDK surface expectations around what is exported from core, but the current implementation is coherent with the spec intent: the use case can accept a custom `DiffGenerator`, while the default concrete implementation remains an internal composition concern.
