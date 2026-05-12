# Design: compact-and-complete-outlines

## Non-goals

- Changing lifecycle ordering or approval gates.
- Reverting `availableOutlines` compaction in `changes artifact-instruction`.
- Introducing parser-specific ad hoc CLI flags beyond `--full` and `--hints`.

## Affected areas

- `packages/cli/src/commands/spec/outline.ts`
  Change: add `--full` and `--hints` command options and pass them to `GetSpecOutline` input.
  Callers: end users and workflow skills invoking `specs outline` · Risk: MEDIUM.

- `packages/core/src/application/use-cases/get-spec-outline.ts`
  Change: support default/full mode behavior and optional root-level `selectorHints` metadata in result, sourced from parser contract.
  Callers: CLI command + tests · Risk: HIGH (contract change in output shape).

- `packages/core/src/application/ports/artifact-parser.ts`
  Change: keep `OutlineEntry` structural (`type`, `label`, `depth`, optional `children`) and add parser-owned selector hint contract for root-level response metadata.
  Callers: all parser adapters and tests · Risk: HIGH (shared contract).

- `packages/core/src/infrastructure/artifact-parser/{markdown-parser.ts,json-parser.ts,yaml-parser.ts,plaintext-parser.ts}`
  Change: preserve historical compact outline subset as default behavior:
  - markdown: `section`
  - json: `property`, `array-item`
  - yaml: `pair`
  - plaintext: `paragraph`
    Callers: `GetSpecOutline` + parser tests · Risk: HIGH.

- `packages/cli/src/commands/change/artifact-instruction.ts` and `packages/core/src/application/use-cases/get-artifact-instruction.ts`
  Change: keep compact `availableOutlines` flow unchanged, ensure examples/docs continue routing to on-demand `specs outline`.
  Callers: CLI users and skills · Risk: LOW.

- Tests:
  - `packages/core/test/application/use-cases/get-spec-outline.spec.ts`
  - `packages/core/test/infrastructure/artifact-parser/{markdown-parser.spec.ts,json-parser.spec.ts,yaml-parser.spec.ts,plaintext-parser.spec.ts}`
  - `packages/cli/test/commands/spec-outline.spec.ts`
  - `packages/cli/test/commands/change-artifact-instruction.spec.ts`
    Change: cover default subset, full mode, and root-level hint metadata placeholders.

- Documentation / skills:
  - `docs/cli/specs-outline.md` (or equivalent command reference)
  - `.codex/skills/_specd-shared/shared.md`
  - `.codex/skills/specd-design/SKILL.md`
    Change: document default/full/hints behavior and preserve canonical on-demand flow.

## New constructs

No new top-level modules. We add option and DTO shape extensions in existing command/use-case surfaces.

## Approach

1. Preserve the compact discovery flow.

- Keep `changes artifact-instruction` returning only `delta.availableOutlines: string[]`.
- Keep no inline outline trees in this payload.

2. Implement mode-aware outline retrieval.

- Extend `GetSpecOutline` input with mode flags (`full`, `hints`).
- Default mode returns compact historical subset per parser.
- Full mode returns all selector-addressable families.

3. Move hint guidance to response root.

- When `hints` is enabled, return `selectorHints` at result root keyed by node type.
- Hint values are placeholders: `"<value>"`, `"<contains>"`, `"<level>"`.
- Do not duplicate hint payload in each outline entry.

4. Keep parser outputs structural.

- `OutlineEntry` is structural only.
- Hint schema generation is owned by each parser through the parser port and exposed at response root by the use case.

5. Update CLI and docs.

- Add `--full`, `--hints` in `specs outline` CLI.
- Update command docs and workflow guidance for canonical use.

## Key decisions

- **Decision:** default outline remains historical compact subset.
  **Rationale:** lower noise and continuity with previously useful behavior.

- **Decision:** `--full` is explicit for exhaustive node-family coverage.
  **Rationale:** advanced users get completeness without burdening default output.

- **Decision:** `selectorHints` metadata is root-level and placeholder-based.
  **Rationale:** avoids repeated per-node verbosity while preserving selector guidance.

## Trade-offs

- [Two modes increase branch complexity] → Mitigation: centralized mode handling in `GetSpecOutline`, parser defaults unchanged where possible.
- [Output contract change for consumers expecting per-node hints] → Mitigation: tests and docs explicitly codify root-level hint contract.

## Spec impact

- `cli:cli/spec-outline`: adds command flags and mode semantics.
- `core:core/get-spec-outline`: adds mode-aware result behavior including optional root-level hint metadata.
- `core:core/artifact-parser-port`: keeps structural outline contract and decouples per-node hints.
- `core:core/delta-format`: aligns parser/delta guidance with compact default + full mode.

## Dependency map

```mermaid
graph LR
  CAI[changes artifact-instruction]
  GAI[GetArtifactInstruction]
  SO[specs outline CLI]
  GSO[GetSpecOutline]
  APP[ArtifactParser adapters]

  CAI --> GAI
  GAI -->|availableOutlines| SO
  SO --> GSO
  GSO --> APP
```

```
┌─────────────────────────────────────┐
│ changes artifact-instruction (CLI)  │
└──────────────────────┬──────────────┘
                       │
                       ▼
            ┌──────────────────────────┐
            │ GetArtifactInstruction   │
            │ availableOutlines only   │
            └──────────────┬───────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ specd specs outline <specPath> --artifact <artifactId>     │
│ [default | --full] [--hints]                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ GetSpecOutline   │
              │ + selectorHints  │
              │   (root-level)   │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ Parser outlines  │
              │ structural nodes │
              └──────────────────┘
```

## Testing

Automated tests:

- Update `packages/cli/test/commands/spec-outline.spec.ts`:
  - default command returns compact subset.
  - `--full` returns complete families.
  - `--hints` includes root-level `selectorHints` and no per-node duplication.
- Update `packages/core/test/application/use-cases/get-spec-outline.spec.ts`:
  - mode propagation and result shape.
- Update parser tests:
  - ensure default subset remains historical for each parser.
- Keep/update `change-artifact-instruction` tests:
  - ensure compact `availableOutlines` contract is unchanged.

Manual / E2E verification:

- `node packages/cli/dist/index.js specs outline core:core/config --artifact specs --format json`
- `node packages/cli/dist/index.js specs outline core:core/config --artifact specs --full --format json`
- `node packages/cli/dist/index.js specs outline core:core/config --artifact specs --hints --format json`
- `node packages/cli/dist/index.js changes artifact-instruction compact-and-complete-outlines specs --format json`

Expected:

- default output is compact.
- `--full` expands families.
- `--hints` adds root-level placeholders.
- artifact-instruction still returns only `availableOutlines` references.

Documentation and guidance:

- Update CLI command docs for `specs outline` mode flags.
- Keep skill guidance pointing to on-demand `specs outline` retrieval.

## Open questions

_none_
