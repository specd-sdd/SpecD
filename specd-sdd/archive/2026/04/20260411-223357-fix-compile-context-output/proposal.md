# Proposal: fix-compile-context-output

## Motivation

Compiled change context is currently unreliable and harder to consume than it should be. The current behavior can omit specs that are explicitly in scope for the change, surface traversal details that should remain internal, and the CLI text contract is still underspecified enough that a raw hash can slip in where a labeled fingerprint line was intended.

There is also a more fundamental rendering drift in `CompileContext`: it still behaves as if a spec had one canonical content file called `spec.md`. That assumption is schema-dependent and no longer matches the intended model for spec display.

## Current behaviour

`CompileContext` tracks `change.specIds` and `change.specDependsOn` in its source map, but the collected spec set is seeded only from include patterns and optional dependency traversal. In practice, this means a spec that belongs to `change.specIds` can be absent from the compiled result unless it is also matched by another collection path. The same structural gap also affects `change.specDependsOn` targets when they are not discovered through another source.

When dependency traversal encounters a cycle, the current contract and behavior also surface warnings to the caller. For this workflow, cycles should be treated as an internal traversal stop condition: context compilation should stop following the repeated edge, but it should not emit a warning just because the graph contains a cycle.

It is also unclear from the current contract whether context output explicitly guarantees deduplication after all sources are merged. The implementation already uses maps to avoid some duplicates, and there is at least one test covering duplicate include-pattern matches, but the contract does not spell out deduplication as a cross-source guarantee and the coverage is not clearly framed around all source combinations.

`specd change context` exposes `contextFingerprint` in structured output, but the text contract has been too loose: first it did not print the fingerprint at all, and even after implementation drift it still did not specify the intended literal `Context Fingerprint: <sha...>` label. The command also exposes `mode: 'full' | 'summary'` only per spec entry in structured output, while text mode leaves the reader to infer whether a spec is complete or summary content from layout alone. That is especially awkward when metadata is missing or partial, because text-mode clarity should not depend on being able to decorate or trust a spec title.

There is also a contract mismatch around `change.specDependsOn`: those specs should be seeded into the compiled context so they are never silently lost, but they should not automatically be promoted to Tier 1/full content just because the manifest references them.

The current fingerprint contract is also too input-oriented. If the compiled output changes because the assembled result changes, the fingerprint must change as well. In particular, once `change.specDependsOn`, warnings, availability, or rendered spec output can alter the emitted context, the fingerprint contract needs to follow the compiled result rather than a hand-picked subset of upstream inputs.

Finally, the current full-content path for specs in `change.specIds` is too tied to `PreviewSpec`'s merged file list as raw text. It tries to pick `spec.md` first, falls back to the first merged file, and bypasses the metadata-driven rendering path entirely. That creates two problems:

- full spec display does not follow the decision to show all `scope: spec` artifacts in stable order
- section flags such as `--scenarios` do not reliably work for merged specs, because merged preview content never re-enters the same metadata/section rendering flow used elsewhere

## Proposed solution

Tighten the `CompileContext` contract so `change.specIds` are always included in the compiled context set before pattern-based additions are applied, preserving their mandatory in-scope semantics. At the same time, make the treatment of `change.specDependsOn` explicit: they are seeded into the collected set, but in lazy mode they remain summary entries unless another rule independently promotes them.

Refine dependency traversal semantics so cycles terminate traversal quietly instead of producing user-visible warnings, while still preventing infinite loops.

Make deduplication an explicit part of the compiled context contract: each spec appears at most once in the final result regardless of how many collection paths match it.

Preserve and make explicit the materialized view behavior that already exists for change context: when a spec in `change.specIds` has validated deltas, the compiled context must surface the merged spec content rather than the unmodified base spec. When merged content is not available, full-mode content should continue to come from fresh metadata first, falling back to live extraction only when metadata is stale or absent.

Replace the current single-file assumption with an artifact-based rendering contract. When `CompileContext` renders a full spec, it should treat all schema artifacts with `scope: spec` as part of that spec's displayable content. If a file named `spec.md` exists it is rendered first; all remaining `scope: spec` artifacts follow in alphabetical order. This ordering rule must apply consistently to base specs and merged change previews.

For merged change-scoped specs, add a metadata-preview path derived from the merged artifact set returned by `PreviewSpec`. That allows `CompileContext` to feed merged content back through the same metadata-extraction and section-filtering flow used for fresh or stale metadata, so flags such as `--rules`, `--constraints`, and `--scenarios` continue to work even when the spec is being shown through a delta-merged preview.

Extend the `change context` contract so text output advertises its state more explicitly. The fingerprint should appear at the very beginning of the text output as a labeled line in the form `Context Fingerprint: <sha...>`, and each rendered context entry should make clear whether it is full content or summary content without depending on title rewriting. Structured output should keep its existing per-spec `mode` signal.

Redefine the fingerprint contract so it is calculated from the complete logical output of `CompileContext` rather than from a separate list of presumed inputs. The fingerprint should track any change that would alter the emitted compiled context for the selected flags, while still remaining format-agnostic.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/compile-context`: clarify that specs referenced by `change.specIds` are always part of the compiled context set, even when later include/exclude filtering would otherwise remove them; define that `change.specDependsOn` specs are seeded but remain summary by default in lazy mode; state that dependency cycles stop traversal without user-visible warnings; make the final result explicitly deduplicated; and replace the implicit `spec.md`-only content model with ordered multi-artifact rendering plus merged-metadata section filtering.
  - Depends on (added): none
- `cli:cli/change-context`: update the command output contract so text mode prints a labeled `Context Fingerprint: <sha...>` line at the beginning, makes each spec entry's full/summary status explicit without relying on title rewriting or section-layout inference, and renders full spec content according to the ordered multi-file output returned by `CompileContext`.
  - Depends on (added): none
- `default:_global/docs`: tighten the CLI documentation requirement so command reference docs must stay aligned with special output semantics such as fingerprint-first text rendering and cache-related flags when those behaviors are part of the command contract.
  - Depends on (added): none

## Impact

- `packages/core/src/application/use-cases/compile-context.ts`
- `packages/core/src/application/use-cases/preview-spec.ts`
- `packages/core/test/application/use-cases/compile-context.spec.ts`
- `packages/cli/src/commands/change/context.ts`
- `packages/cli/test/commands/change-context.spec.ts`
- `docs/cli/cli-reference.md`

The change affects compiled context assembly, the CLI adapter for `specd change context`, the documentation spec that governs CLI reference completeness, the `change context` CLI reference page, and the tests that define expected behavior for both layers. No external dependencies or data model changes are expected.

## Technical context

The current implementation in `packages/core/src/application/use-cases/compile-context.ts` seeds `sourceMap` with `specIds` and `specDependsOn`, but not the actual collected set used to produce `result.specs`. This creates a contract mismatch with the current spec, which already describes `specIds` as tier-1 context. The intended behavior for this change is stricter for `change.specIds`: they are mandatory context members and must survive later exclude filtering rather than being treated as ordinary include-pattern matches.

There is also an older assumption baked into `CompileContext`: when it needs a title fallback or merged full content, it reaches specifically for `spec.md`. That is too tightly coupled to the standard schema. The intended behavior is schema-aware at the artifact level: all `scope: spec` artifacts are displayable content, and only the ordering rule gives `spec.md` special treatment if it happens to exist.

The current `core:core/compile-context` spec still describes cycle detection as warning-producing behavior, and the implementation in `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts` pushes a `cycle` warning when an ancestor is revisited. The current test suite also expects that warning. The new requirement from this change is that cycles remain an internal control-flow detail: traversal must stop safely, but the caller should not receive a warning solely because a cycle exists.

The current contract also implies deduplication through ordering rules, and the implementation already does some of that work through `Map`-based accumulation in `includedSpecs` and `dependsOnAdded`. There is also a test asserting that a spec matched by multiple include patterns appears once. This proposal does not invent deduplication from scratch; it makes that behavior first-class, extends it to the full merged result contract, and requires explicit verification for mixed collection sources.

The current fingerprint implementation in `packages/core/src/application/use-cases/compile-context.ts` is built from a manually selected subset of inputs. That is weaker than the behavior we want for this change. The updated requirement is that the fingerprint follows the full logical `CompileContext` output for the selected context flags: if the compiled result changes, the fingerprint changes. That includes changes driven by `change.specDependsOn`, collected specs, rendered content mode, warnings, step availability, and output-shaping flags such as dependency traversal depth or section filters, while still excluding presentation-only formatting differences such as `--format text|json|toon`.

The current CLI implementation in `packages/cli/src/commands/change/context.ts` initially rendered text output without printing `contextFingerprint`, and after implementation drift the literal text prefix still remained underspecified. The contract needs to pin the output to an explicit label (`Context Fingerprint: <sha...>`), not just “the fingerprint appears first”, otherwise code and tests can satisfy a weaker interpretation than the intended user-facing format. Text readers also still infer full-vs-summary status from presentation structure unless the contract requires explicit per-entry labeling rather than rewriting or depending on the title field.

Because the change now formally includes updating `docs/cli/cli-reference.md`, the global documentation spec is also in scope. The current `default:_global/docs` contract requires a doc file for every CLI command, but it does not say clearly enough that command docs must be kept aligned with command-specific output semantics when those semantics are part of the command contract. This change tightens that requirement so the docs update is part of the specified behavior rather than an implementation-only courtesy.

I also re-checked the content path in `packages/core/src/application/use-cases/compile-context.ts`. The current implementation already preserves a materialized delta view for specs in `change.specIds` by calling `PreviewSpec` first, but it then shortcuts the rest of the rendering pipeline by selecting `spec.md` or the first merged file as raw text. That is exactly why section filters such as `--scenarios` do not work reliably for merged specs today. The updated direction is to preserve merged previews, but normalize them back into the same metadata/section flow: derive merged metadata from the previewed artifact set when section filtering is requested, and use ordered multi-artifact rendering instead of a single-file assumption when full artifact content is shown. `change.specDependsOn` is intentionally different: those specs must stay included, but in lazy mode they should remain summary unless some other rule promotes them.

The change is intentionally scoped to `CompileContext` and `specd change context`. `cli:cli/project-context` was inspected as adjacent context, but broad output normalization across all context commands is not part of this proposal.

## Open questions

_none_
