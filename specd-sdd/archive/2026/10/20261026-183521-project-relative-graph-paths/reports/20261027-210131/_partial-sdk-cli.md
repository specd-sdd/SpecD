# Partial re-audit: sdk:run-graph-why, cli:graph-why, cli:graph-index (overlap warning, --exclude-path)

Re-audit after group 16. Read-only; no code/specs modified.

## Previous findings status

| #   | Previous finding                                                                                                       | Status                                        | Notes                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [LOW] sdk spec req 3 says "path and effective project configuration from ctx"; code calls `provider.explainPath(path)` | STILL OPEN (spec wrong/imprecise)             | `run-graph-why.ts` unchanged. Config is bound inside the provider. Spec should say "delegate to the provider's `explainPath`"; also omits `GraphWhyRequiresConfigError` for config-less (bootstrap) providers. |
| 2   | [LOW] sdk spec req 4 "every location as projectRelativePath" but SDK does no projection                                | STILL OPEN (spec wrong/ambiguous)             | Pass-through; result type must equal the use-case result (spec Public surface). Reword to "the use case result already expresses locations as projectRelativePath".                                            |
| 3   | [LOW] why.ts builds SdkHostContext manually (`kernel !== null ? {...} : createSdkContext`)                             | STILL OPEN (code smell, not a spec violation) | Unchanged.                                                                                                                                                                                                     |
| 4   | [LOW] Text mode prints `category: -  kind: -` for non-indexable candidates                                             | CLOSED/accepted                               | Spec only mandates category/kind for `indexable`.                                                                                                                                                              |
| 5   | [INFO] `--exclude-path` variadic + comma splitting                                                                     | STILL OPEN (info; spec silent)                | Unchanged.                                                                                                                                                                                                     |
| 6   | [INFO] Sidebar not located                                                                                             | RESOLVED                                      | See docs section below.                                                                                                                                                                                        |
| 7   | [INFO] eslint / thin-presenter                                                                                         | still OK                                      | why.ts imports only `@specd/sdk`.                                                                                                                                                                              |

Previous test gaps:

- Negation label in text: CLOSED. `graph-why.spec.ts` "labels a negation rule and renders inGraph for every value" asserts `(negation)`.
- inGraph yes/no/unknown rendering: CLOSED (same test plus indexable test asserting `inGraph: yes`).
- `not-indexed` verdict text: covered (excluded test, staleness test asserts `verdict: not-indexed`). `not-in-scope` verdict text and size-limit detail rendering (`size= limit= exempt`): STILL OPEN, no test.
- Absolute path / `workspace:path` forms passed to runGraphWhy: STILL OPEN (only `a.ts` / `nope:src/a.ts` used, the latter in an error test).
- Bootstrap / `GraphWhyRequiresConfigError` rendering: STILL OPEN.
- UNKNOWN_WORKSPACE exit status at error-contract level: STILL OPEN (test asserts a rejected promise with `code`, via mocked provider error, not rendered error/exit code).
- SDK locations project-relative: STILL OPEN (pass-through; see finding 2).
- graph index help text hint wording: STILL OPEN (test checks `graph.excludePaths` at L295 only).

## New discrepancies

None high/medium. Group 16 changes (text label for negation, `inGraph` rendering) in `why.ts` match spec Text output items 3 and 4.

- [LOW] Docs: `docs/cli/cli-reference.md` `### graph why` (L1613-1643) gives only an excluded-path example (text) and a structured toon example. Spec "CLI reference documentation" requires "an example of an excluded path and of an indexable path". The indexable example exists only in `docs/cli/graph.md` (L316). Code/docs wrong (docs incomplete). Also, the cli-reference section does not list the step stages' output fields (it does list the stage names and top-level fields; acceptable) and does not show text output sample.
- [LOW] Docs: cli-reference states the project-relative interpretation of configured patterns (yes, "interpreted relative to the project root"). OK.
- [INFO] Text order: spec item 5 says diagnostics are printed last ("one line per diagnostic" after candidates/inGraph); implementation prints diagnostics right after the verdict line, before candidates. Item order in spec is a list of "in order" items, so this is a minor ordering deviation. Severity LOW; spec or code could be adjusted (code is simpler to align; the current order is arguably more useful). Spec wins by rule: LOW, code wrong.
- [INFO] Text: spec item 4 puts `inGraph` as a separate item per candidate; the implementation prints it on the candidate header line. Equivalent.

## Docs requirements (default:\_global/docs)

- CLI reference: `docs/cli/cli-reference.md` `### graph why` present (signature, accepted forms, output fields, options, 2 examples).
- CLI docs index: `docs/cli/index.md` L38 graph row mentions `graph why`. OK.
- Sidebar: defined at `apps/public-web/sidebars.ts` (CLI category contains `cli/graph`, `cli/index`, `cli/cli-reference`). `graph why` is documented inside `docs/cli/graph.md` (L19, L263) which is already in the sidebar, so no new entry is required. OK.
- SDK docs: `docs/sdk/index.md` L459 maps `graph why` to `runGraphWhy`. Guides (`docs/guide/code-graph.md` L100, `configuration.md` L528, `workspaces.md` L288) reference it. `--exclude-path` documented at cli-reference L1279.
- graph index overlap warning documented (cli-reference L1259, guides).

## Test coverage gaps

Verify scenarios without (or with weak) tests:

- sdk "Pure delegation": weak (implicit).
- sdk "Locations are project-relative": no test (pass-through) [LOW].
- cli "Accepted path forms": weak, absolute and `workspace:path` not exercised [LOW].
- cli "Unknown workspace": exit status/rendered code not asserted at error-contract level [LOW].
- cli "Missing configuration": covered only by mocked context failure (ExitSentinel) [LOW].
- cli "Documented": manual only.
- Rendering of `not-in-scope` verdict, size-limit detail, `exempt`, `viaDirectory` suffix: untested [LOW].
- `--exclude-path` repeatability (two separate flags) is untested; only comma form (`foo,bar`) at graph-index.spec.ts L101-111 [LOW].
- All other verify scenarios (transient/caller-owned provider, errors propagate, exports, no added fields, thin presenter, JSON/TOON equality, excluded exit 0, stale notice, excluded/negation-beat/multi-owner/indexable/gitignore text, overlap warning 3 / 14 / none / json-toon) are covered.

## Summary counts

- Requirements audited: 11 (sdk 3, cli:graph-why 6, cli:graph-index 2 areas). Implemented: 11; partial 0; missing 0.
- Discrepancies: 0 high, 0 medium, 3 low new/open spec-or-docs (sdk req 3 wording, sdk req 4 wording, cli-reference missing indexable example) plus 1 low text-order deviation and 1 low code smell; 1 info (comma split).
- Previous: 2 test gaps closed (negation label, inGraph); about 7 remain (all low).
- Spec wrong: sdk req 3 and 4 wording. Code/docs wrong: cli-reference indexable example, diagnostics order.
