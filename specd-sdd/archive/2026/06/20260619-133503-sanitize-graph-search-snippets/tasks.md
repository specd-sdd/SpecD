# Tasks: sanitize-graph-search-snippets

## 1. CLI command contract

- [x] 1.1 Add `--snippet` to graph-search option parsing
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch()` — register the new CLI flag and thread it through the local parsed options shape without forwarding it into `SearchOptions`
      Approach: treat `--snippet` as a render/output control only; keep provider query inputs unchanged so ranking and retrieval semantics do not move into backend contracts
      (Req: Command signature)
- [x] 1.2 Update structured output serialization to omit snippet by default
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch()` — stop serializing `snippet` into `json` / `toon` payloads unless `opts.snippet === true`
      Approach: keep `startLine` and `endLine` in all structured outputs, keep `--spec-content` independent, and gate only the `snippet` field behind the new flag
      (Req: Output format)

## 2. Text rendering and sanitization

- [x] 2.1 Switch text-mode symbol output to compact default rendering
      `packages/cli/src/commands/graph/search.ts`: text-mode symbol branch inside `registerGraphSearch()` — render `[workspace]`, `path:line:column`, and suppress snippet blocks unless `--snippet` is enabled
      Approach: preserve the existing identity block, append symbol column to the location line, and call a shared snippet-block helper only when the opt-in flag is true
      (Req: Output format)
- [x] 2.2 Switch text-mode spec and document output to compact location metadata
      `packages/cli/src/commands/graph/search.ts`: text-mode spec/document branches inside `registerGraphSearch()` — render match metadata without snippet blocks by default
      Approach: add a local `renderMatchLocation(startLine, endLine)` helper that formats `match @ Lx-Ly`, and use it for specs/documents unless `--snippet` is enabled
      (Req: Output format)
- [x] 2.3 Centralize optional snippet-block rendering
      `packages/cli/src/commands/graph/search.ts`: local rendering helpers — consolidate `snippet @ ...`, `>>>`, and `<<<` emission for all categories
      Approach: introduce a `renderSnippetBlock(lines, snippet, startLine, endLine)` helper so symbols, specs, and documents share the same gate and block format
      (Req: Output format)
- [x] 2.4 Sanitize snippet text before normalization
      `packages/cli/src/commands/graph/normalize-snippet.ts`: `normalizeSnippet()` and private helper(s) — remove ANSI escape sequences and non-printable control characters other than newline and tab
      Approach: add a pure private `stripTerminalControlSequences(text: string)` pre-pass, then keep the current tab expansion, trailing trim, minimum-indent, and margin logic unchanged
      (Req: Output format)
- [x] 2.5 Preserve helper documentation and CLI-layer boundaries
      `packages/cli/src/commands/graph/normalize-snippet.ts` and `packages/cli/src/commands/graph/search.ts`: new helper functions — add or update JSDoc and keep all logic inside the CLI layer
      Approach: document the new helper contracts explicitly and avoid moving rendering/sanitization behavior into `@specd/core` or `@specd/code-graph`
      (Req: Output format)

## 3. Documentation and skill guidance

- [x] 3.1 Update CLI reference for `graph search`
      `docs/cli/cli-reference.md`: `graph search` section — document `--snippet`, compact default output, and the structured-output rule that `snippet` is omitted unless requested
      Approach: revise the options table and descriptive text so docs match the new command contract exactly
      (Req: Command signature, Output format)
- [x] 3.2 Update shared skills guidance for graph-search examples
      `packages/skills/templates/shared/shared.md.tpl`: graph command examples and workflow table — show `--snippet` only when preview text is intentionally needed
      Approach: keep default examples compact by default and add opt-in examples where reading the preview body is the point; this task satisfies the `skills:skill-templates-source` requirement that templates must not imply snippets are emitted by default
      (Req: Command signature, Output format)
- [x] 3.3 Update specd-new and specd-design skill templates
      `packages/skills/templates/skills/specd-new/SKILL.md.tpl` and `packages/skills/templates/skills/specd-design/SKILL.md.tpl`: graph-search guidance — teach agents when to request `--snippet`
      Approach: adjust the instructional prose around `graph search` rather than changing the workflow itself, so agent guidance stays aligned with the new CLI contract and with the `skills:skill-templates-source` verify scenarios for `--snippet`
      (Req: Command signature, Output format)
- [x] 3.4 Refresh generated skill artifacts if repo workflow requires it
      `.codex/skills/...` and `.agents/skills/...`: generated skill copies — sync only if the normal package/template workflow expects checked-in generated outputs to stay aligned
      Approach: treat `packages/skills/templates/...` as source of truth and use the repository’s normal refresh path instead of ad hoc manual divergence so installed/generated guidance does not drift from the `skills:skill-templates-source` source templates
      (Req: Command signature, Output format)

## 4. Automated tests

- [x] 4.1 Update command tests for compact default text output
      `packages/cli/test/commands/graph-search.spec.ts`: graph-search command cases — assert text-mode results omit snippets by default while preserving location metadata
      Approach: reuse the existing mocked provider setup and update current document/symbol expectations to check for absence of snippet blocks unless `--snippet` is passed
      (Req: Output format, scenario: Text output omits snippet blocks by default)
- [x] 4.2 Add command tests for opt-in snippet rendering in text mode
      `packages/cli/test/commands/graph-search.spec.ts`: new text-mode cases — assert `--snippet` restores visible snippet blocks for symbols/specs/documents
      Approach: extend the mocked search result fixtures and verify `snippet @ Lx-Ly`, `>>>`, and `<<<` only appear with the flag
      (Req: Command signature, Output format, scenario: Text output renders snippets when requested)
- [x] 4.3 Add command tests for structured omission and inclusion of `snippet`
      `packages/cli/test/commands/graph-search.spec.ts`: new `json` / `toon` cases — assert default structured output omits `snippet` and `--snippet` restores it
      Approach: parse captured stdout payloads, verify `startLine` / `endLine` stay present, and verify `--spec-content` does not implicitly enable `snippet`
      (Req: Command signature, Output format, scenario: JSON output includes workspace and scores but excludes full content)
- [x] 4.4 Add sanitization-focused unit coverage
      `packages/cli/test/commands/graph/normalize-snippet.spec.ts`: `normalizeSnippet()` cases — verify ANSI removal, control-character stripping, and preserved indentation behavior
      Approach: add helper-level tests with representative `\x1b[...]` content and confirm visible text survives while control bytes disappear
      (Req: Output format, scenario: Text-mode snippet sanitizes terminal control sequences)

## 5. Validation and manual verification

- [x] 5.1 Run CLI-focused automated verification
      `packages/cli/test/commands/graph-search.spec.ts` and `packages/cli/test/commands/graph/normalize-snippet.spec.ts`: targeted Vitest execution — confirm all changed command/helper contracts hold
      Approach: run the smallest relevant test subset first, then broaden only if failures suggest wider CLI integration fallout
      (Req: Output format)
- [x] 5.2 Manually verify compact and opt-in snippet behavior end to end
      Local CLI command runs under `node packages/cli/dist/index.js graph search ...` — confirm default text, `--snippet` text, default `json`/`toon`, and opt-in structured snippet emission
      Approach: reproduce the original noisy-log case, then confirm the sanitized preview and default metadata-only behavior with and without `--snippet`
      (Req: Output format, scenario: Toon output includes snippet when requested)
- [x] 5.3 Manually verify docs and skill guidance consistency
      `docs/cli/cli-reference.md` and updated `packages/skills/templates/...` files — ensure every user-facing example reflects the new opt-in snippet contract
      Approach: compare the final examples and guidance text against the implemented CLI behavior so no document or template still implies snippet-by-default semantics
      (Req: Command signature, Output format)
