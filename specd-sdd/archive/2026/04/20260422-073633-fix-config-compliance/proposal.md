# Proposal: fix-config-compliance

## Motivation

The config system is out of compliance with its own spec. A compliance audit found 5 issues across the 20 requirements in `specs/core/config/spec.md`: one stale field (`artifactRules`) that the spec explicitly says was removed but code still accepts, one field (`skills`) that has been replaced by the plugin system and should be removed from the spec, one field (`plugins`) that the spec requires but the config loader does not validate, and a port signature mismatch (`ConfigWriter.addPlugin`). Additionally, there are warnings for missing error specificity (R5), missing tests (R2), unenforced derived directories (R8), and silent unknown template variables (R9).

## Current behaviour

- `artifactRules` is accepted by the Zod schema (`config-loader.ts:222`), stored in `SpecdConfig` (`specd-config.ts:146`), and displayed by `config show` — but `specs/core/config-loader/spec.md` says "loader MUST NOT accept artifactRules" and `specs/core/composition/spec.md` says it is "no longer part of SpecdConfig". The field was replaced by `schemaOverrides` but never removed from code.
- `plugins` is declared in `specd.yaml` and the spec requires it, but the config loader's Zod schema does not include it. `ConfigWriter` reads/writes `plugins` directly from YAML, bypassing validation. The config loader must validate `plugins` at load time like every other field.
- `skills` manifest was specified as a config field (R17) but has been superseded by the plugin system — skills are now installed via plugins. The `skills` requirement should be removed from the spec, not implemented.
- `ConfigWriter.addPlugin` accepts an optional `config?` parameter that the spec's method signature does not include (R19).
- **R5**: When `contextMode` appears inside a workspace entry, Zod's `.strict()` rejects it with a generic "unrecognized keys" message instead of the specific message the spec requires ("contextMode is not valid inside a workspace").
- **R2**: No test verifies that an invalid `specd.local.yaml` (missing required fields) produces a validation error.
- **R8**: Derived directories (`{configPath}/graph`, `{configPath}/tmp`, `{configPath}/tmp/change-locks`) are documented in the spec but not created or validated by the config loader.
- **R9**: The template expander leaves unknown `{{...}}` variables as-is silently, but the spec says "a warning is emitted".

## Proposed solution

Remove the dead `artifactRules` and `skills` fields from code, spec, and docs. Add `plugins` to the config loader's Zod schema so it is validated at load time. Align the `ConfigWriter` port with the implementation by updating the spec to include the `config` parameter. Fix the R5 error message to be spec-specific. Add a warning for unknown template variables (R9). Ensure derived directories are created (R8). Add missing test coverage for local config validation (R2).

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/config`: remove the `artifactRules` and `Skills manifest` requirements, update `plugins` requirement to specify validation at config-load time, update `ConfigWriter.addPlugin` signature to include optional `config` parameter, add specific error message for `contextMode` in workspace, add warning for unknown template variables, add derived directory creation
  - Depends on (added): `core:core/template-variables`
- `cli:cli/config-show`: remove `artifactRules` from the text output format
  - Depends on (added): none
- `core:core/template-variables`: add optional warning callback to `TemplateExpander` for unknown variables, update constraint from "never removed or errored" to allow warnings
  - Depends on (added): none
- `core:core/config-writer-port`: update `addPlugin` signature to include optional `config` parameter
  - Depends on (added): none

## Impact

- **packages/core/src/infrastructure/fs/config-loader.ts** — remove `artifactRules` from Zod schema and extraction, add `plugins` to Zod schema with validation, add specific error message for `contextMode` in workspace
- **packages/core/src/application/specd-config.ts** — remove `artifactRules` field, add `plugins` field
- **packages/core/src/application/ports/config-writer.ts** — update `addPlugin` signature in spec (or code)
- **packages/core/src/domain/services/template-expander.ts** — emit warning for unknown template variables
- **packages/cli/src/commands/config/show.ts** — remove `artifactRules` display, add `plugins` display
- **specs/cli/config-show/** — delta to remove artifactRules from text output spec
- **docs/config/** — remove `artifactRules` documentation
- **docs/guide/configuration.md** — remove `artifactRules` section
- **packages/core/test/infrastructure/fs/config-loader.spec.ts** — add tests for: local config standalone validation (R2), contextMode workspace error message (R5), schemaPlugins parsing (R10), schemaOverrides parsing (R11), approvals parsing (R15), llmOptimizedContext parsing (R16)
- **packages/core/test/domain/services/template-expander.spec.ts** — add test for unknown variable warning (R9)

## Technical context

The compliance report (`specs-compliance-config-20260422-081822.md`) identifies issues across all severity levels:

### Critical

1. **R17 — skills manifest (NOT_IMPLEMENTED → REMOVE)**: The `skills` requirement is obsolete — skills have been superseded by the plugin system. Remove the requirement from the spec entirely.

2. **R18 — plugins (DIVERGENT)**: `plugins` is not in the Zod schema. ConfigWriter reads it directly from YAML. Bringing it into the schema unifies validation and catches structural errors early.

3. **R19 — ConfigWriter port (DIVERGENT)**: `addPlugin` has an extra `config?` parameter. The spec's own YAML examples show plugin entries with `config`, so the code is correct — the spec should be updated.

4. **R5 — Workspace graph config**: Zod's `.strict()` rejects `contextMode` inside workspace entries with a generic error. Need a `.refine()` or `.transform()` that produces the spec-specific message: "contextMode is not valid inside a workspace".

### Warnings

5. **R2 — Local config override**: Missing test only — the behaviour works correctly. Add a test case that loads a `specd.local.yaml` missing the `schema` field and asserts a validation error.

6. **R9 — Template variables**: `TemplateExpander._replace` silently leaves unknown variables as-is. Add a warning callback or console.warn when a `{{...}}` token does not match any registered namespace.key.

### Missing test coverage

8. **R10 — Schema plugins parsing**: No test verifies that `schemaPlugins` is correctly parsed and stored on `SpecdConfig`.

9. **R11 — Schema overrides parsing**: No test verifies that `schemaOverrides` is correctly parsed and stored on `SpecdConfig`.

10. **R15 — Approvals parsing**: No test verifies that the `approvals` section with `spec` and `signoff` booleans is correctly parsed.

11. **R16 — LLM optimization parsing**: No test verifies `llmOptimizedContext` boolean parsing and non-boolean rejection.

### Stale field

8. **artifactRules**: Not in the compliance report as a separate finding because the spec already says it was removed, but the code still accepts it. Straightforward removal from Zod schema, SpecdConfig, CLI, and docs.

## Open questions

_none_

## Decisions

- **artifactRules**: complete removal, not deprecation. Eliminate from Zod schema, `SpecdConfig` interface, CLI `config show`, docs, and any other consumer. No migration path — `schemaOverrides` already covers its use cases.
- **skills manifest**: complete removal from the spec. Skills have been replaced by the plugin system — the R17 requirement is obsolete and should not be implemented.
- **plugins in config loader**: the config loader MUST validate the `plugins` field at load time, like every other field. The current bypass via ConfigWriter is the bug, not the design.
- **R5 error message**: use Zod `.refine()` to produce the spec-specific error message instead of relying on the generic strict mode message.
- **R8 derived directories**: create them as part of config loading/resolution, not as a separate init step.
- **R9 unknown variables**: emit a warning (not an error) — the spec says "a warning is emitted", processing continues.
