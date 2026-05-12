# Proposal: fix-markdown-archive-merge-formatting

## Motivation

`change archive` is currently mutating markdown style during delta merge, producing noisy and misleading diffs. This breaks trust in archive output and forces manual post-fix editing.

## Current behaviour

During archive-time merge of markdown deltas, the serialized output may:

- drop inline-code backticks in prose,
- escape `<` as `\<` in normal text,
- rewrite list markers from `-` to `*`.

This can affect untouched sections and modified sections alike.

## Root cause hypothesis

Current implementation likely corrupts markdown formatting through two mechanisms:

- `apply-delta` deep clone drops adapter metadata fields prefixed with `_` (including markdown `_inlines`), so inline token structure is lost while applying entries.
- Markdown serialization uses `toMarkdown(...)` with default options, which can normalize stylistic choices (for example list bullet markers) instead of preserving document style.

Together, this explains the observed backtick loss, escaping differences, and list marker rewrites.

## Proposed solution

Make markdown merge serialization style-aware and deterministic:

- Preserve markdown inline token metadata during delta application (or otherwise preserve equivalent inline structure) so untouched inline formatting survives merge.
- Detect original style profile from base markdown (unordered list marker, emphasis marker, strong marker; optionally other serializer knobs).
- Pass the detected profile into markdown serialization so unchanged sections preserve their original style where representable.
- If source style is ambiguous (mixed markers for same construct), normalize using project markdown conventions (MarkdownLint-aligned defaults) for deterministic output.
- For `modified` delta entries, preserve the authored markdown intent in `content` and avoid destructive normalization that changes semantic inline formatting.

## Specs affected

### New specs

- None.

### Modified specs

- `core:core/archive-change`: clarify merge-output guarantees at archive time for markdown artifacts.
- `core:core/artifact-parser-port`: define serializer-style behavior/contract for markdown adapter.
- `core:core/artifact-ast`: tighten markdown round-trip fidelity requirements around inline and list-style preservation.
- `core:core/delta-format`: clarify expectations for `modified` markdown `content` rendering and non-targeted content stability.

## Impact

- Code areas: markdown parser/serializer adapter, delta apply utility, archive merge flow, and tests around delta merge/round-trip.
- API impact: no external CLI/API shape changes expected; behavior becomes more stable.
- Data impact: archived spec files become more faithful to source style and produce cleaner diffs.

## Open questions

- Exact MarkdownLint baseline to use when style is ambiguous (e.g. `-` vs `*`, `*` vs `_`).
- Whether to persist style profile on AST metadata or keep detection/serialization local to markdown adapter.
