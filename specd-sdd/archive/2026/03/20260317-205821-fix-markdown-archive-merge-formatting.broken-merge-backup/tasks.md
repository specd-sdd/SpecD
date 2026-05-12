## 1. Preserve markdown inline metadata through delta apply

- [x] 1.1 Keep adapter metadata when cloning AST nodes
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`:
      `deepCloneNode()` — preserve metadata needed for markdown round-trip fidelity
      (Req: core:core/delta-format / Requirement: Delta application)
- [x] 1.2 Preserve metadata when replacing children during updates
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`:
      `setChildren()` and update helpers — avoid dropping representable inline/list style metadata
      (Req: core:core/delta-format / Requirement: Delta application)
- [x] 1.3 Add regression tests for untouched-node inline fidelity
      `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`:
      add scenario where modified delta on one section does not strip backticks/emphasis in untouched nodes
      (Req: core:core/delta-format / Requirement: Delta application)

## 2. Add style-aware markdown serialization

- [x] 2.1 Detect markdown style profile from source content
      `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts`:
      parse flow helpers — detect unambiguous list/emphasis/strong markers and mixed-style ambiguity
      (Req: core:core/artifact-parser-port / Requirement: Serialize round-trip)
- [x] 2.2 Serialize markdown with explicit style options
      `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts`:
      `serialize()` and `renderSubtree()` — pass `toMarkdown` options from detected style profile
      (Req: core:core/artifact-parser-port / Requirement: Serialize round-trip)
- [x] 2.3 Implement deterministic fallback for ambiguous style
      `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts`:
      fallback selection logic — apply project markdown conventions when mixed markers are detected
      (Req: core:core/artifact-ast / Requirement: Round-trip fidelity)
- [x] 2.4 Add parser-level style regression coverage
      `packages/core/test/infrastructure/artifact-parser/markdown-parser.spec.ts`:
      tests for preserving source style when unambiguous and deterministic output when mixed
      (Req: core:core/artifact-ast / Requirement: Round-trip fidelity)

## 3. Validate archive merge behavior end-to-end

- [x] 3.1 Add archive merge regression for untouched inline formatting
      `packages/core/test/application/use-cases/archive-change.spec.ts`:
      assert archive merge keeps inline code/backticks in untouched sections
      (Req: core:core/archive-change / Requirement: Delta merge and spec sync)
- [x] 3.2 Add archive merge regression for mixed-style determinism
      `packages/core/test/application/use-cases/archive-change.spec.ts`:
      assert mixed input serializes with deterministic project conventions
      (Req: core:core/archive-change / Requirement: Delta merge and spec sync)

## 4. Run validation suite and finalize

- [x] 4.1 Run targeted parser and archive tests
      `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`,
      `packages/core/test/infrastructure/artifact-parser/markdown-parser.spec.ts`,
      `packages/core/test/application/use-cases/archive-change.spec.ts`:
      verify new regressions pass
      (Req: all updated verify scenarios)
- [x] 4.2 Run package test suite for core
      `pnpm --filter @specd/core test`:
      ensure no regressions outside touched modules
      (Req: all updated verify scenarios)
