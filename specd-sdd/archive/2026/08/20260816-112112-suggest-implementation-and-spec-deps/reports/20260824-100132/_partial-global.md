# Compliance Audit Partial — global conformance

Change: `suggest-implementation-and-spec-deps` (verifying) · Auditor: read-only subagent · Date: 2026-08-24
Scope: six change specs (`cli:spec-implementation`, `cli:spec-deps`, `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`, `code-graph:language-adapter`, `code-graph:graph-store`) vs `default:_global/*` + code spot-checks.

## Global rules checked (per global spec)

- **`default:_global/architecture`** — hexagonal layering (domain pure, application ports-only, only `composition/` imports `infrastructure/`); manual DI / no module-level singletons; ports with shared construction are abstract classes with explicit methods; curated public barrels (`"."` MUST NOT export concrete adapter classes or infrastructure implementations; sdk exposes `"."`, `"./ports"`, `"./extensions"`); one-way package dependency direction; delivery hosts must not depend on both core and code-graph when sdk covers needs; adapter packages contain no business logic.
- **`default:_global/conventions`** — strict TS, ESM-only (NodeNext, `.js` import suffixes), named exports only, kebab-case files, no `any`, explicit return types on public functions, errors extend `SpecdError`, underscore private backing fields, lazy loading metadata-before-content, immutability preference.
- **`default:_global/testing`** — Vitest; tests in `test/` mirroring `src/` with `.spec.ts` suffix matching source file name; unit tests mock ports; port mocks fully implement the port — "No partial mocks with `as unknown as Port`"; infra integration tests use `os.tmpdir()` + unique dir + `afterEach` cleanup; no snapshot tests.
- **`default:_global/error-handling-conventions`** — Specd Error Contract (`specd = true`, machine-readable `code`), core mandate (`SpecdError` base), monorepo package mandate (package bases extend `SpecdError`; e.g. `SpecdCodeGraphError`), `UPPER_SNAKE_CASE` codes.
- **`default:_global/docs`** — every command documented in `docs/cli/`; output-contract changes update the reference in the same change; JSDoc on all symbols.
- **`default:_global/eslint`** — enforces conventions incl. layer boundaries and JSDoc.
- **`default:_global/logging`** — no direct `console.*` in production code; use logging abstraction.
- **`default:_global/spec-layout`, `default:_global/commits`** — consulted for context (spec structure of merged previews; commit hygiene of change commits).

## Findings (rule → affected change spec(s) → verdict → evidence)

### F1 · Public `"."` barrel exports concrete infrastructure adapters — **VIOLATION**

- **Rule:** architecture — "Public `'.'` barrels MUST NOT export concrete adapter classes or infrastructure implementations" (applies explicitly to `@specd/sdk`).
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies` (introduce the adapters and their barrel exposure).
- **Evidence:** `packages/sdk/src/index.ts:62-65` exports `FsImplementationSuggestionCache` and `FsSpecDepsSuggestionCache` from `./infrastructure/fs/index.js`.
- **Hypotheses:** (a) _Global drift_ — hosts may now be expected to swap cache backends, warranting an intentional export carve-out; but `_global/architecture` was not updated to permit it. (b) _Change non-conformance_ (favored) — commit `0decdcf0` ("scope cache exports to dedicated barrels") moved caches out of `orchestration/index.ts` yet kept the root-barrel re-export, leaving the global rule breached.

### F2 · Orchestration layer imports/instantiates infrastructure directly — **VIOLATION** (with a change-spec clause that itself contradicts the global)

- **Rule:** architecture — application/orchestration interacts through ports only; "Only `composition/` may import from `infrastructure/`"; constraints: "`application/` must not import from `infrastructure/`".
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`.
- **Evidence:**
  - `packages/sdk/src/orchestration/suggest-implementation-links.ts:37` imports `FsImplementationSuggestionCache`; `:359-366` constructs it inside `execute()` as default when no cache dep injected. Same at `:1576` in the resolver helper.
  - `packages/sdk/src/orchestration/suggest-spec-dependencies.ts:31,33` imports both Fs caches; `:302` and `:941` construct them; `:846-847` performs direct `mkdir`/`writeFile` for `.specd-exploration.md`.
  - The merged change specs codify the deviation: _"Candidate file existence validation … is permitted as a lightweight infrastructure concern within the orchestration layer"_ and _"Alignment change scaffolding … permitted as a lightweight infrastructure concern"_ — these clauses contradict `_global/architecture` as written.
- **Hypotheses:** (a) _Global drift_ — three-way conflict shows drift: `_global/architecture` allows layered packages with composition; sibling workspace spec `sdk:composition` forbids `infrastructure/` in the SDK entirely ("no `infrastructure/` or `domain/` directories exist") while this change adds `application/ports` + `infrastructure/fs`; the globals likely predate SDK orchestration-with-defaults patterns. (b) _Change non-conformance_ — defaults could be wired exclusively via `resolveXxxDeps(resolver)` so `execute()` never touches `infrastructure/`. Either way, the change specs and `sdk:composition` need reconciliation.

### F3 · Module-level memoized singleton in orchestration — **borderline violation**

- **Rule:** architecture constraint — "Use cases receive all dependencies via constructor — no module-level singletons, in any package."
- **Affected:** `sdk:suggest-implementation-links`.
- **Evidence:** `packages/sdk/src/orchestration/suggest-implementation-links.ts:165` `let cachedBuiltinRegistryData` lazily memoizes built-in adapter registry data across all use-case instances (consumed at `:700`).
- **Hypotheses:** (a) _Drift/tolerance_ — it caches immutable lookup data (extensions/keywords), not an injected service, arguably outside the rule's anti-singleton intent. (b) _Strict reading_ — state persists module-wide instead of arriving via constructor deps.

### F4 · Partial port mocks cast with `as unknown as Port` in tests — **VIOLATION**

- **Rule:** testing — "Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`."
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies` (their verify suites).
- **Evidence:** `packages/sdk/test/orchestration/suggest-implementation-links.spec.ts:142-146` (`{ list, get, artifact } as unknown as SpecRepository`); `suggest-spec-dependencies.spec.ts:179, 513, 661, 791`.

### F5 · Change-spec constraint "No dependency on @specd/core" contradicts globals and its own requirements — **change-spec inconsistency (spec drift favored)**

- **Rule:** error-handling-conventions — monorepo package mandate requires package base errors to extend `SpecdError` (i.e., `SpecdCodeGraphError extends SpecdError`), which presupposes a core dependency; architecture's dependency graph omits `code-graph` entirely (global drift), while repo guidance sanctions `code-graph → core`.
- **Affected:** `code-graph:language-adapter`, `code-graph:graph-store` (both list "- No dependency on `@specd/core`" under Constraints).
- **Evidence:** `packages/code-graph/package.json` declares `"@specd/core": "workspace:*"`; `src/domain/errors/specd-code-graph-error.ts:1` imports `SpecdError` from `@specd/core` (pre-existing, 2026-05-22); `src/domain/value-objects/index-options.ts:1-2` imports core types into the domain layer; and the language-adapter spec's own requirement that `createBuiltinAdapterRegistry` accept `config: SpecdConfig` forces a core type import (`src/composition/use-cases/create-builtin-adapter-registry.ts:7`). The deltas for both specs were modified within this change (`specs/code-graph/*/spec.md.delta.yaml` in commit `a5f96629`) without fixing the stale constraint.
- **Hypotheses:** (a) _Spec drift_ (favored) — the constraint line means "adapter/store logic must not depend on core domain", but as written it conflicts with the global error taxonomy and the spec's own factory requirement. (b) _Non-conformance_ — code violates the letter of both change specs.

### F6 · CLI declares direct runtime dependency on `@specd/code-graph` and imports its internal barrel — **VIOLATION** (per architecture verify scenario), forced by an SDK barrel gap

- **Rule:** architecture — verify scenario: `packages/cli/package.json` must declare `@specd/sdk` and `@specd/core`/`@specd/code-graph` must be absent; delivery hosts import host-adapter symbols via `@specd/sdk` (see also `sdk:composition`).
- **Affected:** `cli:spec-implementation`, `cli:spec-deps` context (host import policy governing the commands' package); `sdk:suggest-*` (barrel completeness).
- **Evidence:** `packages/cli/package.json` lists `"@specd/code-graph": "workspace:*"` (added in `b86b81c1`, dated 2026-08-16 — same day as this change's creation); `packages/cli/src/commands/graph/index-graph.ts:3` imports `acquireGraphIndexLock` from `@specd/code-graph/internal`. `acquireGraphIndexLock`/`assertGraphIndexUnlocked` are **not exported from `@specd/sdk`** (grep over `packages/sdk/src` returns nothing), so the internal-barrel import is forced by a missing re-export rather than necessity.
- **Hypotheses:** (a) _Global drift_ — the lock helpers were never surfaced through the SDK barrel, making direct internal import pragmatic; the global rule then needs either the barrel fix or an exception. (b) _Change non-conformance_ — the change should have added the re-exports to `@specd/sdk` and dropped the CLI dep/import in the same change. Note nuance: literal requirement text bans depending on "**both** core and code-graph" — CLI has code-graph only, so the requirement prose passes while its verify scenario fails.

### F7 · `docs/cli/spec-deps.md` documents stale flag and removed merge semantics — **VIOLATION** (docs alignment in same change)

- **Rule:** docs — "Changes to a command's documented output contract MUST update the corresponding `docs/cli/` reference in the same change."
- **Affected:** `cli:spec-deps`.
- **Evidence:** `docs/cli/spec-deps.md:9-11` documents `--depends-on <id>...`, but the implemented CLI uses `--dep <id>` (`packages/cli/src/commands/spec/deps.ts:91,114,137`) and the merged `cli:spec-deps` spec specifies `--dep <dependency-id>...`. The doc's Rules section still describes combined add/remove semantics ("`remove` runs before `add` when both appear in one mutation") that do not exist in the one-action-per-call surface. The file was last touched by this change's WIP commit `a5f96629`, so the stale text survived an in-change edit. (`docs/cli/spec-implementation.md` correctly documents `--file`/`--symbol` and the `suggest` subcommand.)
- **Hypotheses:** (a) _Pre-existing drift partially fixed during the change_; (b) straightforward change non-conformance — either way the doc must be corrected before archive.

### F8 · Test file covers two source files — **minor deviation**

- **Rule:** testing — test file name matches the source file name, mirroring `src/`.
- **Affected:** `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies` (infra suites).
- **Evidence:** `packages/sdk/test/infrastructure/fs/fs-suggestion-cache.spec.ts` contains `describe('FsImplementationSuggestionCache')` (line 11) **and** `describe('FsSpecDepsSuggestionCache')` (line 105); no dedicated `fs-spec-deps-suggestion-cache.spec.ts`.
- **Hypotheses:** (a) tolerated pairing drift; (b) minor naming non-conformance.

### Conformant highlights (verified against globals)

- **Composition pattern**: both SDK factories implement exactly the canonical triple overload form plus `resolveXxxDeps(resolver)` delegating through `createCompositionResolver` → shared resolver path (`suggest-implementation-links.ts:1559-1624`; mirrored in `suggest-spec-dependencies.ts`) — matches architecture's config-based factory mandate.
- **Error taxonomy**: `InvalidInputError`, `WorkspaceNotFoundError`, `SpecNotFoundError` extend `SpecdError` with UPPER_SNAKE_CASE codes; CLI maps them to exit 1 via `handleError` (`handle-error.ts:165-197`); `ReadOnlyWorkspaceError` falls into the generic SpecdError→exit-1 path.
- **ESM/conventions**: `.js` import suffixes throughout new files; named exports only (no `export default`); kebab-case filenames; no `any` in orchestration/infrastructure spot-checks; underscore private backing fields (`_data`, `_storagePath`, …); explicit return types + JSDoc with `@param`/`@returns` on new symbols.
- **GraphStore port**: abstract class with `storagePath` constructor in `domain/ports/graph-store.ts:118-135`, SQLite adapter under `infrastructure/sqlite/` — matches both the change spec and global port convention.
- **CLI thinness**: `implementation.ts`/`deps.ts` handlers delegate entirely to `Kernel.specs.getPersistedImplementation/updatePersistedImplementation/getPersistedDeps/updatePersistedDeps` and to SDK factories via dynamic `import('@specd/sdk')`; `.allowExcessArguments(false)` on every leaf subcommand; `--format text|json|toon` everywhere; `[already included]`/`[new]` tags rendered; spinner gated to interactive text so json/toon never prompt.
- **Testing**: Vitest everywhere; integration suites use `os.tmpdir()` + unique dirs + `afterEach` cleanup (`fs-suggestion-cache.spec.ts:18,112`; `fs-cache-concurrent-load.spec.ts:77`); zero snapshot assertions; no raw `console.*` in new production code (`Logger` used).
- **Lazy loading**: `repo.list({ includeMeta: true })` for discovery with full artifact reads only on cache miss — consistent with metadata-before-content.
- **SDK package shape**: `"type": "module"`, curated `exports` (`.`, `./ports`, `./extensions`), deps limited to core + code-graph per `sdk:composition`.

## Summary counts

| Verdict                                | Count | Findings                                                                                                                                                                             |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Violation                              | 5     | F1 (public barrel exports infra), F2 (orchestration→infrastructure), F4 (partial port mocks), F6 (CLI direct code-graph dep/internal import), F7 (stale docs/cli flag+semantics)     |
| Borderline violation                   | 1     | F3 (module-level memo singleton)                                                                                                                                                     |
| Change-spec inconsistency / spec drift | 1     | F5 ("No dependency on @specd/core" vs globals + own requirements)                                                                                                                    |
| Minor deviation                        | 1     | F8 (test file naming coverage)                                                                                                                                                       |
| Conformant areas verified              | 10    | composition factories, error taxonomy, ESM/naming/no-any, GraphStore port shape, CLI thinness, testing hygiene, lazy loading, package shape, docs presence (implementation), logging |

**Overall:** the six specs are structurally well-aligned with the globals (composition, error contract, CLI thinness, testing hygiene). The material risks concentrate in (1) the SDK introducing an `application/ports` + `infrastructure/fs` split that breaches both the global curated-barrel and ports-only rules while contradicting sibling spec `sdk:composition`, (2) test-mock typing, and (3) doc/flag drift in `docs/cli/spec-deps.md`. Hypothesis A (global/workspace-spec drift around SDK orchestration) vs hypothesis B (change non-conformance) is flagged per finding; F1/F4/F7 are actionable within this change regardless of which hypothesis holds.
