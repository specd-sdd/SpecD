# Tasks: compact-and-complete-outlines

## 1. Keep compact artifact-instruction contract

- [x] 1.1 Preserve `availableOutlines` payload shape in core use case
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`: keep `delta.availableOutlines: string[]` and no inline outlines
      Approach: verify no regressions while extending `specs outline` behavior
      (Req: core:get-artifact-instruction Result shape, Instruction resolution)

- [x] 1.2 Preserve CLI artifact-instruction rendering contract
      `packages/cli/src/commands/change/artifact-instruction.ts` and tests
      Approach: keep text/json/toon output stable and explicit on `availableOutlines`
      (Req: cli:change-artifact-instruction JSON output format)

## 2. Implement mode-aware outline retrieval

- [x] 2.1 Add `--full` and `--hints` flags to `specs outline` command
      `packages/cli/src/commands/spec/outline.ts`
      Approach: parse flags and pass mode intent to use case input
      (Req: cli:spec-outline Command Interface)

- [x] 2.2 Extend `GetSpecOutline` input/result for modes and root-level hints
      `packages/core/src/application/use-cases/get-spec-outline.ts`
      Approach: support compact default vs full families and optional `selectorHints` metadata at result root
      (Req: core:get-spec-outline Outline Generation, Result)

- [x] 2.3 Keep parser default subsets aligned with historical behavior
      `packages/core/src/infrastructure/artifact-parser/{markdown-parser.ts,json-parser.ts,yaml-parser.ts,plaintext-parser.ts}`
      Approach: ensure default outlines remain: - markdown `section` - json `property`, `array-item` - yaml `pair` - plaintext `paragraph`
      (Req: core:artifact-parser-port Outline contract)

- [x] 2.4 Remove per-node hint dependency from parser contract
      `packages/core/src/application/ports/artifact-parser.ts` and downstream callers/tests
      Approach: keep `OutlineEntry` structural; emit hint schema at use-case/command response root
      (Req: core:artifact-parser-port Supporting type shapes)

## 3. Add tests for default/full/hints behavior

- [x] 3.1 Update use-case tests
      `packages/core/test/application/use-cases/get-spec-outline.spec.ts`
      Approach: assert default compact subset, full mode coverage, and root-level hint placeholders
      (Req: core:get-spec-outline Result)

- [x] 3.2 Update parser adapter tests
      `packages/core/test/infrastructure/artifact-parser/{markdown-parser.spec.ts,json-parser.spec.ts,yaml-parser.spec.ts,plaintext-parser.spec.ts}`
      Approach: assert compact default outputs remain stable
      (Req: core:artifact-parser-port Outline contract)

- [x] 3.3 Update CLI command tests
      `packages/cli/test/commands/spec-outline.spec.ts` and `packages/cli/test/commands/change-artifact-instruction.spec.ts`
      Approach: assert `--full`, `--hints`, and unchanged compact `availableOutlines` flow
      (Req: cli:spec-outline, cli:change-artifact-instruction)

## 4. Docs, skills, and quality gates

- [x] 4.1 Update CLI docs and workflow guidance
      `docs/cli/*spec-outline*`, `.codex/skills/_specd-shared/shared.md`, `.codex/skills/specd-design/SKILL.md`
      Approach: document default/full/hints behavior and canonical on-demand usage
      (Req: default:\_global/docs, skills:workflow-automation)

- [x] 4.2 Run targeted and package-level checks
      `packages/core` and `packages/cli` tests, plus lint and typecheck
      Approach: execute focused tests first, then broader quality gates
      (Req: default:\_global/testing, default:\_global/eslint)

- [x] 4.3 Manual E2E command checks
      `node packages/cli/dist/index.js specs outline <specId> --artifact specs --format json`
      `node packages/cli/dist/index.js specs outline <specId> --artifact specs --full --format json`
      `node packages/cli/dist/index.js specs outline <specId> --artifact specs --hints --format json`
      `node packages/cli/dist/index.js changes artifact-instruction <change> specs --format json`
      Approach: verify compact default + explicit full/hints expansion + compact instruction payload
      (Req: cli:spec-outline, cli:change-artifact-instruction)
