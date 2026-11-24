# Tasks: delta-merge-effective-change-checks

## 1. Port-level semantic validation

- [x] 1.1 Restrict `validateRename` to `matches`-identified node types
      `packages/core/src/application/ports/artifact-parser.ts`:
      `validateRename` — reject `rename` when `descriptor.identifiedBy` does not include `'matches'`
      Approach: replace `const hasLabel = descriptor.identifiedBy.length > 0` with `const hasNameIdentifier = descriptor.identifiedBy.includes('matches')` and return an error message when false
      (Req: Apply contract — atomic selector resolution, Delta conflict detection)
- [x] 1.2 Align `validateValue` leaf-with-label warning with `matches` identifiers
      `packages/core/src/application/ports/artifact-parser.ts`:
      `validateValue` — avoid warning `consider using rename` on `contains`-only leaf nodes (`paragraph`, `line`)
      Approach: check `descriptor.identifiedBy.includes('matches')` instead of `descriptor.identifiedBy.length > 0` for the `leaf-with-label` warning
      (Req: Apply contract — atomic selector resolution)

## 2. Delta application engine (`applyDelta`)

- [x] 2.1 Reject `op: modified` entries with no mutation payload
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`:
      `applyDelta` (Phase 1) — throw `DeltaApplicationError` if `entry.op === 'modified'` omits `content`, `value`, and `rename`
      Approach: check `entry.content === undefined && entry.value === undefined && entry.rename === undefined` in the Phase 1 validation loop
      (Req: Delta conflict detection, Apply contract — atomic selector resolution)
- [x] 2.2 Add `clearParserSerializationCaches` helper and clear caches on mutated nodes/containers
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`:
      `clearParserSerializationCaches`, `setChildren`, and `applyDelta` (`modified` branch) — delete `_inlines`, `_blockquoteChildren`, and `_yaml` on mutated nodes and containers whose `children` change
      Approach: call `clearParserSerializationCaches(clone)` inside `setChildren` (invalidating root `_yaml` on any tree update) and on every cloned node in `entry.op === 'modified'` (`rename`, `content`, `value`) while leaving untouched siblings' `_inlines` intact
      (Req: Delta application, Serialize round-trip)

## 3. Format parser adapters

- [x] 3.1 Fix `PlaintextParser` `paragraph` descriptor and value serialization
      `packages/core/src/infrastructure/artifact-parser/plaintext-parser.ts`:
      `PlaintextParser.nodeTypes` and `PlaintextParser.apply` — mark `paragraph` with `isLeaf: true, isCollection: false` and ensure `value` updates serialize cleanly via `_serializeParagraph`
      Approach: update the `paragraph` `NodeTypeDescriptor` in `nodeTypes()` so `validateValue` permits `value` updates and `validateRename` rejects `rename`; verify `valueToNode` produces `{ type: 'paragraph', value: String(value) }`
      (Req: Serialize round-trip)
- [x] 3.2 Verify `MarkdownParser` and `YamlParser` emit updated content instead of stale caches
      `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts` & `yaml-parser.ts`:
      `nodeToMdastNodes` and `YamlParser.serialize` — confirm mutated `paragraph` (`value`), `list-item` (`rename`), blockquote `paragraph`, and mutated YAML `root` fall back to updated AST fields when `_inlines`/`_blockquoteChildren`/`_yaml` are cleared
      Approach: inspect and adjust only if any edge case (such as blockquote or nested wrapper) retains stale cache fields after `applyDelta`
      (Req: Delta application, Serialize round-trip)

## 4. In-memory effective-change validation in `ValidateArtifacts`

- [x] 4.1 Implement `verifyDeltaOperationsEffective` helper
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      `verifyDeltaOperationsEffective(parser, baseAST, deltaEntries)` — sequentially apply each non-`no-op` entry in memory and compare `parser.serialize()` against the previous serialized state
      Approach: start from `currentAST = baseAST` and `previousSerialized = parser.serialize(baseAST)`; for each entry where `entry.op !== 'no-op'`, run `parser.apply(currentAST, [entry])` and `parser.serialize(stepResult.ast)`, returning `Delta operation #${i + 1} (${entry.op}) produced no change in serialized output` if `nextSerialized === previousSerialized`
      (Req: Delta application preview and conflict detection)
- [x] 4.2 Wire `verifyDeltaOperationsEffective` into `ValidateArtifacts.execute`
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      `ValidateArtifacts.execute` — invoke `verifyDeltaOperationsEffective` after `parser.apply(baseAST, deltaEntries)` succeeds, recording a failure and blocking `validations[]` / `markComplete` when any non-`no-op` op is ineffective
      Approach: keep existing `no-op`-only bypass untouched; record failure `{ artifactId, description, filename }` and set `artifactFailed = true` when helper returns a non-null message
      (Req: Delta application preview and conflict detection)

## 5. Automated tests

- [x] 5.1 Add unit tests for `applyDelta` and `validateRename`
      `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`:
      new test cases — verify `DeltaApplicationError` on `modified` without payload and on `rename` for `contains`-only nodes (`paragraph`, `line`)
      Approach: test both `MarkdownParser` and `PlaintextParser` descriptors through `applyDelta`
      (Req: Delta conflict detection, Apply contract — atomic selector resolution)
- [x] 5.2 Add unit tests for `MarkdownParser` cache invalidation
      `packages/core/test/infrastructure/artifact-parser/markdown-parser.spec.ts`:
      new test cases — verify `paragraph` + `value`, blockquote `paragraph` + `value`, and `list-item` + `rename` serialize updated text while untouched sibling paragraphs preserve inline formatting
      Approach: parse markdown with `` `code` `` / `*em*` / `**strong**`, apply deltas, assert serialized output
      (Req: Delta application, Serialize round-trip)
- [x] 5.3 Add unit tests for `YamlParser` and `PlaintextParser`
      `packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts` & `plaintext-parser.spec.ts`:
      new test cases — verify YAML `modified`/`added`/`removed` invalidate `_yaml` while unmodified round-trip preserves comments; verify Plaintext `paragraph` + `value` serializes updated text and `rename` throws `DeltaApplicationError`
      Approach: assert `serialize(apply(parse(...)))` reflects mutations and preserves unaffected siblings
      (Req: Delta application, Serialize round-trip)
- [x] 5.4 Add unit tests for `ValidateArtifacts` per-op effective-change check
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test cases — verify identical `modified` fails, second ineffective op in multi-entry delta fails, AST-only mutation with unchanged `serialize()` fails, valid multi-entry delta passes, `no-op`-only delta bypasses check, and `SpecRepository` is never written to
      Approach: test both real `MarkdownParser` and a mock `ArtifactParser` returning unchanged `serialize()`
      (Req: Delta application preview and conflict detection)

## 6. Build and E2E verification

- [x] 6.1 Run `@specd/core` test suite and monorepo build
      `packages/core`: run `pnpm --filter @specd/core test` and `pnpm build` — confirm all tests and typechecks pass with zero regressions
      Approach: execute Vitest and TypeScript build after all edits
- [x] 6.2 Verify CLI `changes validate` catches ineffective `modified` ops
      `packages/cli`: run `node packages/cli/dist/index.js changes validate` against an active/temp delta scenario to confirm ineffective `modified` fails and effective deltas pass
      Approach: verify exit code and failure message format
