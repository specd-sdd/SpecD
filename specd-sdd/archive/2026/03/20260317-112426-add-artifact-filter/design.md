# Design: Add --artifact filter to change validate

## Affected areas

### Core — `ValidateArtifacts` use case

**`packages/core/src/application/use-cases/validate-artifacts.ts`**

- **`ValidateArtifactsInput` (line 29):** Add optional `artifactId?: string` field.
- **`ValidateArtifacts.execute` (line 126):** After loading the schema (line 134), add an early guard: if `input.artifactId` is provided but doesn't match any artifact in `schema.artifacts()`, return `{ passed: false, failures: [{ artifactId: input.artifactId, description: '...' }], warnings: [] }` — no throw.
- **Required artifacts check (line 150):** Wrap in `if (input.artifactId === undefined)` so the full-set completeness check is skipped when filtering.
- **Per-artifact loop (line 200):** When `input.artifactId` is defined, skip any `artifactType` whose `id !== input.artifactId`. The approval invalidation check (line 159) runs unconditionally — it is unrelated to which artifacts are being validated.

No new ports, no constructor changes, no new dependencies.

### Core — Composition factory

**`packages/core/src/composition/use-cases/validate-artifacts.ts`**

No changes. The factory constructs `ValidateArtifacts` — the new optional field on `ValidateArtifactsInput` is pass-through and requires no wiring changes.

### CLI — `change validate` command

**`packages/cli/src/commands/change/validate.ts`**

- **Command definition (line 14):** Add `.option('--artifact <artifactId>', 'validate only this artifact')`.
- **Action handler (line 19):** Read `opts.artifact`, pass it as `artifactId` in the `execute` call (line 27–29).
- **Output:** No changes — the existing result rendering (text/json) already handles any mix of failures/warnings.

### Tests

**`packages/core/test/application/use-cases/validate-artifacts.spec.ts`**

New test cases:

1. Unknown `artifactId` → `passed: false` with descriptive failure, no throw.
2. Valid `artifactId` → only that artifact validated; others ignored.
3. `artifactId` with unsatisfied dependency → reported as dependency-blocked.
4. `artifactId` with satisfied dependencies → validated normally, `markComplete` called.
5. `artifactId` provided → required-artifacts check skipped (missing non-optional artifact not reported).

No new test file — extend the existing spec file.

## Approach

1. **Core use case first.** Modify `ValidateArtifactsInput` to add `artifactId`. Add the unknown-ID early return. Gate the required-artifacts check. Add a `continue` guard at the top of the per-artifact loop when filtering. This is a minimal diff — three `if` blocks.

2. **CLI command second.** Add the `--artifact` option and thread it through to `execute`. One line for the option, one property in the input object.

3. **Tests last.** Add five scenarios to the existing test file, covering the verify scenarios from the delta.

## Key decisions

- **No new error class for unknown artifact ID.** The spec requires a validation failure (not a throw), so returning `{ passed: false, failures: [...] }` is the correct pattern. Adding an error class would be unnecessary indirection.
- **Approval invalidation runs unconditionally.** Even when filtering to a single artifact, approval hashes should still be checked for all artifacts. This prevents stale approvals from surviving a validate call. The spec does not restrict this behaviour and it matches the existing pattern.
- **Filter applied at loop level, not at schema level.** Rather than creating a filtered schema or filtered artifact list, the filter is a simple `continue` in the existing loop. This minimises the diff and avoids creating new abstractions.

## Trade-offs

- **No partial result shape.** When `artifactId` is provided, the result still uses the same `ValidateArtifactsResult` type. The caller cannot distinguish "one artifact checked, rest ignored" from "one artifact failed, rest passed" by structure alone — only by the failures array content. This is acceptable because the caller knows whether they passed `artifactId`.

## Open questions

None.
