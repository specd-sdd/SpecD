# Partial: sdk-globals

Audit mode: change `language-agnostic-member-symbol-references` (state `verifying`).
Primary spec source: merged preview `changes spec-preview language-agnostic-member-symbol-references sdk:build-implementation-review` (published `specs/` not used).
Delta under audit: added requirement **Unparsed stored symbol text** and its five scenarios. Inherited requirements were checked for continued conformance and were not re-audited as if they were new.
Evidence: `packages/sdk/src/orchestration/build-implementation-review.ts`, `packages/sdk/test/orchestration/build-implementation-review.spec.ts`, CLI consumers of the projection, `packages/sdk/src/orchestration/run-index-project-graph.ts`, `docs/adr/0024-logical-symbol-resolution.md`. No code or spec files were modified.

## sdk:build-implementation-review

### Requirements summary

| Requirement                              | Origin               | Verdict    |
| ---------------------------------------- | -------------------- | ---------- |
| Delivery-neutral orchestration           | inherited            | conformant |
| Stable review projection                 | inherited            | conformant |
| One health snapshot and batch resolution | inherited            | conformant |
| Unparsed stored symbol text              | added by this change | conformant |
| Graph availability behavior              | inherited            | conformant |
| Shared host behavior                     | inherited            | conformant |

### Implementation status

`buildImplementationReview` reads Core once via `ctx.kernel.changes.getImplementationReview`, builds resolver inputs, then under one `withOpenGraphProvider` lifecycle calls `getGraphHealth` once and `resolveSymbolReferences` once with that health snapshot. Empty symbol batches skip the resolver call. Stored `specId`, `file`, `fileLinkExplicit`, and `symbols` are copied onto the projection. Symbol rows keep the original string and the provider `SymbolResolutionResult`. File-only links get `symbolResolutions: []` and are not sent to the resolver.

`buildResolutionRequests` still does only this:

- workspace = spec id before the first `:`, or the whole spec id when `:` is absent
- `requested` = the stored symbol string
- `filePath` = the stored link file (empty string when the link has no file)

It does not split `.` or `::`, does not parse `@specd/...` package text, does not parse `logical|` ids, does not set `language`, `symbolSpace`, `kind`, `logicalId`, `ownerId`, or `memberSemantics`, and does not read a package-to-workspace map. `ResolveSymbolReferenceInput.language` stays unset, so the SDK does not select a language adapter.

Provider rows are copied by index. A shorter batch throws a generic `Error` (internal contract break). Open, health, and resolution failures propagate through `withOpenGraphProvider` and are not rewritten as `missing` links. CLI `enrichImplementationTracking` is the only production caller; `implementation` and `status` print `resolution.status` and `resolution.reasonCode` from that projection and do not run same-file, rightmost-segment, or workspace-name matching.

### Change invariants (not defects)

- **Link forwarding unchanged.** `EditChange.execute` is requested with its link file. `buildResolutionRequests` was not turned into a member parser.
- **`@specd/sdk barrel` and `Integration`.** The SDK does not assign `SYMBOL_NOT_FOUND`. It copies the provider result. The unit test feeds `@specd/sdk barrel` as unresolved `REFERENCE_UNPROVEN` and asserts that string is not rewritten into a package lookup. A real-kernel `SYMBOL_NOT_FOUND` for barrel or `Integration` is produced by Code Graph, not by this orchestration.
- **Markdown and `package.json`.** The SDK does not classify files. File-level links skip symbol resolution. `FILE_NOT_INDEXED` is a provider reason, not an SDK rewrite.
- **`MemberForm`.** No `MemberForm` / `member_form` in `packages/sdk`. ADR-0024 states schema 12 stores `qualified_name` and drops `member_form`. Published specs that still name `MemberForm` are outside this change until archive.
- **Schema 12 / `qualified_name`.** `runIndexProjectGraph` forwards `codeGraphVersion` and recreates storage on `GraphStorageRecoveryRequiredError` when `force` or `SCHEMA_INCOMPATIBLE`. It does not parse symbols or own `qualified_name`. ADR-0024 places schema 12 and `qualified_name` in Code Graph. That matches the SDK rule that stored text is forwarded unparsed.

### Scenario coverage

| Scenario                                           | Evidence                                                                                                                                                                                                                                               | Coverage                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| SDK composes Core health and resolver              | first unit test: one Core read, one provider, one health read, one batch, no presenter formatting in the SDK                                                                                                                                           | covered                         |
| Stored values are never rewritten                  | second unit test keeps spec, file, and symbol strings; canonical name exists only on the mocked resolution target                                                                                                                                      | covered                         |
| File-level link bypasses symbol resolution         | second unit test: file-only link has `symbolResolutions: []` and is absent from the batch                                                                                                                                                              | covered                         |
| Review avoids per-link provider work               | first unit test: health once, one `resolveSymbolReferences` call                                                                                                                                                                                       | covered                         |
| Qualified link text reaches the provider unchanged | `forwards stored qualified text...`: `requested: 'EditChange.execute'`, `filePath: 'packages/sdk/src/review.ts'`                                                                                                                                       | covered                         |
| Ambiguous provider result stays ambiguous          | same test: first row stays `ambiguous` / `AMBIGUOUS_MULTIPLE_TARGETS`                                                                                                                                                                                  | covered                         |
| Batch order matches stored links                   | same test: three links, five symbols, one call, request order equals stored order                                                                                                                                                                      | covered                         |
| Link without a file is still unparsed              | same test: `requested: 'loose'`, `filePath: ''`, object has no `language`                                                                                                                                                                              | covered                         |
| Unresolved barrel label stays unresolved           | same test: `@specd/sdk barrel` stays the request and stays `unresolved`                                                                                                                                                                                | covered                         |
| Non-current graph yields unresolved diagnostics    | SDK passes the single health snapshot into the batch and does not reclassify. Unit test keeps provider `missing` (`REFERENCE_ABSENT`) distinct from `unresolved` (`CONTENT_HASH_CHANGED`). Dirty/partial classification itself belongs to the resolver | covered at the SDK boundary     |
| Provider failure propagates                        | `it.each` open / health / resolution failures reject and still close                                                                                                                                                                                   | covered                         |
| CLI consumers use identical projection             | `enrichImplementationTracking` plus text rendering in `implementation.ts` and `status.ts` print SDK rows only                                                                                                                                          | covered by call-site inspection |

### Discrepancies

None.

Neither the added requirement nor the current SDK code rewrites stored symbol text. The spec says the provider result remains the review outcome; the implementation copies `SymbolResolutionResult` in stored order. Workspace extraction from the spec id is not parsing of the symbol string, and the added scenarios still pass that workspace through.

### Test coverage

The added scenarios are asserted in `packages/sdk/test/orchestration/build-implementation-review.spec.ts` (`forwards stored qualified text in one ordered batch and copies unresolved rows`). Exact `toHaveBeenCalledWith` equality fails if a `language` field or a split member is introduced. Inherited orchestration, preservation, file-only bypass, missing-versus-unresolved copy, and infrastructure propagation remain in the same file.

No missing tests for this spec's scenarios.

## Global and dependency contradictions

None.

Checked only the added requirement (forward stored symbol text and its file, do not parse owner-qualified syntax / package specifiers / canonical logical ids, do not select a language adapter, keep unresolved and ambiguous provider results) against:

- `default:_global/architecture` — resolution stays in Code Graph; SDK orchestration uses public Core and Code Graph APIs; dependency direction `sdk → core, code-graph` is unchanged. The SDK package is not given a new domain parser.
- `default:_global/conventions` — no new public signature, `any`, or filename. `buildResolutionRequests` remains a private function with an explicit return type.
- `default:_global/error-handling-conventions` — the added requirement does not introduce a user-facing failure. Unresolved and ambiguous stay resolution rows. The existing generic `Error` on a short batch is an internal invariant break, which the error spec allows for unexpected bugs.
- `default:_global/testing` — new coverage is a Vitest unit test with a typed provider mock. No snapshots, chmod, or concatenated paths.
- `default:_global/docs` — the spec still cites ADR-0024. The ADR's SDK sentence (one Core read, one lifecycle, one batch, no stored-link mutation) matches the added forwarding rule. Schema 12 and `qualified_name` stay Code Graph facts. No host import-surface change.
- `default:_global/eslint` — no new export, `any`, or layer violation in the forwarding path.
- `code-graph:document-model` — textual files without an adapter become documents during indexing. The SDK requirement forbids the review path from selecting an adapter or turning a barrel label into a package lookup. Those are different layers; the SDK rule does not deny document classification.
- `code-graph:workspace-integration` — package and module identity stay with indexer import resolution and language-adapter package facts. The SDK requirement forbids the review path from parsing package specifiers. That assigns package identity to Code Graph and matches "MUST NOT infer cross-workspace targets from a global same-name match." Drive-letter workspace parsing applies to graph identities, not to this spec-id workspace prefix.

## Summary counts

- Specs audited: 1 (`sdk:build-implementation-review`)
- Dependency specs checked for contradictions only: 8
- Requirements: 6 (1 added, 5 inherited)
- Scenarios: 12 (5 added, 7 inherited)
- Conformant scenarios: 12
- Discrepancies: 0
- Global/dependency contradictions: 0
- Missing tests: 0
- Findings: 0
