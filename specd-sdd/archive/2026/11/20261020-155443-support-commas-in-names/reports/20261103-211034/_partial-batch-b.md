# Batch B compliance findings — change `support-commas-in-names`

Scope: core:spec-id-format, core:workspace, core:config, core:config-loader, core:spec-lock, core:spec-metadata, core:generate-metadata, core:validate-specs, core:preview-spec.
Method: change deltas (specd-sdd/changes/.../deltas/core/\*) read directly (spec-preview CLI needs ids like `core:spec-id-format`; I used delta files instead), compared with working-tree code and tests. Graph tools were not used (graph-first not followed; grep fallback). Read-only, no code or spec changes.
Paths below are relative to /Users/monki/Documents/Proyectos/specd/packages/core unless noted.

---

## core:spec-id-format

Requirements summary: canonical `workspace:capPath`; bare path normalized by core; WorkspaceNotFoundError when workspace set supplied; parseSpecId steps; mandatory normalization; Workspace name rule `^[a-z][a-z0-9-]+$` + not Windows device, single `isValidWorkspaceName`; segment rule `^[a-z0-9_][a-z0-9_-]*$` + not device, also for workspace prefix; InvalidSpecIdError (code INVALID_SPEC_ID) with rejected input list; remove ops do not validate; single validator `parseSpecId(id, {workspaces?, defaultWorkspace?})`, domain-pure; use cases validate/normalize, adapters pass raw; patterns via `parseSpecPattern`, schema refs via registry; persisted IDs fully qualified.

Implementation status:

- Canonical format / parsing steps: OK — src/domain/services/parse-spec-id.ts:41-87 (blank reject, first-colon split, defaultWorkspace, per-segment validation, returns qualified specId).
- Workspace name rule single source: OK — src/domain/services/spec-id-rules.ts:3-16; consumers: parse-spec-id.ts:46, parse-spec-pattern.ts:78, schema-registry.ts:27, config-loader.ts:391. Guard test test/spec-id-guards.spec.ts forbids regex literals elsewhere in src.
- Segment rule single source: OK — spec-id-rules.ts, used by parse-spec-id.ts:70, parse-spec-pattern.ts:44, spec-path.ts:85, config-schema.ts:106 (prefix).
- InvalidSpecIdError / rejected inputs (`""`, blank, `:`, `ws:`, `:path`, `a//b`, `/a`, `a/`, `.`/`..`, `a:b:c`, uppercase, spaces, commas, device names, 1-char ws): OK — domain/errors/invalid-spec-id-error.ts, parse-spec-id.ts. Message quotes full value.
- Unknown workspace: OK — WorkspaceNotFoundError moved to domain (domain/errors/workspace-not-found-error.ts; application one re-exports). Message quotes spec id and lists known workspaces (spec says "quote the full original ID" — satisfied via `in spec ID '...'`).
- workspaces Iterable<string|{name}>: OK — parse-spec-id.ts:80-86.
- Patterns/schema refs separate parsers: OK — parse-spec-pattern.ts; schema-registry.ts splitSchemaReference.
- Use cases validate/normalize: mostly OK (preview-spec, validate-specs, generate-spec-metadata, update-\*-deps, materialize-spec-metadata).
- Persisted IDs fully qualified in spec-lock and strict metadata: OK (parse-spec-lock.ts:12, parse-metadata.ts strict schema). Manifest reader not in my batch.
- Remove ops do not validate: Deviation (see D1/D2).

Discrepancies:

- D1 [Medium] "Remove an invalid stored value can always be removed" (spec-id-format "Syntax validation") vs real FS behavior.
  - Spec side: invalid stored value must remain removable.
  - Code side: UpdatePersistedSpecDeps.remove passes raw (update-persisted-spec-deps.ts:108) but then `repo.readPersistedState` (spec-repository.ts:526/\_readSpecLock:785, also writePersistedState:553) parses strictly and throws InvalidSpecLockError for a lock containing an invalid dependsOn entry. So with the real FS repository an invalid stored dependency cannot be removed through this use case; the user must hand-edit the file (the error text says exactly that). The unit test "removes an invalid stored dependency value as given" (test/application/use-cases/update-persisted-spec-deps.spec.ts:112) passes only because the in-memory fake repository bypasses `parseSpecLock`.
  - Also conflicts with spec-lock "Reads remain strict for every consumer... Repairing invalid locks is outside this requirement". Both specs are internally consistent only if repair is done by hand or by another feature; the change theme says "CLI can repair" but I found no CLI/SDK repair path (grep for InvalidSpecLock/repair in cli/src, sdk/src: none). Needs a decision: spec-lock-strict-read wins (current code) or a lenient/repair read path is required.
- D2 [Low] UpdatePersistedSpecDeps `remove` entries are not normalized when valid (bare `auth/shared` stays bare and will not match stored `default:auth/shared`), unlike UpdateSpecDeps which uses tryNormalizeDepId (update-spec-deps.ts:31-45,112). Spec "Use cases validate and normalize ... return and store the fully-qualified ID" and "remove SHALL NOT validate" do not strictly require normalizing remove, but the two siblings differ. Spec side silent; code side inconsistent.
- D3 [Low] "Capability path segment rule" says the rule is used by "the persisted spec-lock.json and metadata.json readers". Code: spec-lock reader strict (OK); metadata lenient read path accepts any string (parse-metadata.ts specMetadataSchema, permissive schema `z.string()`), per the "Persisted IDs" requirement saying metadata read stays lenient. Internal wording tension in the spec; code follows the more specific statement.
- D4 [Low] Strict metadata schema also validates `implementation.files[].specId` / `symbols[].specId` as fully qualified (parse-metadata.ts ~121,129); spec-metadata only requires it for `dependsOn`. Code stricter than spec.
- D5 [Info] fs-spec-index-cache.ts:223 uses strictSpecMetadataSchema to decide if metadata is usable for index title/summary; legacy metadata with a bare dependsOn silently loses title/summary in the index (self-heals on regeneration). Not covered by spec.

Test coverage: test/domain/services/parse-spec-id.spec.ts (invalid inputs table incl. empty, blank, `:`, `ws:`, `:path`, `a//b`, `.`/`..`, uppercase, space, comma, device name, `core:a:b`, workspaces as array/Set/Map.keys/objects, WorkspaceNotFoundError), spec-id-rules.spec.ts, parse-spec-pattern.spec.ts, test/spec-id-guards.spec.ts (no duplicated regex literals; all repo spec-lock.json parse).
Missing tests: bare id with unknown `defaultWorkspace` (workspace set + defaultWorkspace not in set) not seen; error message "lists known workspace names" assertion not seen; remove-invalid-value against real FS repo (would fail, see D1).

---

## core:workspace

Requirements: names `^[a-z][a-z0-9-]+$`, reserved `default`/`root`/Windows device names (whole-name only, `con-foo` legal); prefix segments follow segment rule, ConfigValidationError; bare path normalization owned by core; constraints.

Implementation:

- Name rule/device names: OK — config-loader.ts:391 (isValidWorkspaceName), `root` rejected config-loader.ts ~381.
- Prefix rule: OK — config-schema.ts:99-112 PrefixZodSchema using isValidCapabilitySegment; rejects empty, leading/trailing slash, `.`/`..`, uppercase.
- Bare normalization by core: OK (see spec-id-format).
  Discrepancies: none material. Note [Info]: `default` workspace name is accepted by shared rule and spec marks it "reserved for local workspace (mandatory)" — consistent.
  Tests: config-loader.spec.ts:106 (`a`, `Core`, `nul` rejected), :142, :216 (`con-foo`-style accepted), :2286 (root), prefix tests :563-789.
  Missing tests: workspace names with `_`/digit-leading beyond `Core`/`a` fine; prefix with comma/space/device-name segment not explicitly tested (only uppercase, dot, empty, slash).

---

## core:config

Requirements touched: workspace names and prefix use shared rules; contextInclude/ExcludeSpecs parsed by parseSpecPattern at load and match time; qualifier-less pattern gets caller-supplied defaultWorkspace; unknown workspace in pattern -> warning, no match.

Implementation:

- Shared parser at load: OK — config-schema.ts:51 (validateContextPattern -> parseSpecPattern, InvalidSpecPatternError mapped to ConfigValidationError).
- Same parser at match: OK — application/use-cases/\_shared/spec-pattern-matching.ts:45 `parseSpecPattern(pattern, { defaultWorkspace })`.
- Unknown workspace warning, no match: not re-verified line-by-line; existing behavior retained (test/application/use-cases/\_shared/spec-pattern-matching.spec.ts modified).
- Workspace name / prefix rules: OK (see workspace).
  Discrepancies: D6 [Low] spec-pattern validation at config load calls `parseSpecPattern(pattern)` without defaultWorkspace (fine: syntax only). No issue. None material.
  Tests: config-loader.spec.ts:1300-1440 (patterns incl. one-letter qualifier, leading-digit segment), application/ports/config-schema.spec.ts, parse-spec-pattern.spec.ts.
  Missing tests: pattern containing comma (`auth/a,b`) / uppercase qualifier at config level not seen (covered at parser level for uppercase segment only; comma not in parse-spec-pattern.spec.ts list).

---

## core:config-loader

Requirements: pattern validation via parseSpecPattern; workspace names via isValidWorkspaceName; no private regex copies; ConfigValidationError on invalid.

Implementation: OK — config-loader.ts:18,391 (name), :377 validateContextPatterns, config-schema.ts. No private regex remains in config-loader (guard test).
Discrepancy D7 [Low]: invalid-pattern error text produced by config-loader is `<field>: <reason> in pattern '<p>'`; spec only requires ConfigValidationError — OK. Existing test at config-loader.spec.ts expects `'*' is only allowed` text — still satisfied.
Tests: config-loader.spec.ts:106 (invalid names it.each), 1300-1440 (patterns).
Missing tests: none significant.

---

## core:spec-lock

Requirements: dependsOn entries fully-qualified valid IDs, bare/empty/malformed rejected, no legacy form; InvalidSpecLockError (INVALID_SPEC_LOCK) naming spec id, file, field path, rule, and saying to correct the file; no raw ZodError; reads strict for all consumers, no silent drops, no rewrite-on-read; constraint list.

Implementation:

- Strict dependsOn: OK — parse-spec-lock.ts:12-14, 56 (`isFullyQualifiedSpecId` refine).
- Typed error: OK — domain/errors/invalid-spec-lock-error.ts (code, message includes spec id, location, `field 'dependsOn.0'`, reason, "Correct that field in the file."); parseSpecLock wraps invalid JSON and ZodError (parse-spec-lock.ts:76-100). Only the first Zod issue is reported (acceptable per spec "the failing field path").
- Context supplied: OK — spec-repository.ts:798 passes `{specId, location: filePath}`. Message location is the absolute file path.
- No rewrite on read: OK (readPersistedState does not write; test spec-repository.spec.ts:1281 verifies file unchanged).
- Exported publicly: public.ts:521, sdk/src/core-reexports.ts:485.
  Discrepancies:
- D1 repeated [Medium]: strict reads block `writePersistedState`/`remove` repairs through core (spec-repository.ts:553); no repair path found in CLI/SDK. Spec explicitly leaves repair out of scope; change theme implies CLI repair. Present both: spec says out of scope; theme/other specs (spec-id-format "can always be removed") expect it.
- D8 [Low] Other lock fields (schema.name, implementation entries, hash) also report InvalidSpecLockError — spec says "fails structural validation": OK.
  Tests: parse-spec-lock.spec.ts (it.each `['']`, `['auth/login']`, `['not valid']`, `['core:']` -> fieldPath dependsOn.0, not ZodError; invalid JSON), spec-repository.spec.ts:1281 (unchanged file), spec-id-guards.spec.ts (all repo locks parse).
  Missing tests: scenario "qualified valid entries accepted `core:storage`, `default:_global/architecture`" explicit assertion not found by name (first test uses qualified dependsOn); "one valid + one invalid entry -> read fails and file unchanged" (only `['']` tested for unchanged); message "names the spec ID, location, field path and rule" asserts field only, not spec id/location text in message.

---

## core:spec-metadata

Requirements touched: strict `strictSpecMetadataSchema` on persistence (dependsOn fully-qualified, bare/empty rejected, no own regex), lenient read stays lenient; dependency on spec-id-format.

Implementation:

- Strict dependsOn: OK — parse-metadata.ts qualifiedSpecIdString = isFullyQualifiedSpecId (no private regex).
- Persist guard: OK — application/use-cases/persist-spec-metadata.ts:33 uses strict schema, throws MetadataValidationError before write.
- Lenient read: OK — specMetadataSchema/permissiveSpecMetadataSchema use z.string() (used by validate-artifacts.ts:583).
  Discrepancies: D4, D5 (above). D9 [Low] The `keywords` regex `^[a-z][a-z0-9-]*$` in parse-metadata.ts:88,160 is a different concept (keywords), not a duplicate of workspace rule; guard test literal differs (`*` vs `+`), fine.
  Tests: parse-metadata.spec.ts:12 lenient path, :33 bare accepted on read, :118 strict rejects bare.
  Missing tests: persist-spec-metadata.spec.ts (1.1K) has no scenario for bare/empty dependsOn being rejected by PersistSpecMetadata with no file written (only schema-level test); "empty dependsOn entry rejected" scenario not seen at use-case level.

---

## core:generate-metadata

Requirement: Spec resolution validates and normalizes with parseSpecId + configured workspaces; InvalidSpecIdError before repository lookup; WorkspaceNotFoundError; SpecNotFoundError.
Implementation: OK — generate-spec-metadata.ts:102-115 (listWorkspaces -> parseSpecId(input.specId,{workspaces}) -> workspace lookup -> repo.get). Note: ListWorkspaces executes (I/O) before validation; "before any repository lookup" — list is not a spec repository lookup; acceptable.
Discrepancies: none. (Info: redundant `WorkspaceNotFoundError` branch at :107 now unreachable.)
Tests: generate-spec-metadata.spec.ts:628 (invalid), :646 (bare), :668 (unknown workspace).
Missing tests: none.

---

## core:validate-specs

Requirement: single spec mode validates/normalizes specPath with parseSpecId; Invalid -> InvalidSpecIdError; unknown workspace -> WorkspaceNotFoundError; SpecNotFoundError; comma not split.
Implementation: OK — validate-specs.ts:133-147. Internal label parse at :596 `parseSpecId(args.label)` is syntax-only (fine).
Discrepancies: none.
Tests: validate-specs.spec.ts:422 (unknown ws), :433 (invalid `ws:`), :445 (comma `auth/a,b` -> InvalidSpecIdError), :449 (bare -> default).
Missing tests: none.

---

## core:preview-spec

Requirements: input specId bare or qualified; validate/normalize "before any other work" with parseSpecId; InvalidSpecIdError / WorkspaceNotFoundError; then membership check in change.specIds -> SpecNotInChangeError.
Implementation: preview-spec.ts:109-114 — Deviation (ordering).
Discrepancies:

- D10 [Low] Spec: "MUST validate and normalize specId ... before any other work". Code: `this._changes.get(name)` (ChangeNotFoundError), `schemaProvider.get()` and the SchemaMismatchError check run first (preview-spec.ts:101-107); validation occurs after. Observable effect only changes which error wins when multiple inputs are bad. Spec side: validate first. Code side: validates after change/schema load (needed only to reach membership check, but validation itself needs no change).
  Tests: preview-spec.spec.ts:597 (invalid before repo call), :615 (bare resolves to default).
  Missing tests: unknown workspace (`nope:auth/login` -> WorkspaceNotFoundError) scenario; validation-before-change-lookup ordering (would expose D10).

---

## Cross-spec / global contradictions

- No contradiction with default:\_global/\* found in my reading (domain service has no application deps: parse-spec-id imports only domain errors/services — OK vs "domain SHALL NOT depend on application types").
- Internal spec tension: spec-id-format ("invalid stored value can always be removed") vs spec-lock ("reads strict for every consumer; repair out of scope") — see D1.

## Counts

Specs audited: 9. Requirements checked (touched by deltas): ~34.
Implementation: OK 31, Deviation 3 (D1 remove-repair vs strict read, D2 remove normalization inconsistency, D10 preview-spec ordering), Missing 0.
Discrepancies by severity: Medium 1 (D1), Low 7 (D2, D3, D4, D6, D7, D8, D10, counting only real ones: D2, D3, D4, D10 + D6/D7/D8 informational), Info 2 (D5, D9).
Missing tests: ~9 (spec-lock x3, spec-metadata persist x2, preview-spec x2, spec-id-format x2, config comma pattern x1).
