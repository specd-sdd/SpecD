# Exploration: delta-visibility

Generated: 2026-03-26

## Problem statement

When working on an active change that modifies existing specs via deltas, the canonical
spec remains unchanged until archive. This means agents and humans reading specs during
implementation see stale content -- the spec doesn't reflect the changes being implemented.
`CompileContext` provides the base spec content but never the merged result with deltas
applied.

Source: GitHub issue lsmonki/SpecD#21 ("feat: delta visibility before archive").

## Scope

This change covers **Level 1 and Level 2 only** from issue #21:

- **Level 1 -- Materialized view in CompileContext**: When compiling context for an active
  change with delta artifacts, include the merged spec content (base + delta applied)
  instead of just the base spec. Read-only, zero mutation risk.
- **Level 2 -- Explicit preview command**: A CLI command to inspect the merged result:
  `specd spec preview <spec-path> --change <change-name>` with optional `--diff` mode.

**Level 3 (spec-sync)** is explicitly out of scope -- it requires issue #22 (delta
baselines) and involves canonical spec mutation.

## Verified current state (2026-03-26)

### CompileContext (`core:core/compile-context`)

- **File:** `packages/core/src/application/use-cases/compile-context.ts` (691 lines)
- **Composition:** `packages/core/src/composition/use-cases/compile-context.ts`
- **Spec:** `specs/core/compile-context/spec.md`

Current behavior: reads specs from `SpecRepository` (the canonical spec). Does NOT
interact with deltas at all. The spec explicitly says: "Artifact instructions, rules,
and delta context are NOT part of the result -- they are retrieved via
`GetArtifactInstruction`."

For Level 1, `CompileContext` needs to:

1. Know which specs in the change have delta artifacts
2. Load the base spec content from `SpecRepository`
3. Load the delta file from the change directory
4. Apply the delta using `ArtifactParser.apply(baseAst, deltaEntries)`
5. Serialize the merged result
6. Use the merged content instead of the base content in the `specs` array
7. If delta application fails, fall back to base content with a warning

Key interfaces already in the code:

- `CompileContextResult.specs: ContextSpecEntry[]` -- each entry has `content?: string`
- The use case already has `ArtifactParserRegistry` injected (for metadata extraction fallback)
- It also has `ChangeRepository` (to load the change and its delta files)

### ValidateArtifacts (`core:core/validate-artifacts`)

- **File:** `packages/core/src/application/use-cases/validate-artifacts.ts`
- **Spec:** `specs/core/validate-artifacts/spec.md`

Already does delta merge internally for validation ("Delta application preview and
conflict detection"). The pattern is:

1. Load base artifact from `SpecRepository`
2. Parse delta file
3. Call `parser.apply(baseAst, deltaEntries)`
4. Check for conflicts in the result
5. Discard the merged result (only used for validation)

This is the pattern Level 1 should follow -- but instead of discarding the result,
serialize it and include it in the context output.

### ArtifactParser apply method

Multiple format-specific parsers implement `apply()`:

- `markdown-parser.ts:391` -- `apply(ast, delta)` returns new AST with deltas applied
- `plaintext-parser.ts:46`
- `json-parser.ts:159`
- `yaml-parser.ts:350`

The `ArtifactParserRegistry` port provides `get(format)` to retrieve the right parser.

### No existing preview functionality

Graph search for "preview" returned zero spec matches. There is no existing preview
command or use case. This will be entirely new code.

## Specs in the change

1. **`core:core/compile-context`** (existing, delta) -- modify to include merged spec
   content when a change has deltas for a spec
2. **`core:core/preview-spec`** (new) -- use case that loads a base spec, applies deltas
   from a named change, and returns the merged result
3. **`cli:cli/spec-preview`** (new) -- CLI command wrapping the preview use case

## Dependencies registered

- `core:core/compile-context` depends on: `core:core/delta-format`, `core:core/artifact-parser-port`
- `core:core/preview-spec` depends on: `core:core/compile-context`, `core:core/delta-format`,
  `core:core/validate-artifacts`, `core:core/artifact-parser-port`
- `cli:cli/spec-preview` depends on: `core:core/preview-spec`

## Key codebase observations

- `CompileContext` already has all the ports it needs (`ArtifactParserRegistry`,
  `ChangeRepository`, `SpecRepository`) -- no new constructor dependencies required
- The `ChangeRepository` likely provides access to delta files (used by `ValidateArtifacts`)
- The `inferFormat()` function determines which parser to use for a given filename
- `change.specIds` tells you which specs are in the change
- The schema's `artifacts()` method returns artifact type definitions including `delta: true`
  and the output filename pattern
- `ContextSpecEntry` already has an optional `content` field -- the merged content can
  replace the base content in full mode

## Design decisions confirmed

- Both levels are read-only operations -- no canonical spec mutation
- Level 1 modifies `CompileContext` to merge deltas into spec content before returning
- Level 2 is a standalone use case + CLI command for on-demand preview
- `ValidateArtifacts` is not modified -- only used as reference for the merge pattern
- `cli:cli/change-context` is not modified -- it's a passthrough that will automatically
  surface the merged content from `CompileContext`
- If delta application fails at context compilation time, fall back to base content
  with a warning (context must always compile successfully)

## Open questions for design phase

- Should `ContextSpecEntry` indicate whether the content is merged or base? (e.g. a
  `merged: boolean` field or a note in the content header)
- For Level 2, what format should `--diff` output use? (unified diff? side-by-side?)
- Should `preview-spec` validate the delta before applying, or just apply it? (The
  delta may not have been validated yet if we're in `designing` state)
- Should the preview command work for specs NOT in the change's specIds? (e.g. preview
  any spec with any change's deltas)
- How should `CompileContext` handle `scope: change` artifacts vs `scope: spec` artifacts
  for the merge? (Only `scope: spec` artifacts have per-spec deltas)

## User context

- User referenced the GitHub issue directly and wants levels 1 and 2 done
- User reminded us to verify against actual code, not trust the issue blindly ("puede
  que el issue este desactualizado")
- User prefers using specd graph commands over Explore agents for codebase investigation
