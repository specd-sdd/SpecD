# Partial compliance audit — CLI archive/status and skill templates

**Change:** `archive-schema-checks-and-skip-flag`  
**Mode:** delegated verification audit (`verification-attempt-7`)  
**Scope:** merged `cli:change-archive`, `cli:change-status`, and
`skills:skill-templates-source`, including their direct Core/global constraints.  
**Result:** pass; no implementation-to-spec discrepancies found in this assigned scope.

## Requirements and implementation evidence

### `cli:change-archive`

- The canonical and singular-alias archive commands expose repeatable
  `--skip-checks <ids>`, retain `--skip-hooks`, and keep `--allow-overlap` /
  `--allow-out-of-scope` as aliases. `packages/cli/src/commands/change/archive.ts`
  registers those options and translates the aliases only into the single
  `ArchiveChangeInput.skipChecks` collection.
- The adapter trims comma-separated IDs, ignores empty entries, preserves exact
  case, deduplicates entries (including aliases), and leaves validation of unknown,
  non-skippable, and hook checks to `ArchiveChange`. This preserves the direct
  dependency boundary in `core:archive-change` and avoids a CLI-local
  skippability policy.
- The command keeps generic check progress on the shared `change-archive` bus.
  `packages/cli/src/commands/change/_check-progress-presenter.ts` renders gerund
  labels, progress lines, pass/fail/skip outcomes, and does not use the retired
  `Executing:` prefix. Structured output emits progress records before exactly one
  terminal complete record.
- Error handling preserves the specified archive semantics: overlap advice is
  shown only when Core marks the overlap skippable; generic predicate failures
  include a bypass suggestion only when their resolved binding is skippable;
  structured errors use the normal error serializer. Success still renders the
  archive path and optional invalidated peers.

### `cli:change-status`

- `packages/cli/src/commands/change/status.ts` consumes the `GetStatus` projection;
  the change does not introduce local archive-check or bypass derivation. The
  renderer emits each Core-provided `blockers[].bypassFlag` in text and serializes
  the same field in JSON/TOON, while omitting it when Core supplied none.
- This conforms to the merged requirements that archive bypass hints are resolved-
  binding facts: `spec.overlap` and `impl.linksInScope` can each advertise their
  own canonical `--skip-checks <id>` hint, while locked/schema-hardened checks do
  not receive a fabricated hint. The command remains aligned with
  `core:get-status`, `core:transition-checks`, and `core:resolve-change-schema`.

### `skills:skill-templates-source`

- `packages/skills/templates/skills/specd-archive/SKILL.md.tpl` teaches the
  canonical `--skip-checks <checkId>` archive bypass and treats `--allow-overlap`
  and `--allow-out-of-scope` only as aliases. It distinguishes live
  `OVERLAP_CONFLICT` from invalidation review (`spec-overlap-conflict`), directs
  the latter to design, and says to use only a status-provided `bypass:` flag.
- The archive template names `workspace.readOnly`, `impl.filesResolved`,
  `deps.consistent`, verification, schema, archive-state, and task-completion
  guards as non-bypassable. It also preserves the required `--skip-hooks pre`
  behavior so post-run hooks execute inside archive after persistence.
- Source template changes are accompanied by contract tests covering the
  terminology and generated-skill protocol. The templates remain compatible with
  the global architecture/conventions: no product I/O was moved into domain code,
  no default exports or unsafe typing were introduced, and source/test layout is
  conventional.

## Test coverage and execution evidence

- `packages/cli/test/commands/change/archive.spec.ts` covers alias translation,
  comma lists, repetition, trimming, deduplication, case preservation, missing
  value rejection, help text, unknown/non-skippable/hook checks, skippable versus
  hardened overlap, plugin predicate failure hints, and text/structured success
  behavior.
- `packages/cli/test/commands/change/status.spec.ts` covers text, JSON, and TOON
  propagation of Core's bypass flags, multiple independently skippable blockers,
  no locally invented hint, and disabled overlap behavior.
- `packages/skills/test/template-workflow.spec.ts` and
  `packages/skills/test/generated-skill-protocol.spec.ts` cover canonical archive
  bypass wording, non-bypassable guards, live-vs-invalidation overlap routing,
  hook handling, and generated-copy protocol parity.
- Executed successfully:
  - `pnpm exec vitest run packages/cli/test/commands/change/archive.spec.ts packages/cli/test/commands/change/status.spec.ts packages/skills/test/template-workflow.spec.ts packages/skills/test/generated-skill-protocol.spec.ts`
    — 4 files, 119 tests passed.
  - `pnpm --filter @specd/cli typecheck` — passed.
  - `pnpm --filter @specd/skills typecheck` — passed.

## Gaps and residual risk

- No discrepancy was found. The tests are adapter/template-focused and mock Core;
  end-to-end enforcement that every resolved archive binding accepts or rejects a
  bypass belongs to the separately scoped Core archive/check-registry audit.
- No manual archive was attempted because this is a delegated, read-only audit and
  the active change is in `verifying` rather than archivable. This is intentional,
  not a verification gap in the CLI unit coverage.

## Summary

| Spec                            | Requirements reviewed                                    | Findings | Coverage assessment                 |
| ------------------------------- | -------------------------------------------------------- | -------: | ----------------------------------- |
| `cli:change-archive`            | generic skip checks, aliases, errors, progress/output    |        0 | adequate targeted unit coverage     |
| `cli:change-status`             | resolved-binding bypass hints and structured/text parity |        0 | adequate targeted unit coverage     |
| `skills:skill-templates-source` | canonical archive guidance and template protocol         |        0 | adequate contract/protocol coverage |

**Assigned-scope conclusion:** compliant. This delegated audit neither started nor
completed the verification attempt and made no source/spec changes.
