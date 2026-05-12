# Design: fix-markdown-archive-merge-formatting

## Affected areas

- `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`
  Preserve markdown adapter metadata needed for round-trip fidelity during deep clone/update paths. The current underscore-field stripping drops `_inlines` and causes inline formatting loss after delta application.
- `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts`
  Add style-profile detection from source markdown and pass explicit `toMarkdown` options (`bullet`, `emphasis`, `strong`; potentially related options) for deterministic serialization.
- `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts` (parse/apply/serialize flow)
  Ensure style profile survives delta-apply workflows so untouched nodes keep representable inline/list formatting.
- `packages/core/src/application/use-cases/archive-change.ts`
  No algorithmic changes expected; behavior changes transitively through `ArtifactParser.apply/serialize` in archive merge.
- `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`
  Add regression coverage proving markdown metadata required for untouched inline formatting is preserved through delta apply.
- `packages/core/test/infrastructure/artifact-parser/markdown-parser.spec.ts`
  Add regression coverage for style-aware serialization (source style preserved when unambiguous; deterministic fallback when mixed).
- `packages/core/test/application/use-cases/archive-change.spec.ts`
  Add/adjust integration-level assertions for archive merge output to prevent backtick stripping and unexpected list-marker rewrites.

## Approach

1. Fix metadata preservation in delta application:
   - update clone/update helpers to preserve adapter metadata needed for round-trip fidelity, at least for markdown inline structures.
   - keep delta semantics unchanged (selector resolution and op ordering remain the same).
2. Introduce markdown style profile handling:
   - detect style preferences from original markdown content at parse time (or first serialization context).
   - store style metadata in AST-compatible form so it is available during later serialize calls.
3. Serialize with explicit style options:
   - call `toMarkdown` with detected options when style is unambiguous.
   - when mixed/ambiguous, apply deterministic project convention values (MarkdownLint-aligned defaults).
4. Verify with focused regressions:
   - parser-level regression for inline/backtick preservation in untouched nodes.
   - parser-level regression for list/emphasis style selection and fallback.
   - archive use-case regression to ensure end-to-end behavior in `change archive` flow.

## Key decisions

- Preserve adapter metadata in AST operations instead of reconstructing from plain text.
  Rationale: reconstructing inlines from string content is lossy and caused the current bug.
- Keep style detection inside markdown parser adapter boundaries.
  Rationale: style selection is format-specific and should not leak into application/use-case layers.
- Use deterministic fallback when style is mixed.
  Rationale: mixed input cannot preserve one “original” style consistently; deterministic output avoids nondeterministic diffs.

## Trade-offs

- Preserving adapter metadata increases AST payload size slightly.
  Mitigation: metadata remains internal to parser adapter and only for fields needed for fidelity.
- Deterministic fallback may re-style some mixed documents.
  Mitigation: constrain fallback to ambiguous constructs only and keep behavior stable across runs.

## Open questions

- Final fallback convention values for ambiguous constructs:
  - unordered bullet default (`-` vs `*`),
  - emphasis/strong marker defaults (`*` vs `_`).
- Scope of preserved metadata in generic delta helper:
  - preserve all underscore-prefixed fields, or only an allowlist required by current adapters.

## Validation plan

- Run targeted unit tests:
  - `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`
  - `packages/core/test/infrastructure/artifact-parser/markdown-parser.spec.ts`
  - `packages/core/test/application/use-cases/archive-change.spec.ts`
- Run package test suite before transition to verifying:
  - `pnpm --filter @specd/core test`
