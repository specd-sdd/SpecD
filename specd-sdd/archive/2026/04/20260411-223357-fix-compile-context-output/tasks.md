# Tasks: fix-compile-context-output

## 1. Core context assembly

- [x] 1.1 Seed and order change-scoped specs before pattern collection
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext.execute()` — include `change.specIds` and `change.specDependsOn` values in the collected set before include/exclude resolution and preserve deterministic ordering across seeds, include matches, and traversal additions
      Approach: replace the current split between `sourceMap`, `includedSpecs`, and `dependsOnAdded` with one ordered deduplicating collection pipeline that starts from manifest seeds and keeps `specIds` ahead of all later discoveries
      (Req: Context spec collection, Structured result assembly)

- [x] 1.2 Protect mandatory `specIds` from later excludes and preserve source priority
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext.execute()` — stop project/workspace excludes from removing `change.specIds`, keep `specDependsOn` as seeded members, preserve `specIds > specDependsOn > dependsOnTraversal > includePattern`, and keep seeded `specDependsOn` entries in `summary` when rendering `lazy` mode
      Approach: track protected keys for mandatory entries, apply excludes only to removable members, assign source precedence when merging duplicate discoveries from multiple collection paths, and preserve tier classification so only `specIds` become Tier 1 `full` in `lazy`
      (Req: Context spec collection, Structured result assembly, Tier classification)

- [x] 1.3 Keep preview and metadata-first rendering aligned with the new collection contract
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext.execute()` and content-rendering branches — ensure seeded `specIds` still use `PreviewSpec` first, then fresh metadata, then extraction fallback, while summary entries continue omitting content
      Approach: keep the existing rendering order but run it over the new assembled spec list so merged delta content and metadata freshness logic survive the collection refactor unchanged
      (Req: Structured result assembly, Staleness detection and content fallback, Materialized delta view)

- [x] 1.4 Stop dependency cycles quietly without changing other warning paths
      `packages/core/src/application/use-cases/_shared/depends-on-traversal.ts`: `traverseDependsOn()` — remove user-facing `cycle` warnings while preserving early-return cycle breaking, missing-metadata warnings, unknown-workspace warnings, and depth behavior
      Approach: keep the ancestor-set guard and return immediately on revisits, but do not append a `cycle` `ContextWarning`
      (Req: Cycle detection during dependsOn traversal, dependsOn resolution order)

## 2. Fingerprint and CLI output

- [x] 2.1 Rebuild fingerprinting around the assembled logical result
      `packages/core/src/application/use-cases/_shared/compile-context-fingerprint.ts`: `FingerprintInput`, `compileContextFingerprint()` — hash a canonical representation of the emitted logical result instead of a manually curated input subset
      Approach: define a canonical payload that includes `stepAvailable`, `blockingArtifacts`, `projectContext`, `specs`, `availableSteps`, and `warnings`, excluding only `status` and `contextFingerprint` to avoid circular hashing
      (Req: Context fingerprint)

- [x] 2.2 Move fingerprint calculation to post-assembly in CompileContext
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext.execute()` — calculate the fingerprint after assembling the logical changed-result so it reacts to `specDependsOn`, warnings, availability, and result-shaping flags such as `followDeps`, `depth`, and `sections`
      Approach: assemble the result fields first, pass them into the new fingerprint helper, then apply the unchanged short-circuit using the calculated hash
      (Req: Context fingerprint, Result shape)

- [x] 2.3 Make text output fingerprint-first and mode-explicit
      `packages/cli/src/commands/change/context.ts`: `registerChangeContext()` — print `Context Fingerprint: <sha...>` as the first text line, keep it in unchanged responses, and label each full or summary entry explicitly without depending on title rewriting
      Approach: prepend a literal `Context Fingerprint: ${contextFingerprint}` line to both changed and unchanged text paths, add a dedicated `Mode: full` line to full blocks, and add an explicit mode marker to summary rendering while keeping the existing structured `json`/`toon` passthrough
      (Req: Output, Constraints)

- [x] 2.4 Refresh CLI reference for the new output and fingerprint semantics
      `docs/cli/cli-reference.md` and `specs/_global/docs/spec.md`: `change context` reference plus `Requirement: CLI documentation` — document fingerprint-first text output and clarify that result-shaping flags affect fingerprinting while `--format` does not, under the tightened docs-spec contract
      Approach: update the CLI reference to mirror the implemented text behavior and logical-result fingerprint contract, and keep that update consistent with the new global documentation requirement without rewriting unrelated guide material
      (Req: Output, CLI documentation)

## 3. Verification coverage

- [x] 3.1 Expand core use-case tests for seeding, deduplication, silent cycles, and output-based fingerprint drift
      `packages/core/test/application/use-cases/compile-context.spec.ts`: new and updated scenarios — cover protected `specIds`, seeded `specDependsOn` staying `summary` in `lazy`, cross-source order/dedup, no cycle warning, and fingerprint changes driven by emitted specs, warnings, availability, and result-shaping flags
      Approach: build focused fixtures around `makeChange`, `makeSpecRepo`, and metadata helpers so each verify scenario asserts one output change and the resulting fingerprint or warning behavior, including the `lazy` tier split between `specIds` and `specDependsOn`
      (Req: Context spec collection, Cycle detection during dependsOn traversal, Structured result assembly, Context fingerprint)

- [x] 3.2 Expand CLI tests for fingerprint-first text rendering and warning behavior
      `packages/cli/test/commands/change-context.spec.ts`: `change context` describe block — assert `Context Fingerprint: <sha...>` text output, fingerprint plus unchanged message, explicit full/summary markers, and absence of cycle-only warning lines while stale metadata warnings still print
      Approach: update the mocked `CompileContext` result payloads used by the command tests and assert on exact stdout/stderr slices instead of inferring behavior from section presence alone
      (Req: Output, Context warnings, Step availability warning)

- [x] 3.3 Re-run artifact validation and targeted tests before implementation handoff
      `.specd/changes/20260411-223357-fix-compile-context-output` validation flow and package test commands — confirm updated specs/verify/design remain valid and implementation tests cover the changed contracts
      Approach: validate the spec-scoped artifacts one by one, then run the targeted Vitest suites for `compile-context` and `change-context` after code changes so the manual verification path in `design.md` is executable end to end
      (Req: Result shape, Error cases)

## 4. Follow-up alignment

- [x] 4.1 Realign lazy tiering so seeded specDependsOn stays summary
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext.execute()` and related JSDoc — keep `change.specDependsOn` seeded and source-prioritized, but render it as `summary` in `lazy` mode instead of Tier 1 `full`
      Approach: preserve the seed-first ordered collection pipeline and source priority map, but tighten the lazy-mode classification gate so only `specIds` are full while `specDependsOn` remains summary unless context mode is `full`
      (Req: Context spec collection, Tier classification, Structured result assembly)

- [x] 4.2 Update core expectations for the new lazy specDependsOn semantics
      `packages/core/test/application/use-cases/compile-context.spec.ts`: tier-classification and fingerprint scenarios — replace the old `specDependsOn => full` expectation with `specDependsOn => summary` and keep coverage for seeded inclusion plus fingerprint drift
      Approach: update the focused lazy-tier test names and assertions so they match the spec delta without weakening coverage of ordering, source priority, or output-driven fingerprint changes
      (Req: Tier classification, Context fingerprint)

- [x] 4.3 Re-run targeted context tests after the follow-up fix
      `packages/core/test/application/use-cases/compile-context.spec.ts` and `packages/cli/test/commands/change-context.spec.ts`: targeted Vitest coverage — confirm the new lazy tiering and the existing fingerprint-first CLI contract pass together
      Approach: run the smallest directed test commands that cover `CompileContext` and `change context`, then only expand scope if the targeted suites uncover regressions outside the expected area
      (Req: Output, Tier classification, Context fingerprint)

## 5. Multi-artifact preview rendering

- [x] 5.1 Remove the implicit spec.md-only assumption from full spec rendering
      `packages/core/src/application/use-cases/compile-context.ts`: full-content assembly and title fallback — render all schema artifacts with `scope: spec`, ordering `spec.md` first when present and the rest alphabetically, instead of selecting a single canonical file
      Approach: reuse schema artifact definitions plus the existing preview/base artifact lists to build one ordered display set, and keep any special handling for `spec.md` limited to ordering only
      (Req: Structured result assembly)

- [x] 5.2 Derive merged metadata preview for section-filtered change specs
      `packages/core/src/application/use-cases/compile-context.ts` and, if needed, `packages/core/src/application/use-cases/preview-spec.ts`: merged preview + section rendering — when `sections` is present for a spec in `change.specIds`, derive metadata/extraction from the merged preview artifact set so `rules`, `constraints`, and `scenarios` follow the same path as non-preview specs
      Approach: treat `PreviewSpec` as the source of merged spec-scoped artifacts, then run the schema extraction flow over those merged files instead of short-circuiting to raw merged text
      (Req: Input, Staleness detection and content fallback, Structured result assembly)

- [x] 5.3 Expand core verification coverage for multi-file full rendering and merged section filters
      `packages/core/test/application/use-cases/compile-context.spec.ts`: new focused scenarios — cover `spec.md`-first ordering, alphabetical fallback without `spec.md`, merged preview multi-file rendering, and `sections: ['scenarios']` pulling scenarios from merged preview artifacts
      Approach: build fixtures with multiple spec-scoped files and preview results so the tests assert exact ordering and prove that merged previews now re-enter the section-filtered metadata path
      (Req: Structured result assembly, Context fingerprint)

- [x] 5.4 Refresh CLI docs for multi-file full content and section-filtered merged previews
      `docs/cli/cli-reference.md`: `change context` command reference — document that full content may include multiple spec-scoped files in stable order, while `--rules`/`--constraints`/`--scenarios` switch rendering to metadata-derived sections, including for merged change-scoped previews
      Approach: update only the `change context` reference section so the docs mirror the refined output contract without widening to unrelated CLI commands
      (Req: Output, CLI documentation)
