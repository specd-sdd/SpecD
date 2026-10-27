# Partial audit: core:config, core:config-loader, cli:graph-index

Change: bound-indexer-ast-resource-lifecycle. Read-only audit. Targeted tests run: `packages/cli` (graph-index.spec, test/commands/graph/\*, graph-index-task.spec): 175 passed. `packages/core` config-loader.spec: 145 passed. Zod behaviour was probed directly (see below).

Zod probe of `ProjectGraphZodSchema.maxFileBytes` (`z.number().int().nonnegative().optional()`): 0 and -0 ok; -1, 1.5, NaN, Infinity, "10", null, true rejected; 1e21, 1e300 and MAX_SAFE_INTEGER ACCEPTED. `largeFilePaths: ['a', 1]` rejected, `[]` accepted, unknown key rejected (`.strict()` kept).

---

## core:config

### Requirements Summary

| Requirement / scenario                                                                 | Status                                  | Evidence (code)                                                                                                                                                      | Test coverage                                                                                                   |
| -------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Project-level graph configuration lists `maxFileBytes` / `largeFilePaths`              | Implemented                             | `packages/core/src/application/ports/config-schema.ts:174-175`; `specd-config.ts` `SpecdGraphConfig` (+`maxFileBytes`, `largeFilePaths`); `config-loader.ts:642-647` | config-loader.spec "parses project graph.maxFileBytes and graph.largeFilePaths correctly"                       |
| Scenario: Project-level size fields accepted                                           | Implemented                             | same                                                                                                                                                                 | same test                                                                                                       |
| Workspace-level `maxFileBytes`, `largeFilePaths`                                       | Implemented                             | `config-schema.ts:163-164`; `specd-config.ts` `SpecdWorkspaceGraphConfig`; `config-loader.ts:473-478`                                                                | "parses workspace graph.maxFileBytes and graph.largeFilePaths correctly"                                        |
| Graph file size limit: non-negative integer, reject negative / fractional / non-number | Implemented (with a gap on huge values) | `.int().nonnegative()`; probe: negative, 1.5, "big", NaN, Infinity rejected                                                                                          | "rejects project graph.maxFileBytes when negative, fractional, or non-number"; workspace twin                   |
| 0 accepted, means no limit                                                             | Implemented                             | schema accepts 0; loader passes 0 through (`!== undefined` guard, not truthiness)                                                                                    | "accepts project graph.maxFileBytes: 0", "accepts workspace graph.maxFileBytes: 0"                              |
| Omitted => field absent, no default written                                            | Implemented                             | conditional spreads at `config-loader.ts:473-478, 642-647`                                                                                                           | "project maxFileBytes and largeFilePaths are undefined when omitted" (+ workspace)                              |
| Workspace value replaces project value (config keeps both separately)                  | Implemented                             | project and workspace blocks mapped independently                                                                                                                    | "parses workspace ..." / "parses project ..." (no single test that holds 1000 vs 5000 side by side, see gaps)   |
| largeFilePaths gitignore syntax, `!` negation, order kept                              | Implemented                             | `z.array(z.string())`, passed through verbatim (no reorder)                                                                                                          | NOT covered: no test with `['generated/**','!generated/small/**']`                                              |
| Exemption does not override excludePaths / allowedPaths / .gitignore / binary          | Out of this audit's scope (code-graph)  | n/a here; docs state it correctly                                                                                                                                    | n/a                                                                                                             |
| Layer merge: scalar later wins, arrays append                                          | Implemented (generic)                   | `config-schema.ts:320-338 deepMergeRawConfig`, applied to workspaces and graph by recursion                                                                          | "cascades graph.maxFileBytes (later scalar wins) and graph.largeFilePaths (arrays append)" (project level only) |
| Unknown graph keys still rejected                                                      | Implemented                             | `.strict()` on both graph schemas                                                                                                                                    | "rejects unknown fields inside the project graph block" (project only)                                          |
| Workspace-level graph requirement: `graph.maxFileBytes`, `graph.largeFilePaths` text   | Implemented                             | as above                                                                                                                                                             | see workspace tests                                                                                             |

### Discrepancies

1. **Upper bound not enforced (huge values accepted)**
   - Description: `maxFileBytes: 1e300` or `1e21` passes validation. The spec says "non-negative integer" so literally compliant, but such a value is a nonsensical byte limit and effectively equals "no limit" while not being `0`; it also flows into the fingerprint and docs say only "non-negative integer".
   - Evidence spec-wrong: spec defines no maximum; a user could argue silence on bounds is deliberate.
   - Evidence code-wrong: probe above; zod `.int()` accepts any finite integral double.
   - Severity: LOW.
   - Recommendation: either add `.safe()` (Number.MAX_SAFE_INTEGER) in the schema and state "safe integer" in spec, or leave and document. No action required for compliance.

2. **Test gap on spec scenarios (not a code defect)**
   - Spec scenarios "Negation within the list is supported", "Workspace value replaces the project value" (both values asserted in one config), "Layers merge" at workspace level, and "Unknown graph keys are still rejected" for the workspace graph block have no dedicated test.
   - Severity: LOW. Recommendation: add 3 small loader tests.

### Test Coverage gaps

- No negation-order test for `largeFilePaths`.
- No workspace-level unknown-key test (only project `unknownKey`).
- No workspace-level cascade test (code path is the same generic merge, so risk is low).
- No test of `-0`, huge, NaN/Infinity (YAML `.inf`, `.nan`) values.
- Rejections of invalid `maxFileBytes` in the "project" test assert only `ConfigValidationError` type, not the message naming the key (workspace "largeFilePaths" tests do assert the message regex).

### Summary

Requirements added/modified: 3 (Project-level graph configuration modified, Workspace-level graph configuration added paragraphs, Graph file size limit added). Implemented 3, Partially 0, Missing 0, Contradicted 0. Discrepancies: 1 LOW (code/spec-silent), 1 LOW test gap. Docs: see cross-cutting section.

---

## core:config-loader

### Requirements Summary

| Requirement / scenario                                                                     | Status      | Evidence                                                                                                                                 | Test                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accept `maxFileBytes`/`largeFilePaths` at project and workspace graph                      | Implemented | `config-loader.ts:473-478`, `642-647`; schema lines above                                                                                | parse tests (project and workspace)                                                                                                                                                                          |
| Expose exactly as declared, no default                                                     | Implemented | spread only when `!== undefined`; arrays passed by reference (no copy; harmless)                                                         | "... undefined when omitted" (both levels)                                                                                                                                                                   |
| Strict structural validation, only 2 new keys                                              | Implemented | `.strict()` retained                                                                                                                     | "rejects unknown fields inside the project graph block"                                                                                                                                                      |
| Reject non-negative-integer violation with `ConfigValidationError` naming key and location | Implemented | `config-loader.ts:276-287`: message is `<formatZodPath(path)>: <zod message>` so it carries e.g. `workspaces.default.graph.maxFileBytes` | Workspace test asserts `ConfigValidationError`; the project "rejects ..." test asserts only the error class. The name-in-message is asserted for largeFilePaths (regex) but not directly for `maxFileBytes`. |
| Layer merge unchanged                                                                      | Implemented | `deepMergeRawConfig`                                                                                                                     | cascade test above                                                                                                                                                                                           |

### Discrepancies

1. **Spec scenario "An invalid limit names the key and its location" is not asserted at test level for maxFileBytes** (only class). Severity LOW. Recommendation: assert `.rejects.toThrow(/workspaces\.default\.graph\.maxFileBytes/)`.
2. None in code.

### Test Coverage gaps

Same as core:config; plus message-content assertion for `maxFileBytes` rejections.

### Summary

Requirements: 1 added. Implemented 1, Partial 0, Missing 0, Contradicted 0. Discrepancies: 1 LOW (test only).

---

## cli:graph-index

### Requirements Summary

| Requirement / scenario                                                                                                            | Status                               | Evidence                                                                                                                                                        | Test                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size-skip: count + applied limit line                                                                                             | Implemented                          | `index-graph.ts:~293-298` (`size limit: N file(s) skipped (larger than graph.maxFileBytes, <limits> bytes)`); distinct `limitBytes` comma-joined as design says | "renders size-skip section with count, limit, files, YAML snippet and memory note in text mode"                                                           |
| Lists largest skipped, project-relative path, human size, cap 10                                                                  | Implemented                          | `CLI_SIZE_SKIP_LIST_MAX = 10`, `slice(0,10)`, `formatSize`                                                                                                      | same + "caps skipped files listing at 10 and prints ... and N more"                                                                                       |
| "... and N more" with N = total - listed, total always shown                                                                      | Implemented                          | `remaining = filesSkippedForSize - listed.length`; result list is capped at 25 (`SIZE_SKIP_LIST_LIMIT`) but N uses `filesSkippedForSize`, so correct for >25    | cap test                                                                                                                                                  |
| YAML snippet with project-root-relative paths, escaping                                                                           | Partially (see D1, D2)               | `escapeGitignorePattern`                                                                                                                                        | escape-gitignore-pattern.spec (4 tests)                                                                                                                   |
| Mentions raising `graph.maxFileBytes`, `0` disables                                                                               | Implemented                          | line `or raise graph.maxFileBytes (0 disables the limit).`                                                                                                      | size-skip test                                                                                                                                            |
| States ~3 KB memory per source byte                                                                                               | Implemented                          | exact line present                                                                                                                                              | size-skip test                                                                                                                                            |
| `sizeExemptAnalysed` listed separately with sizes                                                                                 | Implemented                          | `size-exempt files analysed:` block lists all entries                                                                                                           | "renders separate exempt list when sizeExemptAnalysed is present"                                                                                         |
| Section absent when nothing skipped/exempt; output unchanged                                                                      | Implemented                          | guarded by `filesSkippedForSize > 0` and `sizeExemptAnalysed.length > 0`                                                                                        | "leaves text output unchanged when filesSkippedForSize is 0 ..."                                                                                          |
| Structured modes: new fields in IndexResult, no hint text                                                                         | Implemented                          | `output(result, fmt)` untouched; help text lists 3 new fields (`index-graph.ts:85-87`)                                                                          | "includes size-skip fields in structured JSON format without hints" (JSON only; no toon test)                                                             |
| Command never edits specd.yaml                                                                                                    | Implemented (no write path exists)   | no fs writes in command                                                                                                                                         | No explicit test (design's "specd.yaml untouched" not found)                                                                                              |
| Worker diagnostics: worker-silent warning on stderr (file + duration, suggests excludePaths / lower maxFileBytes), text mode only | Implemented                          | `index-graph.ts:183-189`; handlers registered only when `fmt === 'text'` (`:169`)                                                                               | "prints worker-silent warning on stderr only in text mode"                                                                                                |
| Structured modes: stdout is only the final document                                                                               | Implemented                          | no onProgress/onEvent in json/toon; warnings only to stderr                                                                                                     | test above checks json path                                                                                                                               |
| `resource-disposal-failed` warning (design only)                                                                                  | Implemented                          | `index-graph.ts:172-178`                                                                                                                                        | "prints warning on stderr for resource-disposal-failed progress in text mode"                                                                             |
| Failure in text: cause, last file, stderr tail; exit 3                                                                            | Implemented                          | `index-graph.ts:200-224` (detail only if fmt==='text', via `cliError` -> `handle-error.ts:41-53`)                                                               | "renders worker failure diagnostics with exit code 3 in text mode" (uses cause `resource-limit`, not `native-crash` as in spec scenario; equivalent path) |
| Structured failure: cause + diagnostics as data, no CLI sentence                                                                  | Implemented                          | `metadata: {cause,lastActivity,stdoutTail,stderrTail}`; `handle-error.ts:46-52` adds to JSON payload                                                            | NO TEST for json/toon failure payload                                                                                                                     |
| Events cross worker boundary as JSON values, no new message format                                                                | Implemented                          | `graph-index-task.ts` `announce(...)` / `emitProgress({ event })`                                                                                               | graph-index-task.spec: "routes non-activity events to emitProgress({ event }) and ensures JSON serializability", two announce-threshold tests             |
| Exit code behaviour unchanged (failure 3; success 0)                                                                              | Implemented                          | `process.exit(0)` moved to `index-graph.ts:229`, outside try                                                                                                    | "... renders result ..." asserts `process.exit` called with 0; errors tests assert 3/1                                                                    |
| Modified: CLI reference documentation                                                                                             | Partially / Contradicted (see D3-D5) | docs/cli/cli-reference.md, docs/cli/graph.md                                                                                                                    | doc coverage spec only checks config keys                                                                                                                 |

Pre-existing requirements spot-check (Output format, Error cases, progress rendering, structured modes progress-free, single final document): no regression found. `Indexing: N% phase` rendering unchanged; `'event' in progress` discriminates the widened `CliGraphIndexProgress` union; validation errors still exit 1, runtime errors 3. The `fatal:` prefix is still written to stderr also in json/toon mode (pre-existing `cliError`), stdout stays one document.

`process.exit(0)` placement: correct. With the test host's `ExitSentinel` (process.exit throws) the sentinel from `process.exit(3)` inside the catch propagates and the trailing `exit(0)` is never reached; the sentinel from exit(0) is outside try, so it no longer enters the catch (no double print). Residual hazard: a host that mocks `process.exit` as a non-throwing no-op would, after `cliError` in the catch block, fall through (cliError is typed `never` but would return) to the second `cliError` and then `process.exit(0)`. Test host does not do that; real exit never returns. Not a real-world issue (see D6).

### Discrepancies

**D1. Snippet pattern for a root-level file is not anchored (MEDIUM)**

- Description: Spec says the escaped pattern must match "only that file". A skipped file directly under the project root, e.g. `big.ts`, is emitted as `- big.ts`. In gitignore syntax a pattern without a slash matches at any depth, so it would also exempt `sub/big.ts`, `packages/x/big.ts`, etc. Files with a slash in the path are anchored and fine.
- Evidence spec-wrong: scenario "Special characters are escaped ... pattern matches only that file" speaks of escaping only; the design lists a closed escape set without anchoring. So the spec/design are silent on anchoring.
- Evidence code-wrong: `escapeGitignorePattern` never prefixes `/`; `formatTextIndexResult` uses it directly.
- Recommendation: prefix `/` when the escaped path contains no `/` (or always); add a test; update the design/spec rule.

**D2. Snippet is not YAML-safe for some paths (LOW)**

- Description: entries are printed as plain YAML scalars. A path containing ` #` (space-hash, becomes a YAML comment), `: ` (mapping), or starting with YAML indicators `&`, `%`, `@`, `` ` ``, `'`, `"`, `{`, `-` + space would produce a snippet that is invalid or truncated when pasted. Space-only/leading-space is handled by gitignore escaping (`\ ` plain scalar OK).
- Evidence spec-wrong: spec says "ready to paste into specd.yaml" but only requires gitignore escaping.
- Evidence code-wrong: lines `        - ${escapeGitignorePattern(...)}` with no YAML quoting.
- Severity: LOW (rare paths). Recommendation: single-quote entries (doubling `'`) or use a JSON string; update the spec text and tests accordingly.

**D3. `formatSize` boundary renders `1048575` as "1024 KB" (LOW)**

- Evidence spec-wrong: spec says only "human-readable size"; design mandates `Math.round(bytes/1024)` below 1 MiB, then MB from 1 MiB, so this boundary is design-conformant and pinned by `format-size.spec.ts` ("1048575" -> "1024 KB"). Also a file of 262145 bytes is shown "256 KB" next to a limit printed as `262144 bytes`, which looks like the file is not over the limit.
- Evidence code-wrong: `index-graph.ts` `formatSize`.
- Severity: LOW. Recommendation: round up for KB (Math.ceil) or switch to MB at `>= 1023.5 KB`, show KiB with one decimal near the limit; adjust design + test.

**D4. docs/cli/graph.md and docs/cli/cli-reference.md misdescribe the new result fields (MEDIUM)**

- Evidence docs-wrong: `docs/cli/graph.md:46` says `largestSkippedForSize` is `number | null` ("Size in bytes of the largest skipped file"), `:47` says `sizeExemptAnalysed` is `string[]` of paths; `docs/cli/cli-reference.md:1255` says `largestSkippedForSize` (bytes) and `sizeExemptAnalysed` (paths). `docs/code-graph/use-cases.md:73` also types `largestSkippedForSize: number | null`.
- Evidence truth: `packages/code-graph/src/domain/value-objects/index-result.ts:96-117` and the `--help` schema (`index-graph.ts:86-87`) define arrays of objects `{filePath, projectRelativePath, sizeBytes, limitBytes}` / `{filePath, projectRelativePath, sizeBytes}`. docs/sdk/index.md is neutral.
- Severity: MEDIUM (contradicts spec requirement "CLI reference documentation" accuracy and the IndexResult). Recommendation: correct all three places; text description should say "the ten largest" not "the largest skipped file".

**D5. Failure-cause names and warning text in docs do not match code/spec (MEDIUM)**

- Evidence docs-wrong: `docs/cli/cli-reference.md:1268-1269` and `docs/cli/graph.md:54` list `start-error`, `task-execution`, `protocol-failure`, `progress-handler-failure`; `docs/sdk/index.md:316,319` also uses `start-error`, `protocol-failure`. The spec closed set is `start-failed, task-contract, task-error, protocol, cancelled, native-crash, resource-limit, exited` (design.md:346 region and spec). Documented warning text `Warning: Indexing worker has been silent for 10s (processing <file>)` (`cli-reference.md:1266`, `graph.md:50`) differs from the real `warning: no progress for Ns while processing <file>. If that file is not needed, add it to graph.excludePaths or lower graph.maxFileBytes.` (`index-graph.ts:186`).
- Severity: MEDIUM. Recommendation: align docs with the closed cause set and the actual message (also in docs/sdk/index.md - sdk spec auditors should cross-check).

**D6. cliError fall-through pattern (LOW, informational)**

- `cliError(...)` for the diagnostics branch is followed by a second `cliError` (`index-graph.ts:201-225`) relying on `never`. With a non-exiting mock this would double-print. Existing tests use a throwing sentinel. Recommendation: add `return`/`else` or keep as is; no spec requirement.

**D7. Spec scenario text vs test: native-crash (LOW)**

- Spec scenario names `native-crash`; the CLI test uses `resource-limit` (CLI treats causes opaquely, so behaviour is identical). Recommendation: parameterise the test over a native-crash diagnostics object too.

### Test Coverage gaps (cli:graph-index)

- No json failure payload test (`result: 'error'`, `metadata.cause`, tails; `detail` absent in structured mode).
- No `toon` mode test for size fields / absence of hints / absence of warnings.
- No test that `process.exit(0)` is not called on failure, nor that stdout is exactly one document when `worker-silent` arrives in json mode (the "only in text mode" test checks handler registration/behaviour for text; confirm for json asserts `onEvent` undefined).
- No test that `specd.yaml` is unchanged.
- Escape tests do not cover: trailing-space-only path `' '`, path with both `\` and leading `!`, leading `!` plus trailing space, root-level unanchored path (D1), YAML-significant characters (D2).
- Formatting boundaries 1048575/1048576 are tested; 1023/1024 tested; `262145` presentation not discussed.
- Cap test: >25 skipped (result list limit 25 vs total) not verified that N uses the total.

### Summary

Added/modified requirements: 2 added (Size-skip summary and hint, Worker diagnostics presentation) + 1 modified (CLI reference documentation). Implemented 2 (code behaviour), Documentation requirement Partially (docs exist and cover all items but contain factual errors D4, D5). Missing 0, Contradicted 0 in code. Discrepancies: 0 HIGH, 3 MEDIUM (D1, D4, D5), 4 LOW (D2, D3, D6, D7). Pre-existing requirements: no regressions.

---

## Cross-cutting: documentation, changesets, global specs

Docs check (fields, defaults, semantics) - all correct and consistent with specs:

- docs/guide/configuration.md: both keys documented for project and workspace; type, default 262144 (256 KiB), `0` disables, scalar replaces, array appends, exemption only bypasses the size limit. Satisfies `configuration-coverage` requirement. OK.
- docs/guide/configuration-examples.md, docs/guide/workspaces.md: examples correct (project-root base vs `codeRoot` base). OK.
- docs/core/ports.md: interface shapes and semantics correct; says "default 262144" at config level even though config exposes the field as absent (spec: code graph applies the default). LOW wording issue: should say "when omitted the code graph applies 262144".
- docs/cli/cli-reference.md and docs/cli/graph.md: cover config fields, the large-file example, summary and failure causes as the modified requirement demands, but with the errors D4/D5; text says "reports the largest skipped file" where the CLI lists up to ten.
- docs/code-graph/use-cases.md:73: wrong type of `largestSkippedForSize` (D4).

Changesets (`.changeset/20261026-bound-indexer-ast-resource-lifecycle.md` and `-specd.md`): consistent pair (`@specd/core|code-graph|sdk|cli` minor; `@specd/specd` minor), both list the affected specs including `core:config`, `core:config-loader`, `cli:graph-index`, and state the default-256-KiB behaviour change with the `maxFileBytes: 0` / `largeFilePaths` escape. Observation: they do not list `@specd/skills`/plugins etc. (not changed here). The first-run rebuild consequence noted in the design (fingerprint mismatch) is not in the changeset (LOW).

Consistency with global specs: `default:_global/architecture` / conventions: zod schema in core application ports, options optional via conditional spreads (exactOptionalPropertyTypes friendly), JSDoc present on new public interface members and exported helpers `formatSize`, `escapeGitignorePattern`, `formatTextIndexResult` (exports added only for tests; acceptable). `_global/testing`: new tests follow Given/When/Then-ish style; tests live under `test/commands/graph/`, whereas the design named `test/commands/graph/index-graph.spec.ts` (actual coverage sits in `test/commands/graph-index.spec.ts` plus helper specs; LOW deviation from design only). The spec-lock files `specs/core/change-manifest/spec-lock.json` and `specs/core/config-writer-port/spec-lock.json` are modified in the working tree; outside the 3 audited specs but should be confirmed as intended by the aggregator.
