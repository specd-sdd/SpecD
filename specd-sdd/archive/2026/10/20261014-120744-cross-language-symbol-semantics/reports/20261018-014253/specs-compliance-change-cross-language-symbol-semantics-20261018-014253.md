# Compliance audit (round 3): cross-language-symbol-semantics

Mode: change, full. Tests/build/lint green before audit (core 2526, cli 1138, sdk 114, code-graph 1103).

## Detailed Findings

# Partial A - Core contracts audit (round 3)

Change: `cross-language-symbol-semantics`
Specs: `code-graph:symbol-model`, `code-graph:resolve-symbol-reference`, `code-graph:language-adapter`
Method: merged specs read via `changes spec-preview`; code in `packages/code-graph/src` checked by reading plus empirical probes (the built `dist` was run against small snippets for all four adapters; probe scripts live in the session scratchpad only, nothing in the repo was modified). Tests in `packages/code-graph/test` checked by name and by reading the assertion bodies.

Legend: OK = implemented as specified, PARTIAL = implemented with gaps, MISSING = not implemented. Severity: HIGH = a SHALL/MUST requirement or scenario is violated with user-visible or graph-correctness impact; MEDIUM = a requirement is partly unmet or gated incorrectly; LOW = edge, naming, or documentation.

Neither spec nor code is treated as the source of truth: each finding gives evidence for both sides, and where one side looks stale this is said explicitly.

## Totals

- HIGH: 8 (F1-F8)
- MEDIUM: 12 (F9-F20)
- LOW: 11 (F21-F31)
- Spec self-contradictions or stale wording: 8 (X1-X8)
- Test gaps: section 5

---

## 1. Findings (ordered by severity)

### HIGH

**F1. Speculative CALLS / CONSTRUCTS from the shared scoped-binding fallback (symbol-model, language-adapter)**

- Code: `src/domain/services/scoped-binding-environment.ts:518-545` (`resolveCallTarget`) ends with `selectSingleSymbol(symbolLookup.findByName(targetName, workspacePrefix))`. It is run for every file by `src/application/use-cases/index-code-graph.ts:1201-1237` in addition to `adapter.buildRelations`.
- Effect, verified by running `buildScopedBindingEnvironment` + `resolveDependencyFacts` on two TS files with NO import between them: `function run(){ helper(); save(); new Thing() }` yields `CALLS run -> b.ts:helper`, `CALLS run -> b.ts:method save` (a free call resolved to a class METHOD of an unrelated file), and `CONSTRUCTS run -> b.ts:Thing`. A unique workspace-wide simple name, of any `SymbolKind`, is treated as proof.
- Spec evidence: symbol-model "Scoped binding relation output" ("Unresolved binding facts and call facts SHALL NOT create speculative graph edges"); language-adapter "Call resolution" ("Calls to identifiers that cannot be resolved deterministically ... SHALL be silently dropped"), "Detectable dependency boundary" ("Heuristic dynamic cases MUST NOT emit graph relations"), "Scoped binding fact extraction" ("MUST NOT perform fuzzy or runtime inference"); resolve spec scenario "Same-name candidate is not proof" states the same principle for the resolver. The adapters themselves behave correctly (probe: `buildRelations` for unimported `helper()` / `save()` emits nothing in TS/Py/Go/PHP), so the shared layer silently undoes the adapter-level conservatism.
- Code-side defence: the generic fallback may have been added so same-workspace globals (CakePHP, JS script files) resolve. If that is intended, the spec needs an explicit carve-out; as written it forbids it.
- Test evidence: `test/domain/services/scoped-binding-environment.spec.ts:155` ("resolves constructor and type facts") passes only because the target class is in the same file; there is no negative test for an unimported unique name, a free call that matches a method, or a type match across files.

**F2. TypeScript public bindings are decided by simple-name match; default exports are never emitted by any adapter (symbol-model, resolve, language-adapter)**

- Code: `typescript-language-adapter.ts:836-860` collects `exportedNames` (the exported spelling, alias included) and `:1102` publishes `symbols.filter(s => exportedNames.has(s.name))`, i.e. it matches the exported NAME against declaration names, not the export specifier's local target.
- Probes: `function f(){} function other(){} export { other as f }` -> binding `f` targets the logical id of `f` (wrong; should target `other`). `function priv(){} export { priv as pub }` -> no binding at all. `export default function(){}`, `export default class Foo {}` (named binding only, no `default`), `export default x` -> no `default` binding. `namespace N { export function inner(){} } export function inner(){}` -> two bindings with the same slot `inner` from different declarations (the namespace-nested one is not a module export), which the resolver will report as ambiguous. A repository-wide search shows no code ever builds a binding with `exportedName: 'default'` (`rtk rg "'default'"` hits only the star-skip filter at `:2510` and import kinds).
- Spec evidence: symbol-model "First-class binding model" ("Anonymous and default exports SHALL remain addressable through binding identity"; scenarios "Export alias keeps the source target", "Default export stays addressable"); resolve "Public and local binding identity" (same sentence); language-adapter "Re-export public bindings" ("MUST NOT choose the first symbol of that name").
- Test evidence: `typescript-language-adapter.spec.ts:1348` only asserts that a star re-export does NOT copy `default`; it never asserts that a `default` binding exists, so the scenario is vacuously satisfied. No test covers a local `export { a as b }` without `from`.

**F3. Selector layer returns an untyped arbitrary physical match and merges distinct logical forms by heuristic (resolve, symbol-model)**

- Code: `src/application/services/resolve-graph-selector.ts`: direct location-backed id (`:157-167`) and full-id (`:169-190`) return only the legacy `{status, match}`; `kind`/`target` are optional on `ResolvedGraphDeclarationSelector` (`:61-65`). `promoteToLogicalTarget` (`:312-362`) upgrades only when ALL matches map to ONE logical id; otherwise `resolvedResult` (`:467-488`) calls `unifyOverloadSetCandidates` (`:426-460`), whose second branch treats any declarations with the same file, same non-null `parentId` and same name as "overloads" and returns `first`.
- Effect: a getter/setter pair, or an instance and a static member of the same name, or a property and a method of the same name (all with different logical ids, and the matches carry no `logicalId` on this path) resolve as `status: 'resolved'` with one arbitrary physical declaration. `parentId` here is the location-based id, which the symbol-model says is not a logical owner.
- Spec evidence: resolve "Resolution target kind and declaration evidence" (last paragraph: "Every selector-level resolution entry point (bare name, file-qualified name, location-backed symbol ID ...) SHALL return the discriminated typed target"; "MUST NOT ... reduce a logical result to an arbitrary first declaration"); resolve "Hierarchy-aware members" ("Getter/setter or other same-name forms SHALL require a member-form constraint"); symbol-model "Member semantics and symbol spaces" ("SHALL NOT collapse distinct same-name forms").
- Code-side defence: `unifyOverloadSetCandidates` is the compatibility path for symbols with no logical mapping, and its tests (`resolve-graph-selector.spec.ts:357`, `:398`, `:480`, `:553`) encode that behaviour. The heuristic is only safe for physical-only declarations; it should not fire when the matches map to distinct logical ids (which the code has already looked up in `promoteToLogicalTarget`).

**F4. Local-binding / alias support is advertised but cannot work in production (language-adapter "Resolver capability declaration", resolve "Public and local binding identity")**

- Code: all four adapters emit local bindings only for imports, at module scope, always with `targetId: undefined` (`typescript-language-adapter.ts:1111-1125`, `python-language-adapter.ts:673-684`, `go-language-adapter.ts:553-564`, `php-language-adapter.ts:784-795`). No later pass assigns `targetId` (`InMemoryIndexSession.addReferenceFacts` at `in-memory-index-session.ts:315-323` accepts only public bindings and steps; `index-code-graph.ts:1649-1654` only nulls targets that do not exist). `candidatesFromBindingTargets` (`resolve-symbol-reference.ts:771-783`) skips bindings with `targetId === undefined`.
- Consequences: (a) every adapter reports `capabilities().localBindings === true`, yet the resolver can never prove an alias; (b) a request for an imported alias in a current, fully indexed file falls through to `absenceOutcome` and can return `missing` (`REFERENCE_ABSENT`) although the alias exists as a local binding with an unknown target; (c) block/function-level aliases and shadowing (`Shadowed local alias uses lexical scope`) are never produced by any adapter.
- Spec evidence: language-adapter "A capability flag MUST be true only when the adapter emits enough shared facts and ordered provenance for the generic resolver to prove that category"; resolve "A local binding SHALL retain lexical scope ...", "missing only when ... proves the addressed target absent".
- Test evidence: `resolve-symbol-reference.spec.ts:550` builds a local binding by hand with a target; no adapter-level test shows an adapter producing a resolvable local binding.

**F5. Routine-local and non-exported module state is not emitted by any adapter (symbol-model "SymbolKind enum", language-adapter "Member semantics and declaration parent")**

- Probes: TS `const top = 1; function f(){ const loc = 2 }` emits neither `top` nor `loc` (only `export const` variables are extracted; `typescript-language-adapter.spec.ts:424` is named "extracts exported variables"); Python `local = 3` / `loc = 1` inside functions are not emitted; Go `var l = 1` / `x := 2` inside `top()` not emitted; PHP `$global`, `$loc` not emitted. Module-level Python/Go/PHP state and container fields are emitted with the correct Variable/Property kinds.
- Spec evidence: symbol-model scenario "State declaration normalization across scopes" ("the function-local declaration is assigned `SymbolKind.Variable` with `parentId` set to the enclosing function's symbol id"); language-adapter scenario "Routine local variables set parentId to enclosing routine" ("each local variable occurrence has `parentId` set to the enclosing routine's symbol ID").
- Test evidence: only the helper is tested (`reference-fact-helpers.spec.ts:210`, synthetic symbols). `withEnclosingTypeParents` (`reference-fact-helpers.ts`) even has a Variable-in-routine branch that no adapter can trigger.
- Code-side defence: emitting every local would be heavy for the graph; the spec text may have been written ahead of an intentional "locals are not graph symbols" decision. Either the spec scenarios should be narrowed or the adapters extended. As written the spec is unmet.

**F6. Identity collisions silently drop both declarations from the logical layer and leave dangling owners (symbol-model "Logical symbol", language-adapter "Declaration classification policy")**

- Code: `reference-fact-helpers.ts:340-392` (`buildLogicalDeclarationFacts`): when two descriptors yield the same logical id and either lacks a (matching) `groupKey`, the id goes into `conflictLogicalIds` and ALL its declarations are deleted from `logicalBySymbolId`. The diagnostics (`UNGROUPED_LOGICAL_COLLISION`, `CONFLICTING_DECLARATION_GROUP`) are returned in `LogicalDeclarationFacts.diagnostics` but no adapter or indexer consumes them (`rg "\.diagnostics"` shows only coverage diagnostics).
- Probes (TS): `interface Foo {a()}` twice (declaration merge), `class Bar` + `interface Bar` (class/interface merge), and `namespace X { class C }` + `namespace Y { class C }` all lose their logical declarations. Members of the dropped owner keep `ownerId` pointing at a logical id that does not exist (`Foo.a` still has `ownerId=logical|2|...|Foo|type...` but no `Foo` logical symbol or declaration), so `qualified_name` (`deriveQualifiedName` returns undefined when the owner is absent) is not stored for them and `Foo.a` cannot be resolved by the exact lane. Python: duplicate `def m` in one class, TS namespaces and Go duplicate funcs behave the same; Python/PHP definitions inside `try:` / `if {}` blocks are not extracted at all (probe: `symbols A,m,m` only).
- Spec evidence: symbol-model "A logical symbol MAY contain multiple declarations when the source language defines ... a declaration merge"; "Competing declarations that do not form one language-defined symbol MUST remain distinct"; scenario "Missing group evidence does not create a group ... remain distinct semantic candidates"; language-adapter "Adapters SHALL establish canonical logical owners before constructing owned logical identities" and "Namespace or module is an owner-path role" (symbol-model). The logical id is a pure function of (workspace, surface, name, space, owner, member axes), so two non-grouped declarations cannot be "distinct" at the logical layer; dropping is the only outcome, which is neither "distinct candidates" nor "ambiguous".
- Code-side defence: physical declarations stay navigable (still in `symbols`, satisfying "Physical-only declaration remains navigable"), and dropping is conservative compared with false merging. The residual defects are the dangling `ownerId`, the unconsumed diagnostics, and TS merge/namespace support being absent although the policy says `supportsLogicalDeclarationGroups: true`.

**F7. Legacy occurrence id scenario contradicted by the test (resolve "Deterministic resolution precedence")**

- Spec: scenario "Legacy occurrence id still resolves" - a location-backed symbol id received by `ResolveSymbolReference` returns the current logical symbol, not parsed as owner-qualified text.
- Code: `resolve-symbol-reference.ts` resolves a physical id only through the separate `declarationSymbolId` selector (`:96-166`, `:269-421`). A location-backed string passed as `requested` is treated as a plain name and does not resolve.
- Test: `resolve-symbol-reference.spec.ts:958-981` is titled "resolves a logical|2| id and a location-backed symbol id without human parsing" but asserts `expect(byLocation.status).not.toBe('resolved')` and `expect(byLocation.target?.id).not.toBe(target.id)`. The test name, the spec scenario and the assertion disagree. The selector layer (`resolve-graph-selector.ts:157`) does resolve a location id but returns only the legacy physical match (F3).
- Either the spec scenario should say "via `declarationSymbolId`/selector", or the resolver should accept the id. Flagged HIGH because a scenario is directly contradicted by its own test.

**F8. `COVERS_SYMBOL` staleness is not implemented; the missing-symbol scenario is inverted (symbol-model "Relation staleness")**

- Spec: scenario "Missing symbol marks implementation relation as stale" - relation retained, `COVERS_SYMBOL` metadata `stale: true`.
- Code: `src/application/services/project-spec-coverage.ts:95-150` emits a diagnostic (`SYMBOL_NOT_FOUND` / `SYMBOL_AMBIGUOUS` / `COVERAGE_NOT_APPLICABLE` / `FILE_NOT_INDEXED`) and NO relation when the symbol does not resolve. No production code writes `metadata.stale` (`rg stale` over `src` finds only freshness-latch code); only the test doubles and `graph-store.contract.ts:1972` write it by hand.
- Test: `test/application/services/project-spec-coverage.spec.ts:91` asserts the `SYMBOL_NOT_FOUND` diagnostic.
- Cross-spec: `code-graph:graph-store` says the relation "MAY carry `metadata.stale`", which is weaker than symbol-model's scenario. The spec set is internally inconsistent (X2); the code follows the weaker, diagnostic-based design. Either symbol-model's "Relation staleness" requirement + two scenarios should be rewritten to the diagnostic model, or the code must retain the stale relation.

### MEDIUM

**F9. Hierarchy precedence emitted by adapters is ignored by the resolver (resolve "Hierarchy-aware members")**

- Adapters emit `precedence` (Python `class B(A, M)` -> `extends:0`, `extends:1`), encoded into `ResolutionStep.kind` as `"extends:1"` (`reference-fact-helpers.ts:buildHierarchyReferenceFacts`, `in-memory-index-session.ts:200`). `hierarchyCandidatesForRequest` (`resolve-symbol-reference.ts:790-813`) uses BFS shortest depth and returns every equal-depth match, so two bases that both declare the member are `ambiguous`; the `kind` string is only used for ordering. Spec: "Inherited, trait, mixin, embedded, promoted, abstract, and default members SHALL follow deterministic language precedence." The only exception allowed is "Competing inherited members SHALL be ambiguous" when language rules cannot select. Python MRO, PHP trait-over-parent and TS `extends` before `implements` are selectable rules that are encoded in data and not used. `resolve-symbol-reference.spec.ts:603` encodes "equal-depth ambiguity" as correct.
- Also `ResolutionStep.kind` is an untyped string ("typed evidence path" in resolve "Resolution outcomes").

**F10. `missing` is blocked by unrelated global coverage incompleteness (resolve "Freshness and coverage gate")**

- `absenceOutcome` (`resolve-symbol-reference.ts:690-701`) returns `unresolved` whenever `health.complete !== true`, even when the addressed file/public surface is current and its own `index_coverage` row is `indexed` (checked later at `:720-727`). `health.complete` is `coverageComplete` = no `parse-failed`/`partial` file anywhere (`get-graph-health.ts:~270`) or `null` (unknown). One broken file in the repository makes every absence proof `unresolved`.
- Spec: "A current and completely indexed addressed file that proves a requested declaration absent ... SHALL produce `missing`". The spec permits using targeted evidence despite unrelated STALENESS; it is silent on unrelated incompleteness, but "completely indexed addressed file" scopes the completeness to the addressed resource. The test `resolve-symbol-reference.spec.ts:347` covers unrelated staleness only.

**F11. Corpus-completeness decisions are not gated on global health (resolve "Freshness and coverage gate")**

- An unanchored qualified lookup (`resolveQualifiedMember`, `:974-1037`) and any ambiguity or uniqueness outcome never consult `prepared.health`; `candidateEvidenceIssue` (`:602-639`) checks only per-file freshness and is skipped entirely when `assessResources` is undefined (the constructor makes it optional; the provider always passes it, other callers such as `index-code-graph.ts:1553` do not).
- Spec: "A workspace-wide fallback, absence, uniqueness, or ambiguity decision that requires corpus completeness SHALL remain `unresolved` whenever global health is stale or unknown." A stale index can therefore return `resolved` for `EditChange.execute` while another equal `qualified_name` exists only in an unindexed file.
- Test gap: unanchored scenarios (`:739`, `:785`) run with `freshHealth` only.

**F12. `logicalId` absence is reported `missing` before the surface coverage is checked (resolve "Freshness and coverage gate")**

- `absenceOutcome:703-714` returns `LOGICAL_TARGET_NOT_FOUND` as `missing` before the coverage lookups at `:716-727`. A canonical id whose surface file is `parse-failed`, `partial`, `excluded` or `unsupported` therefore yields `missing`, contradicting "Unknown, dirty, stale, ... excluded, unsupported, parse-failed, or partial required evidence SHALL produce `unresolved` ... MUST NOT produce `missing`". (Also `normalizeRequest:931-944` overwrites the caller-supplied `workspace` and `publicSurface` from the parsed id.) A logical symbol that exists but has zero declarations (e.g. the owner of F6) is also reported `missing` because `exact` requires `hasMatchingDeclaration`.

**F13. Local-binding lookup has no lexical scope chain (resolve "Public and local binding identity")**

- `findLocalBindings` filters `scope_id = ?` exactly (`sqlite-graph-database.ts:2476-2503`; the resolver filter at `resolve-symbol-reference.ts:503-509` repeats it). `LocalBinding` carries no parent scope, so a use in a nested block never sees an outer binding and the lookup falls to `missing` (see F4); without `scopeId` all scopes' bindings are returned and two different targets become `ambiguous` instead of "inner wins". Scenario "Shadowed local alias uses lexical scope" is untested (the only local-alias test, `:550`, has one binding).

**F14. Multi-segment qualified names cannot be looked up (resolve "Structured reference input")**

- `exact-lane-query.ts:1-2` accepts exactly one separator (`^id\.id$` / `^id::id$`) and ASCII identifiers. `qualified_name` is "rebuilt from the owner chain" (symbol-model), so `Outer.Inner.method`, `ns.Type.member`, PHP `A::B::c`, or Unicode identifiers (Go/Python) have a stored spelling but are never matched by equality; they are sent to the adapter path or `unresolved`. `expandedLookups` (`resolve-symbol-reference.ts:951-965`) also splits on `::|.` into per-segment simple-name lookups (a scan-like fallback that the spec calls "search the graph for only the terminal member name").
- Spec: "A request whose text is `Tipo.miembro` or `Tipo::miembro` SHALL resolve by equality on stored `qualified_name`"; the spec only names the two-segment form, so this is a gap in specification precision as well as code.

**F15. Selector layer collapses `unresolved` into `missing` (resolve "Resolution outcomes")**

- `resolve-graph-selector.ts:~203-206` (`resolveUnanchoredQualifiedSelector`) and `:~252` map `unresolved`/`missing`/no-resolved-match to `{status:'missing'}`, losing the reason code and the stale/incomplete distinction; `ResolvedGraphMissingSelector` has no reason. Spec: "`missing` only when a current and complete index proves the addressed target absent". Ambiguous candidates with zero declarations are also reported as `missing` (`:~236-245`).

**F16. TS function grouping merges unrelated same-name functions; namespaces are not owners (language-adapter "Declaration classification policy")**

- `typescript-language-adapter.ts:1021-1025`: every top-level `function` with the same name in a file gets `groupKey = function:<file>:<name>`; probes show `namespace A { function f }` + `namespace B { function f }` and `if (1) { function g } else { function g }` share ONE logical id (and `export default`-style overload-free duplicates also merge). Overload proof (signature + implementation adjacency) is not required. Namespaces are never owners (`namespace NS { export class Q }` -> `Q` has no owner), unlike the symbol-model statement "Namespace or module is an owner-path role and a surface".
- `:979-980` decides signature vs implementation partly from `symbol.comment?.includes('@signature')`, i.e. comment text decides a declaration role (language-adapter "Parser-authoritative structural fact extraction": comments MUST NOT create/decide facts).

**F17. TS member semantics looked up by line + name (language-adapter "Parser-authoritative ...", "Member semantics")**

- `typescript-language-adapter.ts:2371-2374`: the member's parser node is found with `candidate.range().start.line + 1 === symbol.line && getName(candidate) === symbol.name`; line only, no column, not scoped to the owner. Probe on one line `class C { get x(){} set x(v){} static get x(){} }` gives all three members `property|instance|get` (setter reported as getter, static getter as instance), i.e. one logical symbol with three declarations. Multi-line source is correct. This violates "Same-line constructs" in the structural boundary tests and "Accessor and dispatch are stored together".

**F18. Python advertises `publicBindings: true` but never emits one (language-adapter "Resolver capability declaration")**

- `python-language-adapter.ts:272` vs `:672` (`const publicBindings = []`, never filled). The Python spec says static `__all__` is unsupported and exports are not inferred, so the right capability is `false` (as PHP does). Probe: modules with and without `__all__` both produce `[]`.

**F19. Session `findSymbolByQualifiedName` is a single-valued map built from every symbol (symbol-model "Shared indexing lookups")**

- `in-memory-index-session.ts:215-225` registers `namespace + separator + symbol.name` for EVERY symbol of the file, members included, in a `Map<string,string>`; collisions silently overwrite. Two classes in one PHP namespace that each declare a method with the same name, or a method named like a class, resolve to whichever file was registered last. The spec requires lookups "by file, simple name, and qualified name" bounded by relevant matches; a map that can hold one result per qualified name cannot report several.

**F20. `SpecNode.dependsOn` / `contentHash` / `description` do not match the spec (symbol-model "Spec node")**

- `index-code-graph.ts:1457-1466` builds the node without `dependsOn` (always `[]`, although `persisted.dependsOn` is read at `:1439` and used only for relations); `contentHash` is `metadataFingerprint` (the materialized metadata fingerprint, `:1462`), not "hash of concatenated spec artifacts excluding `.specd-metadata.yaml`"; `description` prefers `optimizedDescription` over `description` (`:1403-1406`); `title` fallback is correct. Spec scenarios "dependsOn extracted from metadata" are therefore unmet at indexer level (only `createSpecNode` unit tests exist, `spec-node.spec.ts`). Also `DEPENDS_ON` relations are only (re)built for specs whose node changed (`:1475-1490`, `changed` gate at `:1466`), so a dependency target added later does not retro-create the edge from an unchanged source.

### LOW

**F21.** `createSymbolNode` (`symbol-node.ts:119-190`) accepts missing `endLine/endColumn/selectionRange` and fabricates `column + name.length` coordinates, and defaults `projectRelativePath` to the workspace-prefixed path. All adapters pass real ranges (`typescript-language-adapter.ts:636-655`, same in Go/Py/PHP), but the factory contradicts "A candidate without trustworthy complete and selection ranges SHALL be omitted ... rather than emitted with misleading coordinates"; every unit test that omits the ranges relies on the fabrication.

**F22.** Self-relations from adapters are persisted. `buildRelations` emits recursive `CALLS` (probe: TS `r -> r`, Python `r -> r` and `m -> m`, Go `r -> r`); `deduplicateRelations` (`index-code-graph.ts:128-138`) does not drop them; only `addDependency` in the scoped resolver does (`scoped-binding-environment.ts:addDependency`). Spec "Scoped binding relation output": "SHALL NOT persist symbol-to-symbol dependency relations where the source symbol id and target symbol id are identical ... MUST be dropped before graph persistence". Impact traversal probably hides the self-edge through its visited set (not verified), but persistence is the stated contract and no test covers adapter-level or store-level self-edges.

**F23.** Cycle detection returns facts found before the cycle closes (`scoped-binding-environment.ts:288-312`). With `A.parent=B`, `B.parent=A` and a fact in `B`, `lookup(name, A)` returns that fact; the spec says detection aborts and "no resolution result SHALL be returned". The test (`scoped-binding-environment.spec.ts:253`) looks up a non-existent name, so it passes with or without the abort semantics.

**F24.** Go blank imports carry `originalName: 'effect'` (probe: `import _ "side/effect"` -> `{localName:'', originalName:'effect', kind:'blank'}`). Spec: "File-only import forms use an empty string" for both names, and "Go blank imports MUST be representable as file-only import declarations". `from m import *` (Python) and grouped PHP `use App\{A, B as C}` produce no declaration, so those file dependencies are silently lost (the PHP/Python specs may mark them unsupported; they are not reported as unsupported coverage).

**F25.** `registry.register` silently lets a later adapter overwrite an earlier extension mapping (`adapter-registry.ts:register`), has no conflict detection, validates policy only when `declarationPolicy` is defined (a third-party adapter without it is accepted, relying on the conformance suite), and `getAdapterForFile` slices from `lastIndexOf('.')` which for a path without a dot slices the last character. Behaviour is harmless today.

**F26.** `DuplicateSymbolIdError` is defined and exported but never thrown anywhere in `src` (SQLite PK violations on `symbols.id` would surface as a driver error). Spec marks it "defined for unexpected collision conditions"; the code satisfies "defined" literally.

**F27.** `PublicBinding.id` embeds `targetId`; the indexer then nulls `targetId` for dangling targets (`index-code-graph.ts:1642-1647`) without recomputing the id, so a persisted binding's id and fields disagree. Spec: identity "distinguishes its canonical target or ordered re-export provenance".

**F28.** `DeclarationOccurrence` carries two synonyms (`form` and `occurrenceForm`) and `SymbolResolutionResult.target` is a deprecated shadow of `resolvedTarget`. This is allowed as a "compatibility projection" but doubles the surface; no migration path/date is documented, which the resolve spec asks for ("explicit discriminant and migration path").

**F29.** Resolver ordering uses `localeCompare` over `\u0000`-joined keys (`resolve-symbol-reference.ts:1242-1274`, `compareSteps`), so ordering depends on the ICU locale and NUL handling; "Candidate ordering ... identical across supported graph-store backends" holds in one process but is not guaranteed across hosts. SQLite uses `compareStrings`.

**F30.** `ambiguous` results from the exact-declaration path (`AMBIGUOUS_DECLARATION`, `resolve-symbol-reference.ts:310-320`) and from a multi-candidate adapter parse (`:1000-1011`) return `candidates: []` although candidates exist; spec: "Non-resolved results SHALL include ... deterministically ordered candidate summaries when candidates exist".

**F31.** `parseLogicalSymbol` accepts a canonical id whose member kind is empty but dispatch/accessor/nativeKind are non-empty and silently discards those axes (`symbol-reference.ts:parseLogicalSymbol`), so `parse(id).id` equals the input while `memberSemantics` is `undefined`; also the `nativeKind` field is not validated. Round-trip holds only for ids produced by `createLogicalSymbol`.

---

## 2. Cross-spec contradictions / stale wording (neither side authoritative)

- **X1.** resolve "Logical canonical targets": "The target SHALL expose ... member form" and "Getter/setter ... SHALL require a member-form constraint" versus symbol-model "`MemberForm` MUST NOT remain on `LogicalSymbol`, resolver inputs, store lookups". Stale wording; the code exposes `MemberSemantics` axes.
- **X2.** symbol-model "Relation staleness" scenarios (relation retained, `stale: true`) versus graph-store ("MAY carry `metadata.stale`") versus the implemented diagnostics model (F8).
- **X3.** symbol-model "Symbol node" field list omits `parentId`, but the same spec, the SymbolKind requirement and language-adapter all rely on `parentId` of the declaration occurrence; code has `SymbolNode.parentId`. The "File node" list also omits `category`/`content` which the code carries.
- **X4.** language-adapter "Member semantics and declaration parent" requires popping a scope only when `endLine` is "strictly less than" the candidate line; this contradicts "Semantic caller containment" (columns, same-line ranges). The code uses the column-aware rule (`reference-fact-helpers.ts:withEnclosingTypeParents`), which is the better rule; the sentence should be changed.
- **X5.** resolve "Freshness": "Transient inability to assess freshness SHALL use `freshness-unknown`" versus code reason codes `RESOURCE_FRESHNESS_UNKNOWN` / `GRAPH_FRESHNESS_UNKNOWN` (upper snake-case). No test pins the literal.
- **X6.** language-adapter "Import declaration extraction" lists four `ImportDeclaration` fields and says `isRelative` starts with `.`, while symbol-model adds `kind` and the type doc says "`.` or `/`".
- **X7.** language-adapter "Parser-authoritative structural fact extraction" requires "every persisted hierarchy relation MUST have one matching shared hierarchy reference fact" (verified by the conformance suite for imported hierarchy only) while "Hierarchy evidence consistency" is limited to adapters that advertise `hierarchy: true`.
- **X8.** The "Cross-language semantic conformance suite" list contains an `and` joined bullet ("...matching provenance; and per-file relation analysis...; and identity-sensitive...") and mixes requirements that live in other specs (logical resolution, coverage lookup); it is unclear which behaviours a new adapter must prove itself versus inherit.

No contradiction with `default:_global/conventions` or `default:_global/error-handling-conventions` found in these three specs beyond F26.

---

## 3. Per-spec requirement status

### 3.1 code-graph:symbol-model

| Requirement                                   | Status        | Evidence                                                                                                                                                                                                        |
| --------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File node                                     | OK            | `domain/value-objects/file-node.ts` (path/projectRelativePath/language/contentHash/workspace/embedding); `file-node.spec.ts:142-154` covers `../..` parent segments. Extra fields `category`, `content` (X3).   |
| Spec node                                     | PARTIAL       | `spec-node.ts`; indexer does not populate `dependsOn`, `contentHash` is a metadata fingerprint, description prefers optimized one (F20).                                                                        |
| Symbol node                                   | PARTIAL       | id, ranges, selectionRange, projectRelativePath, comment in `symbol-node.ts:119-190`; fabricated-range fallback (F21); `symbol-node.spec.ts:169` covers range round-trip.                                       |
| File analysis model                           | OK            | `file-analysis.ts` (`FileAnalysisDraft`, `FileAnalysis`, `ParserState`, `AdapterSessionState`), registered in `in-memory-index-session.ts:142-232`, not persisted.                                              |
| Shared indexing lookups                       | PARTIAL       | file/symbol/spec lookups present (`index-session.ts`); qualified-name lookup is single-valued and member-polluted (F19).                                                                                        |
| Compact retained analysis state               | OK (untested) | structuredClone of all four adapters' drafts succeeds (probe); no test (section 5).                                                                                                                             |
| Document category                             | OK            | not re-audited in depth (`document-node.ts`).                                                                                                                                                                   |
| SymbolKind enum                               | PARTIAL       | closed enum OK (`symbol-kind.ts`), `InvalidSymbolKindError` OK; state-normalization for locals missing (F5).                                                                                                    |
| Relation types                                | OK            | `relation-type.ts` has the 12 types.                                                                                                                                                                            |
| Relation staleness                            | MISSING       | F8.                                                                                                                                                                                                             |
| Relation value object                         | OK            | `relation.ts`, metadata ignored by equality (`deduplicateRelations` key).                                                                                                                                       |
| Hierarchy relation semantics                  | OK            | `EXTENDS/IMPLEMENTS/OVERRIDES` persisted; `deriveCrossFileOverrideRelations` in the indexer.                                                                                                                    |
| Import declaration                            | PARTIAL       | kinds present (probe); Go blank non-empty `originalName` (F24).                                                                                                                                                 |
| Scoped binding model                          | PARTIAL       | immutable facts `binding-fact.ts`, `call-fact.ts`; cycle semantics (F23).                                                                                                                                       |
| Scoped binding relation output                | PARTIAL       | USES_TYPE/CONSTRUCTS/CALLS emitted; speculative fallback (F1); self-edges (F22).                                                                                                                                |
| Immutability                                  | OK            | `readonly` throughout.                                                                                                                                                                                          |
| Error types                                   | OK            | `SpecdCodeGraphError extends SpecdError` with `specd` discriminator, tests in `specd-code-graph-error.spec.ts`; `DuplicateSymbolIdError` unused (F26).                                                          |
| Logical symbol and canonical reference        | PARTIAL       | `createLogicalSymbol`/`parseLogicalSymbol` v2 delimiter-safe ids (`symbol-reference.ts`), `qualified_name` stored (`schema.ts:80`, index `:169`), no package field; dangling owners (F6), parse leniency (F31). |
| Declaration, binding, logical identity layers | PARTIAL       | declaration vs logical vs `LocalBinding` types exist; physical-only classification works for routine-local callables; collisions (F6); lexical bindings only for imports (F4).                                  |
| Member semantics and symbol spaces            | PARTIAL       | `MemberSemantics` axes + spaces implemented; same-line accessor misclassification (F17); selector merges forms (F3).                                                                                            |
| First-class binding model                     | PARTIAL       | `createPublicBinding`/`createLocalBinding` ids include target / range; default and aliased export bindings wrong or missing (F2).                                                                               |
| Evidence-preserving semantic projection       | OK            | `analyze-impact.ts` (`analyzeResolvedSymbolImpact`, `collectLogicalCoveringSpecs`); traversal tests exist (not re-audited here).                                                                                |
| Index coverage facts                          | OK            | `IndexCoverageStatus` and `IndexCoverage` (`index-session.ts`), persisted in `index_coverage` with `content_hash`.                                                                                              |

### 3.2 code-graph:resolve-symbol-reference

| Requirement                                     | Status  | Evidence                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured reference input                      | PARTIAL | `ResolveSymbolReferenceInput` (`symbol-reference.ts`), qualified lane + adapter parse (`resolve-symbol-reference.ts:974-1063`); one-separator limit (F14).                                                                                                |
| Logical canonical targets                       | PARTIAL | `outcomeFromCandidates:548-594` dedups by logical target; selector layer partially (F3).                                                                                                                                                                  |
| Resolution target kind and declaration evidence | PARTIAL | `kind: 'logical-target' / 'declaration' / 'public-binding'` unions exist; selector entry points not all typed (F3).                                                                                                                                       |
| Public and local binding identity               | PARTIAL | public slot lookup by surface + name + space OK (`:491-501`, SQLite `findPublicBindings`); local bindings F4/F13.                                                                                                                                         |
| Deterministic resolution precedence             | PARTIAL | order canonical id -> qualified -> file/owner -> public -> local -> hierarchy implemented (`:471-521`); location id as `requested` unsupported (F7); build-context selection not implemented (only a capability gate, all adapters `buildContext:false`). |
| Resolution outcomes                             | PARTIAL | four statuses with reason codes; typed steps absent (F9), empty candidates (F30), selector collapse (F15).                                                                                                                                                |
| Freshness and coverage gate                     | PARTIAL | batch `assessResources` with deduped file resources (`:231-247`, `deduplicateFileResources`), `findIndexCoverage`; global gating issues F10/F11/F12; `assessResources` optional.                                                                          |
| Hierarchy-aware members                         | PARTIAL | owner-then-member query under reached ancestor (`:204-222`, `:790-848`), cycle-safe BFS bounded by `MAX_PATH_DEPTH=32`; precedence ignored (F9).                                                                                                          |
| Batch and backend-independent resolution        | OK      | one `getHealth` per batch (`:77`), indexed store queries, in-memory vs SQLite contract tests (`graph-store.contract.ts` run for both).                                                                                                                    |

### 3.3 code-graph:language-adapter

| Requirement                                     | Status              | Evidence                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LanguageAdapter interface                       | PARTIAL             | `language-adapter.ts` has all listed methods incl. `resolutionManifests`; `capabilities`/`declarationPolicy` are optional on the interface; all four built-ins return the correct manifests (`['package.json']`, `['pyproject.toml']`, `['go.mod']`, `['composer.json']`, probe + `resolution-manifests.spec.ts`). |
| Full-file analysis contract                     | OK                  | single `analyzeFile`; drafts clone cleanly.                                                                                                                                                                                                                                                                        |
| Parser-authoritative structural fact extraction | PARTIAL             | no source-wide regex on `content` found (only manifests, `go.mod`, `pyproject.toml`, identifier tokenizing of isolated node text); exceptions: comment-text `@signature` (F16), line+name node lookup (F17), Python/PHP conditional blocks not extracted (F6).                                                     |
| Unified built-in adapter migration              | OK                  | no legacy extraction entry; indexer uses `analyzeFile/resolveImports/buildRelations`.                                                                                                                                                                                                                              |
| Language detection                              | OK                  | `adapter-registry.ts`; no extension table in the registry.                                                                                                                                                                                                                                                         |
| Import declaration extraction                   | PARTIAL             | F24; TS/Python/Go relative flags verified by probe.                                                                                                                                                                                                                                                                |
| Call resolution                                 | PARTIAL             | adapters conservative; shared fallback not (F1).                                                                                                                                                                                                                                                                   |
| Semantic caller containment                     | OK                  | `findContainingCallableSymbol` (`reference-fact-helpers.ts`), half-open line+column, tie-break by id; conformance cases pass.                                                                                                                                                                                      |
| Scoped binding fact extraction                  | PARTIAL             | not re-audited deeply (adapter specs own it).                                                                                                                                                                                                                                                                      |
| Built-in multi-language dependency coverage     | PARTIAL             | see F1, F24.                                                                                                                                                                                                                                                                                                       |
| Detectable dependency boundary                  | PARTIAL             | F1.                                                                                                                                                                                                                                                                                                                |
| Hierarchy extraction                            | OK                  | extends/implements/precedence verified by probe in TS, Python, PHP; Go struct embedding is documented unsupported in the Go spec (consistent).                                                                                                                                                                     |
| Package identity extraction                     | OK                  | `getPackageIdentity` + `findManifestField`; Python `[project].name` only, both quote styles (`readPythonProjectName`).                                                                                                                                                                                             |
| Import specifier resolution                     | OK (not re-audited) | tests exist per adapter.                                                                                                                                                                                                                                                                                           |
| Tree-sitter query patterns                      | OK                  | not part of the public interface.                                                                                                                                                                                                                                                                                  |
| Adapter registry                                | PARTIAL             | API complete; F25.                                                                                                                                                                                                                                                                                                 |
| Resolver capability declaration                 | PARTIAL             | F4 (local bindings), F18 (Python public bindings).                                                                                                                                                                                                                                                                 |
| Built-in adapter specialization                 | OK                  | specific specs exist.                                                                                                                                                                                                                                                                                              |
| Logical declaring-owner facts                   | PARTIAL             | members get logical owner ids built before members (`buildLogicalDeclarationFacts` two-pass) but F6 dangling owners.                                                                                                                                                                                               |
| Member semantics and declaration parent         | PARTIAL             | axes + `parentId` set by adapters via `withEnclosingTypeParents`/`withOwnerParents` (Go methods get receiver parent, verified by probe); locals missing (F5); same-line accessors (F17).                                                                                                                           |
| Human reference parse and render                | PARTIAL             | `parseSymbolReference`/`renderSymbolReference` optional hooks; resolver only parses via the adapter for non-qualified text; PHP/TS round-trip tests exist (`typescript-language-adapter.spec.ts:1084+`).                                                                                                           |
| Re-export public bindings                       | PARTIAL             | package `exports` map, relative, ambiguity-none and star-skip logic tested (`typescript-language-adapter.spec.ts:1134-1403`); local-alias/default (F2).                                                                                                                                                            |
| Hierarchy evidence consistency                  | OK                  | relation/step consistency in the TS/Py/PHP probes and `language-adapter-conformance.spec.ts:869`.                                                                                                                                                                                                                  |
| Complete symbol source ranges                   | OK                  | all adapters pass parser node ranges and omit a symbol on `RangeError` (e.g. `typescript-language-adapter.ts:636-655`).                                                                                                                                                                                            |
| Declaration classification policy               | PARTIAL             | `createPhysicalOnlyDeclarationDescriptor` / lexical-binding / logical roles exist; F6, F16.                                                                                                                                                                                                                        |
| Cross-language semantic conformance suite       | PARTIAL             | `language-adapter-conformance.spec.ts` (caller containment, ownership, physical-only, overload, logical coverage, hierarchy provenance, pass-2 purity, incremental equivalence, unresolved import); range checks and per-adapter logical resolution are missing and the lexical-scope test is vacuous (section 5). |

---

## 4. Positive confirmations (no action)

- Canonical logical id is versioned (`logical|2|...`), length-prefixed, rejects other versions/old six-field ids (`symbol-reference.spec.ts:110`), keeps `.`/`::` out of the identity; `qualified_name` is stored beside the name, indexed (`idx_logical_symbols_qualified_name`) and not an alias row.
- The multi-line accessor probe produced distinct logical ids for instance get / instance set / static get / field.
- Caller containment is column-aware and nearest-preceding fallback is rejected (conformance cases, `scoped-binding-environment.spec.ts:304-426`).
- Pass-2 metadata I/O purity and incremental-equals-clean cases exist in the conformance suite.
- Resolver batch: one health read, indexed lookups, cycle-bounded path tracing; SQLite and in-memory stores share one contract test.

---

## 5. Test coverage

Covered (examples): logical id round-trip, value/type identity, accessor/dispatch identity, owner distinctness, overload movement (`symbol-reference.spec.ts`); resolver precedence, public-slot ambiguity, freshness batching, build-context unsupported, hierarchy via ancestor, member-form distinctness, qualified-name lanes (`resolve-symbol-reference.spec.ts`); adapter conformance matrix; per-adapter re-export package map.

Missing or weak tests (each maps to a finding):

1. Adapter-emitted `default` export binding and local `export { a as b }` target correctness (F2). `typescript-language-adapter.spec.ts:1348` asserts only the star-skip half.
2. Routine-local variable `Variable` + `parentId` through any real adapter (F5).
3. Negative tests for the scoped-binding unique-name fallback: unimported free call, free call vs method, `new X()` across files (F1).
4. Selector layer: getter/setter, static/instance, property/method same-name under one parent must not be `resolved` by `unifyOverloadSetCandidates`; direct-id and full-id selectors returning a typed target (F3). Existing tests `resolve-graph-selector.spec.ts:357/398/480/553` lock in the heuristic.
5. Resolver: shadowed local alias with two bindings (F13); stale/unknown global health with an unanchored qualified lookup (F11); unrelated `parse-failed`/`partial` file with an addressed current file proving `missing` (F10); logical id on a `partial` surface (F12); hierarchy precedence tie-break (F9); multi-segment qualified name (F14); "Conditional candidates require context" scenario; location-backed id passed as `requested` (F7 - current test asserts the opposite of the scenario).
6. Cycle-detection scenario with a binding present in the cycle (F23); the existing test is vacuous.
7. Conformance suite: the "competing lexical scopes" case is vacuous - routine-local callables are physical-only, so `logicalIds` is empty and `0 === 0` (TS/Py/PHP fixtures `lexicalScopeSnippet`); Go's fixture declares a local variable that is not even extracted. The scenario also asks that bindings have different scope identities, which is never asserted. No conformance case for authoritative construct/selection ranges and none for "logical resolution retaining all declaration occurrences" per adapter.
8. Compact retained analysis state: no test that `ParserState` and `AdapterSessionState` are plain/serializable for the four adapters (probe shows `structuredClone` works, but nothing pins it).
9. Collision handling: `UNGROUPED_LOGICAL_COLLISION` is unit-tested in `reference-fact-helpers.spec.ts:614/703` only at helper level; no test for the dangling owner id, qualified-name loss, or TS interface merging / namespace-qualified classes (F6, F16).
10. Same-line accessors/members in TS (F17); Python `publicBindings` capability truthfulness (F18).
11. Indexer-level `SpecNode.dependsOn` / `contentHash` definition (F20); stale `COVERS_SYMBOL` scenario (F8 - test asserts the opposite); adapter-level self-relation (F22).
12. Go blank import `originalName` (F24).

---

## 6. Top 5 (summary)

1. F1 - shared scoped-binding fallback emits speculative CALLS/CONSTRUCTS from unique workspace-wide names (verified).
2. F2 - TS public bindings by name: wrong target for aliased exports, no `default`/anonymous export bindings in any adapter.
3. F3 - selector layer returns arbitrary physical match and merges distinct logical forms (getter/setter) by parentId+name heuristic; location/full-id selectors untyped.
4. F4 - local bindings advertised by all adapters but never carry targets; imported aliases can end `missing`.
5. F6 / F8 / F5 / F7 - logical-layer collisions drop owners (dangling `ownerId`), stale `COVERS_SYMBOL` not implemented, routine-local state never emitted, and a test asserting the opposite of a spec scenario.

---

# Partial B - Language adapters audit (read-only)

Change: `cross-language-symbol-semantics`. Batch: `code-graph:typescript-language-adapter`, `code-graph:python-language-adapter`, `code-graph:go-language-adapter`, `code-graph:php-language-adapter`.

Method: merged specs read via `changes spec-preview ... --format text` (spec + verify). Code read in `packages/code-graph/src/infrastructure/tree-sitter/*.ts`. Tests read in `packages/code-graph/test/infrastructure/tree-sitter/*.spec.ts`. `npx vitest run test/infrastructure/tree-sitter` was run: 8 files, 380 tests, all pass. Every "CONFIRMED" finding below was reproduced with a throw-away probe (scratchpad only, no repo files touched) calling `analyzeFile` / `buildRelations` / `resolveImports` directly. Probe sources: `/private/tmp/claude-501/-Users-monki-Documents-Proyectos-specd/abdb17ab-ff5d-45c5-93e5-e086d1b61803/scratchpad/probe/*.ts`.

Paths below are relative to `packages/code-graph/src/infrastructure/tree-sitter/` (code, `src`) or `packages/code-graph/test/infrastructure/tree-sitter/` (tests) unless stated.

## Severity summary (new findings, excluding known deferred)

| Severity                               | Count                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| High                                   | 3 (TS-1, PHP-1, PHP-2)                                                               |
| Medium                                 | 17 (TS-2..7, SHADOW, PY-1, PY-2, PY-4, PY-6, GO-1, GO-2, GO-3, PHP-3, PHP-4, PHP-10) |
| Low                                    | 27 (TS-8..14, PY-3,5,7..11, GO-4..9, PHP-5..9,11,12)                                 |
| Known deferred (reported, not counted) | 6 (KNOWN-1..6; KNOWN-2 recurs in all four adapters)                                  |

Top items (ordered):

1. PHP-1 (High): composer.json PSR-4 value given as an array (valid Composer) makes `PhpLanguageAdapter.analyzeFile` throw `TypeError` for every PHP file in that workspace (`php-language-adapter.ts:1873`).
2. PHP-2 (High): PHP never emits free-function, `self::`/`static::`/`parent::`/`Class::` static call facts (`php-language-adapter.ts:1499-1580` only handles `new` and `$var->m()`), although the spec requires `self`, `static`, `parent` receiver forms. No test covers it.
3. TS-1 (High): TypeScript default and namespace imports (`import d from './c'`, `import * as ns from './b'`) never produce a file `IMPORTS` dependency (`typescript-language-adapter.ts:71-78,1176-1230`); only named imports and side-effect imports do.
4. GO-1 (Medium, spec "MUST NOT"): Go `IMPLEMENTS` is claimed for an interface that embeds another interface even when the struct lacks the embedded interface's methods (`go-language-adapter.ts:515-530,670`).
5. PHP-3 / TS-7 (Medium): hierarchy targets are matched by simple (tail) name only, so `extends \Other\Base` binds to a local `App\Base` (PHP) and `extends ns.Base` binds to a local `Base` (TS). Python has the explicit "module.Name is not local Name" fix and a test; TS and PHP do not.

Cross-cutting (Medium): free-call resolution in TS (`typescript-language-adapter.ts:1458-1483`), Python (`python-language-adapter.ts:964-1020`) and Go (`go-language-adapter.ts:707-727`) picks `visible.at(-1)` / a package map entry by name and ignores parameter/local shadowing, so `function f(helper){ helper() }` yields a `CALLS f -> module helper` relation (CONFIRMED in all three).

---

## 1. code-graph:typescript-language-adapter

### 1.1 Requirements summary and status

| Requirement                                         | Status     | Evidence                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported languages, one parse, deterministic draft | PARTIAL    | `.ts/.tsx/.js/.jsx` mapped (`:85-93`, `:581-590`), but `.jsx` is reported as language `tsx` (TS-3). Keepalive state run-scoped (`:595-606`).                                                                                                                                                    |
| Declaration extraction and ranges                   | PARTIAL    | Functions, classes, methods, fields, enums, interface props, arrow/HOF vars, prototype/member assignments, destructuring present (`:632-780`). Missing: function overload signatures (KNOWN-1), `abstract` method signatures (TS-9). Ranges use full node and name node (`addSymbol :618-650`). |
| Object properties in array data records             | OK         | `isArrayDataRecordProperty :128-139`, tests `spec:517-660`.                                                                                                                                                                                                                                     |
| Logical identity and declaring owners               | OK/PARTIAL | Owners from containment (`collectTypeDeclarations :2308`), distinct forms (`typeScriptMemberSemantics :407`). Probe: static `save`, instance `save`, getter `p`, setter `p` all get distinct logical IDs. Object-literal/prototype methods location-backed. Top-level collapse bug TS-2.        |
| TS overload and declaration-group identity          | PARTIAL    | Method overloads: OK (group key `method:<owner>:<name>` `:1015`; probe shows 3 occurrences, one logical ID, kind `method`). Function overloads: KNOWN-1. Same-name functions in different namespaces/blocks wrongly grouped (TS-2).                                                             |
| Imports, exports, public bindings                   | PARTIAL    | Named/default/namespace/side-effect/dynamic/require extracted (`:1763-1887`); competing barrel routes tested. Defects: TS-1, TS-6, TS-8, TS-10, TS-11.                                                                                                                                          |
| Scoped bindings, calls, types, construction         | PARTIAL    | Facts emitted (`:1889-2310`); chained/nested calls OK. Defects TS-4, TS-12, SHADOW.                                                                                                                                                                                                             |
| Caller and local-binding semantics                  | PARTIAL    | Range containment via `findContainingCallableSymbol` (`:1976`). Anonymous callbacks become `<anonymous>` physical-only (`:1006`). Anonymous arg key not a symbol (verified by test 1499). Defect TS-4 (HOF vars).                                                                               |
| Hierarchy and provenance                            | PARTIAL    | EXTENDS/IMPLEMENTS/OVERRIDES + imported provenance (`:1346-1432`, test `spec:755`). Defect TS-7 (name-only match).                                                                                                                                                                              |
| Package/build-context boundary                      | OK         | `buildContext:false` (`:512`, asserted `spec:189`); conditional exports test `spec:1134`. No test for `tsconfig paths` (scenario text) beyond conditional exports.                                                                                                                              |
| Capability truthfulness                             | OK         | capabilities `:503-511`; hierarchy facts emitted.                                                                                                                                                                                                                                               |
| Parser-authoritative extraction                     | PARTIAL    | Almost all AST based. Text-based: `export *` detection (`:880`), template literal specifier (`:1858`), `receiver` text for non-identifier callee (`:2040-2046`). Unresolved import emits no relation (OK, `:1186-1190`).                                                                        |

### 1.2 Discrepancies

- TS-1 [High] CONFIRMED. `isFileOnlyImport` (`:71-78`) only covers SideEffect/Dynamic/Require/Blank. For Default/Namespace imports `resolveImports` (`:1169-1197`) looks for a symbol named `default` / `*` in the target file, finds none, and records neither `importMap` nor `fileImports`. Probe (`t6.ts`): `import * as ns from './b'` and `import d from './c'` -> `fileImports` only contains `d.ts` (named) and `b.ts` (from a separate side-effect import). Spec: "extract named, default, namespace ... imports", dependency relation when target identified. Code gap, spec is right. No test (tests only cover named; `spec:307`, `:755` inject the importMap by hand).
- TS-2 [Medium] CONFIRMED. `buildReferenceFacts` `:1015-1027` groups functions by `function:<file>:<name>` whenever more than one Function symbol has that name, without lexical evidence. Probe (`t5.ts`): `namespace A { export function f(){} } namespace B { export function f(){} }` and two sibling module-level blocks `{ const g = () => {} }` give the same `logicalId` for both. Violates "Same-name declarations ... separated by distinct lexical owners or scopes MUST remain competing logical targets" and "Equal names without an overload key remain separate". Routine-local ones are handled (`:1035-1046`); namespace/block-at-module-level are not.
- TS-3 [Medium] CONFIRMED. `langForFile :85-90` maps `.jsx` to `Lang.Tsx`; the language ID selection at `:901-906` is derived from `Lang`, so `.jsx` files return `language: 'tsx'` and the `'jsx'` branch is unreachable. Probe `t8.ts`. Spec: `.jsx` as `jsx`. No test analyzes a `.jsx`/`.tsx`/`.js` file for language ID (only the extension map `spec:993`).
- TS-4 [Medium] CONFIRMED. `isHofCall :367` + `processVariableDeclarator :1545`: `const names = items.map(x => x.name)` becomes `function:names` and is the caller of `items.map` (probe `t2.ts`). Spec: "A variable declarator initialized by an ordinary call_expression MUST NOT be classified as a callable function merely because its initializer is a call" vs "callable variable initializers including arrow and higher-order wrappers". Spec text is internally in tension; code classifies any call with a function argument as a wrapper (`items.map(cb)` is not a function-valued wrapper). Calls inside the inline arrow that has no call of its own are then attributed to `names`. Needs a spec/code decision.
- SHADOW [Medium] CONFIRMED (TS/Python/Go). `resolveVisibleFreeCallee :1458-1483` (TS), `resolveProvenLocalCallee :964-1020` (Py), `packageCallablesByName` (Go `:707-727`) match by name and never consult parameters or locals. Probe `t9.ts`: `function f(helper){ helper() }` + module `helper` => `CALLS f -> helper` in all three. Also TS: `function h(){ g() }` resolves to `namespace B { g }` (`visible.at(-1)` over members with undefined parent). Spec: "ambiguous receivers ... SHALL not produce guessed relations"; Python spec "Parameters ... SHALL be lexical bindings ... displace". Also `visible.at(-1)` silently picks the last of several candidates instead of declining.
- TS-5 [Medium] CONFIRMED. `buildRelations :1317-1327` emits `EXPORTS file -> symbol` for every symbol whose NAME is exported, including a class method `K.process` and a nested local `process` (probe `t7.ts`). `buildReferenceFacts :1102` also creates an extra `publicBinding` (no target) for the nested same-named local. Spec: members/unsupported method-like symbols "neither produces an ownerless logical member fact or package-level public binding".
- TS-6 [Medium] CONFIRMED. `:1858` accepts `template_string`; ``import(`./x/${name}.js`)`` and ``require(`./y/${n}`)`` are persisted as imports with specifier `./x/${name}.js` (probe `t4.ts`). Spec: non-literal dynamic imports and requires SHALL be dropped. Resolution will not find a file, but the import fact (and diagnostic) is wrong. Test `spec:866` only covers identifier arguments.
- TS-7 [Medium] CONFIRMED. `parseTypeNames/normalizeTypeReference :194-211` keep only the tail, `localTypeByName :1071` and `declarationsByName` in `buildRelations` match by simple name. `class A extends ns.Base implements other.Contract` produces `EXTENDS A -> Base` and `IMPLEMENTS A -> Contract` against local declarations (probe `h4.ts`). Python deliberately keeps the written spelling (`python-language-adapter.ts:1058-1065`, test `python spec:826`); no equivalent for TS.
- TS-8 [Low] `export * as ns from './x'` is treated as plain star re-export (`'export *'` text check `:880`; probe `t1.ts` shows `{importedName:'*', exportedName:'*'}`). Text-based and semantically wrong (namespace export, not flattening).
- TS-9 [Low] `abstract_method_signature` is not in `targetKinds` (`:632-653`); `abstract foo(): void` is not extracted (probe `t1.ts`). `abstract bar: string` is.
- TS-10 [Low] `import x = require('./eq')` and `export = foo` are dropped (import clause kind `import_require_clause` unhandled, `:1775-1840`).
- TS-11 [Low] Type-only imports are indistinguishable from value imports in `ImportDeclaration` (no flag; all become `ImportedType` bindings with `WHOLE_FILE_START`, `:1938-1957`). No promotion to value happens, so the "MUST not promote" rule holds, but the "type-only" extraction named in the spec has no marker and no test.
- TS-12 [Low] Non-identifier/non-member callees fall into the final `else` (`:2040-2046`): `obj['k']()` emits two `free` facts named `obj['k']()` and `obj['k']`; `foo()()` emits `free` named `foo()`. Names are raw text, not a parser-proven name. No relation results, but the facts are guessed.
- TS-13 [Low] `static` call form inferred when `receiverName` equals any Class/Enum symbol name in the file regardless of scope (`:2018-2028`).
- TS-14 [Low] `this.a.b()` is recorded with receiver `a` (drops `this`), `:2008-2014`; deliberate but undocumented.

### 1.3 Known deferred (reported as known)

- KNOWN-1 TS function overload signatures not extracted: `function_signature` is absent from `targetKinds`; probe shows only the implementation `ov2`. `declare function` signatures also absent. Method overloads work.
- KNOWN-2 Import `LocalBinding` range is `WHOLE_FILE_START` (`:1138-1151`, `item.range ?? WHOLE_FILE_START`; ImportDeclaration has no `range` set by the extractor).

### 1.4 Test coverage

Covered by tests: declarations/ranges (`spec:351-690`), array-record omission (`:517-660`), Property kind (`:1425`), owner-qualified members and forms (`:196-265`, `:1598-1650`), overload member grouping (`:1544`), nested/sibling local functions (`:1579`, `:1652`), ArchiveChange anonymous-key regression (`:1499`, `:1686`), dynamic import and chained call (`:1468-1497`), hierarchy with import provenance (`:733-822`), re-export routes (`:267-350`, `:1084-1416`), conformance suite (`conformance:603-985`).

Missing tests:

- default/namespace import file dependency (TS-1); `resolveImports` for relative imports is only exercised through a re-export alias.
- `.tsx`, `.jsx`, `.js` analysis and language ID (TS-3); no "equivalent inputs analyzed twice" per extension.
- Same-name functions in different namespaces or module-level blocks (TS-2).
- Template literal with substitution (TS-6).
- `extends ns.Base` not matching local `Base` (TS-7).
- `export * as ns`, `abstract` methods, `import = require`, `const x = items.map(cb)` (TS-4/8/9/10).
- Parameter shadowing of a module function (SHADOW).
- Optional chaining `a?.b()` and generic `f<T>()` calls: conformance fixture `boundarySupport` covers them, but no TS-specific assertion on exact facts was found outside the conformance file (not individually verified).
- Scenario "Unsupported project selection is not guessed" has only the conditional-exports test; nothing for `tsconfig` `paths`.

---

## 2. code-graph:python-language-adapter

### 2.1 Requirements summary and status

| Requirement                                       | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supported files, one parse, deterministic         | OK      | `.py/.pyi` (`:344-352`), keepalive run-scoped (`:366-374`), test `spec:555`.                                                                                                                                                                                                                                                                                             |
| Parser-authoritative structural extraction        | PARTIAL | AST-based, but f-string dynamic import accepted (PY-3), keyword bases kept as bases (PY-4). Unresolved import emits nothing (OK). Imported base provenance (`:837-860`, test `spec:399`).                                                                                                                                                                                |
| Declaration extraction and ranges                 | PARTIAL | Functions, classes, methods incl. decorated, module and class assignments (Property for class attrs / dataclass / Protocol) (`walk :1566-1690`). Nested functions are extracted as symbols but demoted to physical-only in `buildReferenceFacts :615-625` (OK vs "not approximated as supported declarations"). A class defined inside a function is NOT demoted (PY-5). |
| Logical identity and declaring owners             | OK      | owner via class nesting (`collectClassInfo :1029`), forms from decorators (`pythonMemberSemantics :130`); test `spec:209-260`.                                                                                                                                                                                                                                           |
| Imports and package resolution                    | PARTIAL | Module-level only (PY-1); `from . import module` unresolved (PY-2); name-only resolution of absolute imports (PY-6); src layout KNOWN-3.                                                                                                                                                                                                                                 |
| Resolution manifests                              | OK      | `resolutionManifests() -> ['pyproject.toml']` (`:1749`), `[project].name` only (`readPythonProjectName :1770`), tests `spec:601-663`.                                                                                                                                                                                                                                    |
| Scoped bindings, calls, annotations, construction | PARTIAL | Decorator calls (`:1460`), field annotation USES_TYPE (`:896-915`), receiver bindings. Defects SHADOW, PY-7.                                                                                                                                                                                                                                                             |
| Caller containment/classification                 | OK      | `findContainingCallableSymbol`; module-level call has no caller; class decorator caller = class (probe `p1.ts`, tests `spec:869-1100`). Default-argument calls attributed to the function (`m(self, a=default_fn())`) since the call lies inside the function node range: consistent with range containment.                                                             |
| Hierarchy and provenance                          | PARTIAL | Bases kept in order, `Protocol` -> IMPLEMENTS, OVERRIDES local-only (`:810-850`). Defects PY-4, PY-8. C3 MRO not claimed.                                                                                                                                                                                                                                                |
| Public surface and stub behavior                  | PARTIAL | No public bindings (`publicBindings: []` `:679`). `.py` and `.pyi` share the same module surface (PY-9).                                                                                                                                                                                                                                                                 |
| Capability truthfulness                           | OK      | `hierarchy:true`, `buildContext:false` (asserted `spec:185`).                                                                                                                                                                                                                                                                                                            |

### 2.2 Discrepancies

- PY-1 [Medium] CONFIRMED. Imports are collected only from `root.children()` (`:430`). `import`/`from` inside `try:`, `if TYPE_CHECKING:`, `if`, or function bodies are lost (probe `p1.ts`: `optional`, `typing_only`, `inner_imp` absent). Spec places no module-level restriction on `import ... / from ... import ...`. Dynamic `import_module` calls are found anywhere (they use `collectByKind`).
- PY-2 [Medium] `resolveRelativeImportPath :1693-1735` returns only `__init__.py[i]` for `from . import X` / `from .. import X` (`:1722-1726`); a sibling module `X.py` or package `X/__init__.py` is never a candidate. `import_from_statement` with an empty module part therefore never resolves `from . import models` when `models` is a module. Spec: "deterministic module/package candidates including module files". Not covered by tests (`spec:579-600` test dot-prefixed with module part).
- PY-3 [Low] CONFIRMED. `ak === 'string'` (`:523`) accepts f-strings; `importlib.import_module(f"pkg.{name}")` records specifier `f"pkg.{name}` (probe `p1.ts`). Should be dropped as non-literal.
- PY-4 [Medium] CONFIRMED. `collectClassInfo :1051-1068` records every argument of the superclass list verbatim: `metaclass=M`, `*mixins`, `Generic[T]`, `Base[T]` become "bases" (probe `p2.ts`). Consequences: precedence indices shift after keyword arguments; `class Repo(Base[T])` loses EXTENDS because the raw text `Base[T]` does not equal `Base`; `Protocol[T]` is not detected as Protocol (`kind` check uses `normalizePythonTypeName('Protocol[T]')`).
- PY-5 [Low] CONFIRMED. A `class Local:` defined inside a function is emitted with a logical module-level identity (no owner, `isNestedFunction` only demotes `SymbolKind.Function`); two functions each defining `Local` collapse to one logical `.../a|Local` (probe `p2.ts`). Its methods get owner `Local`. Spec: "Python has no implicit overload grouping ... same-name competing declarations MUST remain distinct" and nested-function precedent.
- PY-6 [Medium] `resolveImports :704-770`: for absolute imports, when `packageToWorkspace` knows the package, the import resolves to the single workspace symbol named `originalName` (`candidates.length === 1`, `:737-746`) regardless of the module path in the specifier. `resolveQualifiedNameToPath` is a stub returning `undefined` (`:299-307`), so `import a.b.c` (Namespace) and `from pkg.mod import Name` never get a module-file dependency from specifier evidence; the only absolute resolution is a name-only unique match. Spec: "MUST NOT be replaced by name-only inference". (src/ layout is KNOWN-3.)
- PY-7 [Low] Quoted forward-reference annotations are bound with the quotes in the target name (`a: "Fwd"` -> `targetName '"Fwd"'`, probe `p3.ts`). Subscript/call: `d['k']()` emits a `free` fact named `d['k']`.
- PY-8 [Low] `localClassByName` (`:654`, and `classesByName :812`) is keyed by simple name; with nested and top-level classes of the same name the last wins.
- PY-9 [Low/ambiguous] CONFIRMED. `surface = filePath.replace(/(?:\/__init__)?\.pyi?$/, '')` (`:604`): `foo.py` and `foo.pyi` produce identical logical IDs for the same declaration names (3 of 3 shared, probe `p4.ts`), i.e. the stub and the runtime module are merged into one logical target. Spec: ".pyi declarations SHALL participate as declarations without executing or merging runtime modules speculatively". Arguably intended (stubs describe the module); spec text should say so or the code should keep them apart. Same replacement also makes `pkg/__init__.py` and `pkg.py` the same surface.
- PY-10 [Low] Imports with relative `isRelative` start with `.`; `from x import *` produces no import at all (wildcard ignored, no file dependency). Static star expansion is correctly unsupported, but the dependency evidence is lost.
- PY-11 [Low] `importlib` detection requires the literal object name `importlib` (`:508`); `import importlib as il` / `from importlib import import_module` are not recognized.

### 2.3 Known deferred

- KNOWN-3 `src/` layout candidates not generated by `resolveRelativeImportPath` / `resolveImports`.
- KNOWN-2 `WHOLE_FILE_START` on import bindings (`:667-676`).

### 2.4 Test coverage

Covered: owners/forms/bases (`spec:192-290`), ranges (`:297`), literal vs variable dynamic import (`:468`), annotation facts (`:481`), manifests and identity (`:601-663`), property kinds (`:673`), decorator calls (`:710`), unknown receiver / `self.method` / bare-call-to-method (`:738-785`), multiline decorators (`:786`), `module.Name` base (`:826`), field USES_TYPE (`:847`), regression block (`:869-1100`: containment, nested function, string/comment isolation).

Missing tests: imports nested in `try`/`if`/functions (PY-1); `from . import module` resolution (PY-2); f-string dynamic import (PY-3); keyword/starred/subscripted bases (PY-4); class inside function (PY-5); `.pyi` vs `.py` identity (PY-9); `Protocol[T]`; parameter shadowing (SHADOW); `__all__` non-inference (scenario "Module visibility is not inferred" has no direct assertion found); multiple-base owner-path provenance steps (scenario "Multiple bases preserve owner traversal order" is only covered by `spec:261` on parser state - not by resolver traversal); unsupported-MRO ambiguity (belongs to resolver, not adapter).

---

## 3. code-graph:go-language-adapter

### 3.1 Requirements summary and status

| Requirement                                     | Status     | Evidence                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported files, one parse, package from source | PARTIAL    | `.go` mapped; no toolchain. The declared package (the `package` clause) is never read: `goPackageSurface :183-190` derives the surface from the directory (GO-6).                                                                                                     |
| Parser-authoritative extraction                 | OK/PARTIAL | Declarations, imports, calls, receivers from AST; regexes only on identifiers/literals (`:539,790,1027...`). Generic call `Gen[int](1)` dropped (KNOWN-4). Unresolved import: no relation (OK).                                                                       |
| Declaration extraction and ranges               | PARTIAL    | Functions, methods, struct (Class), interface, alias/named types, var/const, struct fields (Property) (`analyzeFile :302-345`, `extractTypeDeclaration :1233`). Only the first name of a multi-name `var`/`const` spec is extracted (GO-4).                           |
| Package identity, exports, imports              | PARTIAL    | Uppercase -> public binding (`:539`); alias/dot/blank/single/grouped extracted (`:922-966`). Blank import dependency not resolved (GO-2).                                                                                                                             |
| Resolution manifests                            | OK         | `['go.mod']` (`:1371`), test `spec:560`.                                                                                                                                                                                                                              |
| Go logical identity and declaring owners        | PARTIAL    | Receiver type parsed from AST receiver nodes (`:833-893`), pointer evidence retained (`pointerReceiverMethodIds`), fields owner = struct. Generic receivers `(s *Stack[T])` yield receiver name `Stack[T]` and the methods get no owner (GO-5).                       |
| Scoped bindings, selectors, construction        | PARTIAL    | Facts emitted. Cross-package `pkg.Func()` CALLS is not built by the adapter (see GO-3).                                                                                                                                                                               |
| Caller containment/classification               | OK         | `findContainingCallableSymbol`; function literals are not callers (calls inside `func(){...}()` are attributed to the enclosing func); competing same-name declarations -> physical-only (`:466-474`); no overload groups (`supportsLogicalDeclarationGroups:false`). |
| Embedding and hierarchy provenance              | OK         | Interface embedding -> EXTENDS with precedence (`:502-512`, `:645-662`); struct embedding unsupported (embedded field not a Property; probe `g1.ts`).                                                                                                                 |
| Proven interface satisfaction                   | PARTIAL    | Empty method set rejected (`:525`), missing method rejected (test `spec:257`). Defects GO-1 (embedded requirements) and KNOWN-5 (pointer/value).                                                                                                                      |
| Build-context boundary                          | OK         | `buildContext:false`, test `spec:185`.                                                                                                                                                                                                                                |
| Capability truthfulness                         | OK         | hierarchy emitted.                                                                                                                                                                                                                                                    |

### 3.2 Discrepancies

- GO-1 [Medium, spec MUST NOT] CONFIRMED. IMPLEMENTS is decided only from the interface's DIRECT methods (`interfaceMethods[name]` is the list of the interface's own method names; `:515-530` and `:664-684`). For `type RW interface { Reader; Write() }` and a struct with only `Write()`, `IMPLEMENTS S -> RW` is emitted even though `Read` (embedded requirement) is not provided (probes `g1.ts`, `g2.ts`). Spec: "MUST NOT claim satisfaction for ... embedded-interface requirements". No test covers an interface that embeds another with a struct. Fix direction: skip any contract with non-empty `interfaceEmbeds`, or include embedded methods.
- GO-2 [Medium] CONFIRMED. `resolveImports :588-590` does `if (isFileOnlyImport(imp)) continue`, and `isFileOnlyImport :63-70` includes `Blank`. Blank imports (`_ "example.com/m/driver"`) therefore never produce a file dependency (probe `g3.ts`: `fileImports` only contains the dot-import target). Spec: "Blank imports SHALL create dependency evidence without a local symbol binding". Test `spec:430` checks classification/bindings only, not resolution.
- GO-3 [Medium, scenario gap] `buildRelations :707-727` can only create CALLS for (a) `importMap.get(call.name)` (importMap is filled only from `qualifiedNames`, never from the directory package resolution; the loop only appends `fileImports`) and (b) `Free` calls to package-level callables in the same file's symbol list. A selector call `models.NewUser()` is never matched by the adapter. Verify sheet scenario "a CALLS relation connects the caller to the resolved target function or receiver method" for an imported indexed package: the only test (`spec:676`) is a same-file bare call with an empty `importMap`. May be covered by the shared scoped-binding resolver (`domain/services/scoped-binding-environment.ts:525` handles Member/Static forms); I did not trace that end to end. Also `packageCallablesByName` is built from this file only (not the whole package), so calls to functions in sibling files of the same package are not resolved by the adapter either.
- GO-4 [Low] CONFIRMED. `extractVarOrConst :1327-1346` uses `child.field('name')` which returns only the first identifier: `var V, W = 1, 2` and `var a, b int` extract only `V` / `a` (probes `g1.ts`, `g2.ts`).
- GO-5 [Low] CONFIRMED. Receiver `*Stack[T]` / `Stack[T]` -> receiver key `Stack[T]` (`:857-866`, probe `g2.ts` shows `methodReceivers: {"Stack[T]": ...}`), so `Push` and `Len` get no owner and are omitted from logical declarations (declarations list lacks them). Struct `Stack` itself is fine. Type-set/generic constraints are out of scope per spec, but receiver normalization of type-parameter lists is plain syntax.
- GO-6 [Low] The `package` clause is not parsed anywhere (`package_clause` not referenced); package surface = directory. Two packages in one directory (e.g. `package foo` and a `//go:build ignore` `package main` file), or `package foo_test` in non-`_test.go` files, collapse to one surface. Spec: "derive the declared package from source".
- GO-7 [Low] Dot import becomes a `LocalBinding` named `.` (`localName: '.'`, `:957,978`); spec asks only that it not bind unqualified names - binding named "." is harmless but odd. Import `localName` defaults to the last path segment (`/v2`, `go-foo` paths give wrong package name); declared name would need the target package's clause.
- GO-8 [Low] Call resolution does not respect local shadowing (SHADOW): `helper := 1; helper()` and a parameter `helper func()` both resolve to package `helper` (probe `t9.ts`).
- GO-9 [Low] `go.mod` parsing is `content.match(/^module\s+(\S+)/m)` (`:1387`): quoted module path or an indented/commented line not handled. Allowed by spec (textual manifest), but quoted form is legal.

### 3.3 Known deferred

- KNOWN-5 Go IMPLEMENTS method-set: no pointer-vs-value filtering (a value type is treated as implementing an interface whose methods have pointer receivers; evidence retained in `pointerReceiverMethodIds` but not used in the decision at `:525` / `:670`).
- KNOWN-4 Go generic calls `Gen[int](1)` declared unsupported (no fact emitted, probe `g1.ts`).
- KNOWN-2 `WHOLE_FILE_START` for import bindings (`:560-570`).

### 3.4 Test coverage

Covered: symbols/ranges/kinds (`spec:292-372`), EXTENDS for embedded interface and basic IMPLEMENTS (`:389-427`), pointer receiver evidence and incomplete method set (`:257`), compact same-line interface (`:278`), import forms (`:430-445`), selector/composite/type facts (`:446`), manifests (`:560`), parentId for method/field (`:585,617`), multiline receiver (`:648`), bare call -> CALLS (`:676`), selector on unknown value (`:729`), package import directory resolution (`:757-835`), field identity (`:836`), short-var/receiver/overload regressions (`:859-987`), lookalike isolation (`:989`).

Missing tests: embedded interface IMPLEMENTS non-claim (GO-1); blank-import dependency (GO-2); cross-package selector CALLS (GO-3); multi-name var/const (GO-4); generic receivers (GO-5); `package` clause vs directory (GO-6); struct-promotion non-emission has no dedicated test (scenario "Struct promotion remains unsupported" - verified only by my probe, `g1.ts`); build-alternatives scenario only asserts `buildContext:false`.

---

## 4. code-graph:php-language-adapter

### 4.1 Requirements summary and status

| Requirement                                 | Status  | Evidence                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported files, one parse, no execution    | PARTIAL | `.php` (`:490`), keepalive run-scoped. Persisted `parserState.scopes` stores full callable body text (`:616-632`, unused): not "compact".                                                                                                                                                                                   |
| Parser-authoritative extraction             | PARTIAL | Declarations, require/include, loaders from AST (`collectRawDynamicLoaders :1992`, `walkRequires :540`). Textual checks: trait-adaptation test `member.text().includes('{')` (`:1207`); import resolution parses symbol IDs with a regex (`:917`, ID string, not source).                                                   |
| Declaration extraction and ranges           | PARTIAL | Functions, classes, interfaces, traits (Type), enums, methods, properties, class constants, enum cases, top-level `const` (`:1655-1795`). Missing: promoted constructor properties (PHP-7), symbols inside `if (!function_exists())` blocks (PHP-8). Multi-element property declarations share one construct range (PHP-9). |
| Logical identity and declaring owners       | OK      | namespace-qualified surface (`:677`), owner from containment, properties/consts/cases get owner + parentId (tests `spec:1480-1565`). Case preserved.                                                                                                                                                                        |
| Namespaces, use aliases, Composer           | PARTIAL | `use A as B` local binding, no public export. Group use missing (PHP-4); `use function/const` treated as class imports (PHP-6); PSR-4 array crash (PHP-1); resolved path not checked against indexed files (PHP-10).                                                                                                        |
| Resolution manifests                        | OK      | `['composer.json']` (`:1807`), test `spec:705`.                                                                                                                                                                                                                                                                             |
| Static and framework dependency facts       | OK      | require/include literal-only; variable/concat dropped (tests `spec:864-891`); framework loaders (`spec:892-1100`); alias scoping (`:1422`).                                                                                                                                                                                 |
| Scoped bindings, calls, types, construction | PARTIAL | `new` and `$var->m()` only (PHP-2). Typed params/returns/props bindings (`:1355-1400`).                                                                                                                                                                                                                                     |
| Caller containment                          | OK      | `findContainingCallableSymbol` over function/method; closures attributed to the enclosing method (physical-only closures not represented), tests `spec:1568-1680`.                                                                                                                                                          |
| Hierarchy and provenance                    | PARTIAL | EXTENDS/IMPLEMENTS/trait UsesType, OVERRIDES local (`:975-1090`). Name-only tail matching (PHP-3). Trait use with an adaptation block drops all traits of that statement (PHP-5).                                                                                                                                           |
| Public surface and capability truthfulness  | OK      | `publicBindings:false`, `buildContext:false` (`:416-425`); neither `publicBindings` nor `buildContext:false` is asserted in the PHP spec file (only TS/Python/Go assert capability objects).                                                                                                                                |

### 4.2 Discrepancies

- PHP-1 [High] CONFIRMED. `buildPsr4Map :1861-1877` runs `path.resolve(codeRoot, relDir)` on each PSR-4 value; Composer allows an array of directories (`"App\\": ["src/", "lib/"]`). Probe `h2.ts`/`h3.ts`: `analyzeFile` and `resolveQualifiedNameToPath` throw `TypeError [ERR_INVALID_ARG_TYPE]`. `prepareResolutionMetadata` runs at the start of every `analyzeFile` (`:503`), so all PHP files in that workspace fail analysis. Spec: PSR-4 resolution with longest prefix; ambiguous alternatives unsupported "until explicitly modeled" (must not crash). Also directories are resolved against `codeRoot` even when `composer.json` was found in a parent directory (`findManifestField` walks up), which mis-bases relative paths.
- PHP-2 [High] CONFIRMED. `extractCallFactsFromData :1499-1580` handles only `object_creation_expression` and `member_call_expression` whose object is a plain variable or `$this->prop`. Not emitted: plain function calls (`other()`), `self::stat()`, `static::lsb()`, `parent::__construct()`, `Class::method()` (`scoped_call_expression`), `$cls::m()`, closures/arrow bodies (attributed to the enclosing method when the call is a member call). Probe `h1.ts`: of a method with ~10 calls only `new Thing`, `$x->run`, `$this->interp`, `new Foo` were emitted. Spec: facts for "`$this`, `self`, `static`, and `parent` receiver forms" and "CALLS ... when target proven". `$this->$name()` emits a `member` fact named `$name` (dynamic method name, should not be a named fact). Only `scoped_call_expression` at `:2174` is used by the loader code, not by call facts. Optional/nullsafe and chained calls are KNOWN-6. No test of `self::`, `parent::`, `static::` (grep of the PHP spec file finds none).
- PHP-3 [Medium] CONFIRMED. `getPhpClassTail` (`:317`) is applied to `extends`, `implements`, trait names (`:1186-1218`) and to typed parameter targets (`:1359,1374`); the hierarchy then matches by simple name (`typeSymbolIdByName :694`, `infoByName :988`). Probe `h4.ts`: `class A extends \Other\Base implements \Vendor\Contract` in namespace `App` produces `EXTENDS A -> App\Base` and `IMPLEMENTS A -> App\Contract`. Spec: no name-only inference; hierarchy via local declarations and proven imports. Needs namespace resolution (current namespace + `use` map + fully-qualified names).
- PHP-4 [Medium] CONFIRMED. `extractNamespaceUse :1601-1650` only handles `namespace_use_clause` children of `namespace_use_declaration`; group use `use App\Contracts\{Saver, Loader as L};` (`namespace_use_group`) is not extracted (probe `h1.ts`: no `Saver`/`L`). `class ... implements Saver` then cannot resolve. Spec: "supported class-like `use X as Y` imports".
- PHP-5 [Low/Medium] `if (member.text().includes('{')) continue` (`:1207`) skips the whole `use T1, T2 { ... }` statement, so no trait edge is stored for either trait (probe: `Model` has `traitNames: []`). Conflict handling then relies on there being no edge: a lookup of an adapted trait member on `Model` can skip the traits and continue to the parent class, selecting an ancestor member that the (unparsed) trait would shadow. Spec: adaptation-dependent lookup "SHALL remain ambiguous or unresolved". Also the `{` test is textual (a `{` in a comment would trigger it). Test `spec:354` checks that no precedence is guessed; whether resolution then falls through to the parent was not tested.
- PHP-6 [Low] `use function App\helpers\fn1;` and `use const App\C1;` are recorded as class-like `named` imports with local bindings in the Type space (probe `h1.ts`). Spec limits to class-like uses.
- PHP-7 [Low] Promoted constructor properties (`private readonly string $promoted`) are not extracted as Property symbols (`walkClassBody` handles only `property_declaration`, `:1738-1795`).
- PHP-8 [Low] Declarations nested in blocks (`if (!function_exists('x')) { function x(){} }`, `return` closures, or non-top-level) are not extracted (`extractSymbolsFromNode` only descends into the program and bracketed namespace bodies). `define('X', 1)` is not a constant declaration (consistent with spec).
- PHP-9 [Low] For `public int $id = 0, $other = 1;` both properties use the whole `property_declaration` node as construct range (`:1771-1776`); dedup key includes the name so both are kept, but construct ranges are identical and larger than each element.
- PHP-10 [Medium] `resolveQualifiedNameWithMap :1903-1914` returns `path.join(dir, relative + '.php')` for the longest-matching prefix without consulting indexed files, and `resolveImports :845-855` pushes it into `fileImports` as found. Spec: "resolve through precomputed Composer PSR-4 mappings using the longest matching prefix and shared indexed-file lookups". Relation emission still depends on the indexer filtering unknown files (not verified here). Also the prefix test is a bare `startsWith(prefix)` (Composer prefixes end with `\`, so OK in practice; the PSR-4 map is not validated).
- PHP-11 [Low] `parserState.scopes[].text = node.text()` (`:616-632`) persists the full text of every function/method body for no consumer (`PhpScopeInfo` is unused after being stored). Contradicts "compact serializable parser state" and bloats persisted analysis.
- PHP-12 [Low] `buildRelations :917` locates the file part of a symbol ID with a regex over the ID string; a path containing `:class:` etc. would mis-split. Not a source regex (spec scope is source), listed for completeness.

### 4.3 Known deferred

- KNOWN-6 PHP optional (`?->`) and chained calls unsupported: `$obj?->nullsafe()` and `(new Foo)->chain()->more()` produce no (or only the first) fact.
- KNOWN-2 `WHOLE_FILE_START` on import bindings.

### 4.4 Test coverage

Covered: use alias local binding (`spec:249`), owners and local hierarchy (`:267`), member forms (`:295-345`), trait composition and adaptation non-guess (`:322,354`), compact same-line (`:371`), symbol kinds and ranges (`:385-470`), EXTENDS/IMPLEMENTS/OVERRIDES (`:481`), injected `filePaths` (`:507`), imported EXTENDS (`:520`), shared facts (`:588`), Composer/PSR-4 (`:711-844`, including no-FS Pass 2 at `:794`), require/include (`:845-890`), dynamic loaders and loaded-instance calls (`:892-1450`), properties/consts/cases (`:1480-1565`), regressions (`:1568-1700`).

Missing tests: PSR-4 array value (PHP-1); `self::`/`static::`/`parent::`/`Class::` and plain-function calls (PHP-2); fully-qualified or differently-namespaced parent with same short name (PHP-3); group `use` (PHP-4); trait with adaptation and parent member (PHP-5); `use function/const` (PHP-6); promoted constructor property (PHP-7); conditional declarations (PHP-8); multi-element property ranges (PHP-9); capability object (`publicBindings:false`, `buildContext:false`, `hierarchy:true`) is asserted for TS/Py/Go but not for PHP.

---

## 5. Cross-spec consistency (`code-graph:language-adapter`, `code-graph:symbol-model`)

No direct contradiction was found in the merged language specs. Tensions worth resolving:

1. language-adapter "Member semantics and declaration parent" says nested functions enclosed within a routine get `parentId`, while python spec says nested functions "remain unsupported" and the verify scenario says they must not be "approximated as supported declarations". The code reconciles this by emitting a physical-only symbol with `parentId` and no logical declaration (`python-language-adapter.ts:615-625`). The two specs should state this explicitly. The same rule is not applied to nested classes (PY-5).
2. TS spec: "A variable declarator initialized by an ordinary call_expression MUST NOT be classified callable merely because its initializer is a call" vs "callable variable initializers including arrow and higher-order wrappers" (TS-4). The word "merely" is not enough for implementers; define what a higher-order wrapper is.
3. TS spec "united under a single logical symbol" for function overloads is stated as a plain requirement while it is a known deferral (KNOWN-1); the merged spec has no "partially supported" marker.
4. PHP spec "extract ... literal loader invocations" and "`$this`, `self`, `static`, and `parent` receiver forms" (PHP-2) versus language-adapter scenario "PHP framework-managed binding feeds shared facts" (only `$this->Article->save()`): the language-adapter scenario is satisfied, the PHP spec sentence is not.
5. Go `MemberKind.Field` for struct fields (`go-language-adapter.ts:~505`) vs `MemberKind.Property` in TS/Python/PHP; SymbolKind is Property everywhere. symbol-model defines both `field` and `property` member kinds but the Go/PHP/Python/TS specs only mandate `SymbolKind.Property`. Informational.
6. Go spec "derive the declared package from source" vs language-adapter's directory-based surface wording (GO-6).
7. Python spec ".pyi declarations ... without merging runtime modules speculatively" vs identical logical surface for `.py`/`.pyi` (PY-9).
8. language-adapter requires `resolutionManifests()` to name only basenames the adapter reads; true for all four (verified `typescript :2700`, `python :1749`, `go :1371`, `php :1807`; tests `resolution-manifests.spec.ts`, per-adapter specs).

## 6. Where spec and code disagree: which side looks right

- TS-1, GO-2, PHP-1, PHP-2, GO-1, TS-6, TS-7, PHP-3, PHP-4: spec is right, code incomplete or wrong.
- TS-4, PY-9, PHP-5, TS-2 (group key fallback): spec is ambiguous or silent; code behavior is a defensible choice but contradicts one reading. Needs a spec clarification.
- Python/Go/PHP `varargs`/`nested` semantic limits listed as unsupported in the spec (nested functions, struct promotion, Composer classmap, MRO): code agrees with spec.

## 7. Items checked and found OK (no action)

- Determinism of repeated analysis (conformance `:710`), unresolved imports -> no relation (conformance `:963`, TS `spec:717`, Python `:362`, Go `:799`, PHP `:846`), imported hierarchy provenance on all four (conformance `:869`), no filesystem reads in Pass 2 (conformance `:897`, PHP `:794`), manifests exact lists, Python `[project].name` precedence, Go value/pointer receivers parsed from AST, array-record omission, anonymous argument keys, Property kinds with `parentId`, owner-qualified same-name members, PHP alias scoping across methods.

---

# Partial C: code-graph:traversal, code-graph:graph-store, code-graph:sqlite-graph-store (round 3)

Change: `cross-language-symbol-semantics`. Read-only audit. Specs read via `changes spec-preview` (merged, with verify scenarios).
Tests run (all green): `traversal.spec.ts`, `analyze-files-impact.spec.ts`, `sqlite-graph-store.spec.ts`, `sqlite-wide-traversal.spec.ts` -> 224 pass / 0 fail.
Also queried a copy of the repo's real graph DB (`.specd/config/graph/code-graph.sqlite`, schema 15, already has `local_bindings.start_line`).

## Answer to the schema-15 question (pre-amendment v15 DB lacking `start_line`)

Findings:

- `assertExistingSchemaCompatible` (`sqlite-graph-database.ts:2674-2689`) and `ensureSchemaVersion` (`:2693-2712`) compare only `meta.schemaVersion` to `SQLITE_SCHEMA_VERSION` (15).
- `configureDatabase` runs `CREATE TABLE IF NOT EXISTS` (`schema.ts:105`), which is a no-op on an existing `local_bindings` table. The open succeeds and the first statement touching `start_line` fails with a raw `SqliteError: no such column: start_line`. That statement is `findLocalBindings` (`:2479`), `getAllReferenceFacts` (`:1262`) or the bulk/`replaceReferenceFacts` insert (`:3538`).
- That error is not typed. `getStorageRecoveryReason` (`:4783-4800`) only maps `GraphSchemaIncompatibleError`, `SQLITE_CORRUPT` and `SQLITE_NOTADB`. So `run-index-project-graph.ts:118-120` does not call `provider.recreate()`, even with `--force`.
- `--force` uses the logical `clear()` path (spec: "healthy forced reindex MUST NOT delete/recreate"). `clearLogicalGeneration` (`:3144-3170`) works on the old table. The following insert then fails again. This matches the reported symptom.

Do the specs require recreate on such a mismatch? No.

- sqlite `Reference schema upgrade` explicitly says the `local_bindings` range columns "belong to schema version 15, which this change introduces; no separate version is created".
- Recovery is defined only by version mismatch: 14, <14 and >15 reject with `SCHEMA_INCOMPATIBLE`, and `graph index` recreates.
- No spec text covers same-version structural drift. So this is a spec gap, not a code violation.
- HEAD had `SQLITE_SCHEMA_VERSION = 14` (`git diff`: `-14 +15`), so only developer DBs built mid-change at "15" are affected.

Recommendation (a decision for the owner):

- (a) Keep as is and document "delete `.specd/config/graph` or bump".
- (b) Add a structural guard in `assertExistingSchemaCompatible` (`PRAGMA table_info(local_bindings)` / `logical_declarations`, mapped to `GraphSchemaIncompatibleError`) and amend the sqlite spec. This makes `--force` self-heal via the existing typed-recovery flow.
- (c) Bump to 16, which contradicts the spec sentence above.

Severity: LOW for release (v15 unreleased). MEDIUM for dev ergonomics.

---

## Spec 1: code-graph:traversal

Requirements summary and status:

| Requirement                                               | Status         | Evidence                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream/Downstream traversal, cycle, maxDepth, truncated | OK             | `get-upstream.ts:44-135`, `get-downstream.ts` (mirror); tests `traversal.spec.ts:108-490`                                                                                                                                                  |
| Bounded batched traversal                                 | PARTIAL        | frontier uses `getIncoming/OutgoingSymbolRelations` + `getSymbolsByIds` (OK). `includeFiles` branch is per-file (see C-5). `Promise.all(roots.map(getSymbol))` is unbounded (C-9). `queryImpactFrontier` is not memoized (C-6).            |
| Bounded hotspot hierarchy                                 | OK             | `compute-hotspots.ts:76-117` one `getIncomingSymbolRelations` with EXTENDS/IMPLEMENTS/OVERRIDES; test `compute-hotspots.spec.ts:418`                                                                                                       |
| TraversalOptions/Result                                   | OK             | defaults 3/true, structure OK                                                                                                                                                                                                              |
| Impact analysis (counts, risk, omittedCounts, hierarchy)  | PARTIAL        | `analyze-impact.ts`; `computeRiskLevel` matches the spec table (`risk-level.ts:33-48`). `affectedProcesses` is always `[]` and `processCount` is hard-coded 0 (C-12). Counts use `Math.max(symbol,file)` rather than a sum (undocumented). |
| Filtered impact results                                   | OK             | store-side predicates; `types` materialization; `affectedSpecs` empty when not requested                                                                                                                                                   |
| Static type dependency impact                             | OK             | `SYMBOL_IMPACT_RELATION_TYPES` (6 types)                                                                                                                                                                                                   |
| File impact                                               | PARTIAL        | see C-3, C-4, C-6                                                                                                                                                                                                                          |
| Spec impact                                               | PARTIAL        | N+1 in the unfiltered path (C-11)                                                                                                                                                                                                          |
| Change detection                                          | PARTIAL        | duplicated risk thresholds, no category admission (C-10)                                                                                                                                                                                   |
| Pure functions                                            | OK             | per-call memo caches only                                                                                                                                                                                                                  |
| Resolved canonical / public-binding impact                | PARTIAL (HIGH) | see C-1                                                                                                                                                                                                                                    |
| Logical-target aggregation                                | OK             | `analyze-impact.ts:176-560`, `semanticCounts` distinct from physical counts; tests `traversal.spec.ts:1189-1380`                                                                                                                           |
| Owner-qualified impact target                             | N/A here       | resolver-level (`resolve-graph-selector` / `resolve-symbol-reference`), not audited in this batch                                                                                                                                          |
| File-impact covering specs                                | PARTIAL        | see C-3, C-4                                                                                                                                                                                                                               |
| Logical symbol coverage during impact                     | PARTIAL        | see C-2, C-4                                                                                                                                                                                                                               |

### Discrepancies

**C-1 (HIGH, code/spec, production data)**
The exact public-binding view cannot work against a real index.

- `analyzePublicBindingImpact` (`analyze-impact.ts:118-153`) seeds `bindingImpact` from `[binding.id]` and reads relations whose target is the binding id.
- The indexer only persists dependency relations to physical symbol ids (`scoped-binding-environment.ts:173,188,229`; `index-code-graph.ts:1226-1236`).
- Real DB check: 5922 `public_bindings`, 0 relations targeting them. `bindingImpact` is therefore always empty in production.
- The tests hand-craft `Calls -> binding.id` edges (`analyze-files-impact.spec.ts:213`) that the indexer never emits.
- The sqlite relation validator allows binding targets (`sqlite-graph-database.ts:4761`) but nothing produces them.
- The spec scenario "Export impact separates route and target" (exact route includes only its proven route, canonical includes all three routes, "including downstream re-export chains") is not realizable. Nothing walks `resolution_steps` for re-export chains. The same test asserts `canonicalImpact` excludes `routeConsumer`, which contradicts "canonical impact includes all three routes".

**C-2 (MEDIUM, code)**
`collectCoveringSpecs` (`analyze-file-impact.ts:378-440`) still has the physical fallback `querySymbols = logicalDepths.size > 0 ? ... : physicalDeclIds` (`:403`).

- It also resolves depth via `symbolDepths.get(relation.target)` (`:~429`).
- `analyze-files-impact.ts:93` uses it whenever `filter === undefined`.
- This violates "physical ID MUST NOT be used as fallback logical ID" and "all-physical-only traversal MUST skip the reverse logical-coverage store operation". Multi-file impact without a filter calls `getCoveringSpecsForSymbols` with physical ids.
- The single-file path (`analyze-file-impact.ts:61`) always uses the logical collector, so single-file and multi-file behavior diverge.
- No test covers the all-physical-only case for file or multi-file impact. `traversal.spec.ts:1375,1508` only test `analyzeResolvedSymbolImpact`.

**C-3 (MEDIUM, code)**
`analyzeResolvedSymbolImpact` omits the files of reached symbols from covering-spec file evidence.

- `fileDepthsMap` (`analyze-impact.ts:341-376`) holds only root files (depth 0) plus the IMPORTS-BFS files.
- Files of reached call/hierarchy dependents are added to `affectedFiles` (`:327-333`) but not to the coverage frontier (`:523`).
- A spec with `COVERS_FILE` on a caller's file is missed by symbol impact. The physical path (`collectAffectedSpecs`, `:1023-1040`) and file impact (`analyze-file-impact.ts:~186`) do include them.
- Violates "specs covering admitted impacted symbols and files" (Filtered impact requirement).

**C-4 (MEDIUM, code)**
Fabricated covering-spec depth and evidence.

- `analyze-file-impact.ts:63-72` and `analyze-files-impact.ts:106-116` push `{ specId, minDepth: 1, evidence: [] }` for specs found only via per-symbol `affectedSpecs`.
- This is the normal outcome under a specs-only filter, because `symbolDepths` is only filled when `symbols` is materialized (`analyze-file-impact.ts:~178`).
- The result carries a made-up minimum depth of 1 and no evidence. A spec covering the input file's symbol at depth 0 or a symbol at depth 3 is mislabeled. This contradicts "every distinct evidence item" and "minimum impact depth".
- Test D-3 (`analyze-files-impact.spec.ts:438`) asserts only presence.

**C-5 (LOW-MEDIUM, code)**
`getUpstream`/`getDownstream` with `includeFiles` (default true) do per-file `getImporters`/`getImportees` plus per-importing-file `findSymbols` inside a frontier, sequentially (`get-upstream.ts:76-95`, `get-downstream.ts:76-96`; `detect-changes.ts` loops symbols sequentially).

- Not per-symbol, but not "one logical batch per frontier".
- Not bounded concurrency (sequential), so no overload.
- The `includeFiles` tests (`traversal.spec.ts:336,469`) do not assert batching.

**C-6 (MEDIUM, code)**
`createMemoizedReadStore` (`analyze-file-impact.ts:~520`) does not memoize `queryImpactFrontier`, `findLogicalDeclarationsByDeclarationIds` or `findLogicalSymbolsByIds`.

- The hot path of multi-file impact is therefore not a "shared memoized read view". Repeated frontiers across files and symbols hit the worker again.
- Scenario "repeated reads across files share one memoized read view" is only loosely covered. `sqlite-wide-traversal.spec.ts` checks completion under `maxPendingOperations: 32`.
- No assertion on memoization of the frontier.

**C-7 (LOW, spec/code)**
Many orderings use `String.localeCompare` (domain services: 19 sites; `sqlite-graph-database.ts`: 11, including `compareRelations` at `:4669`).

- SQL `ORDER BY` is binary while JS sorts by locale/ICU.
- "Deterministic across backends/environments" holds within one runtime but not across ICU or locale differences.
- Recommend a code-point comparator.

**C-8 (LOW, code)**
`analyzeFileImpactDetails` returns `affectedFiles: [...affectedFileSet]` unsorted (`analyze-file-impact.ts:~215`), while multi-file and the other paths sort. Deterministic only because inputs happen to be.

**C-9 (LOW, code)**
`analyzeFilteredTraversalTargets` hydrates roots with `Promise.all(roots.map((t) => store.getSymbol(t)))` (`analyze-impact.ts:~708`). The fan-out equals the declaration count and is unbounded.

- The resolved path uses `getSymbolsByIds` correctly.
- With 256+ declarations this could trip `StoreOverloadError`.
- Use `getSymbolsByIds`.

**C-10 (LOW, spec gap)**
`detectChanges` duplicates the risk thresholds instead of `computeRiskLevel`, and ignores file categories. Test callers inflate its dependents and risk, unlike `analyzeImpact`. The spec is silent.

**C-11 (LOW)**
`analyzeSpecImpact` unfiltered path (`analyze-spec-impact.ts:60-125`) does per-spec `getSpecDependents`/`getCoveredFiles`/`getCoveredSymbols` and a per-symbol `resolve()`. Outside the batching requirement's text, but not batched.

**C-12 (LOW)**
CRITICAL via "3+ execution flows" is unreachable: `processCount` is always 0 and `affectedProcesses` is always `[]`. The spec says "(when process data is available)", so it is acceptable but dead.

**C-13 (LOW-MEDIUM, unverified)**
"Hierarchy traversal SHALL preserve ... language precedence for contracts, overrides, inherited members, traits, mixins, embedding, promotion, and provable interface satisfaction" is not implemented or tested in the traversal services. They follow persisted EXTENDS/IMPLEMENTS/OVERRIDES edges only. There are no traversal-level tests for traits/mixins/embedding/promotion. This depends entirely on adapters and the indexer (other partials).

**C-14 (LOW)**
Physical-only declarations are classified in `semanticAffectedTargets` (`kind: 'physical-only'`). In the coverage collectors they are silently dropped (`collect-impact-specs.ts:78-95`), with no explicit "coverage-not-applicable" classification on `CoveringSpecImpact`. The scenario "Physical-only declarations are classified explicitly" is satisfied only at the semantic-target level. `project-spec-coverage` has its own classification.

### Test coverage (traversal)

Well covered:

- Upstream/downstream basics, cycles, maxDepth.
- Batched frontier call counts (`traversal.spec.ts:306,439`).
- Risk thresholds, category pruning, anchored test target.
- Logical aggregation, physical-only, depth-0 own coverage.
- Hotspot batch (`compute-hotspots.spec.ts:418`).
- Wide SQLite traversal (`sqlite-wide-traversal.spec.ts`).

Missing tests:

- Hotspot with `maxPendingOperations: 16` (spec scenario "Wide-graph hotspot ranking completes"). `sqlite-wide-traversal.spec.ts` exercises `computeHotspots`; confirm it uses 16.
- All-physical-only coverage skip for file and multi-file impact, and for the unfiltered `collectCoveringSpecs` (C-2).
- Resolved symbol impact where a caller's file is covered by `COVERS_FILE` (C-3).
- Specs-only file impact asserting the `coveringSpecs` depth and evidence (C-4).
- Real-indexer end-to-end public-binding impact (C-1).
- `includeFiles` batching (C-5).
- Memoization of `queryImpactFrontier` across files (C-6).
- Owner-qualified scenarios are not in this package's traversal tests (resolver partials).
- Impact over a diamond or cycle with multiple logical declarations, to check depth minimality of logical aggregation across routes.

---

## Spec 2: code-graph:graph-store

Requirement status:

| Requirement                                                                   | Status              | Evidence                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port, minimum semantics, lifecycle, recreate/clear distinction                | OK                  | `graph-store.ts`; `sqlite-worker-lifecycle.spec.ts:163`; `sqlite-graph-store.spec.ts:1594,1900`                                                                                                                                        |
| Complete logical clear                                                        | OK impl / test GAP  | `sqlite-graph-database.ts:3144-3170` clears all tables plus 4 FTS tables and 3 meta keys inside one transaction (`:441-444`). Contract `clear removes everything` (`graph-store.contract.ts:1857`) checks only file and symbol counts. |
| Storage generation                                                            | OK                  |                                                                                                                                                                                                                                        |
| Atomic upsert, addRelations, removeFile                                       | OK                  |                                                                                                                                                                                                                                        |
| Query methods                                                                 | OK                  |                                                                                                                                                                                                                                        |
| Filtered impact contract                                                      | OK                  | `sqlite-graph-database.ts:3184-3340`                                                                                                                                                                                                   |
| Batched traversal reads, exact batch retrieval                                | OK                  |                                                                                                                                                                                                                                        |
| Statistics                                                                    | OK                  |                                                                                                                                                                                                                                        |
| Spec upsert/removal, search                                                   | OK                  | not re-audited here (search partial)                                                                                                                                                                                                   |
| Bulk ops, reference persistence                                               | OK                  | local-binding ranges persisted: `:3538`; shadowed bindings round-trip in the contract suite                                                                                                                                            |
| Logical/declaration batch lookup                                              | PARTIAL             | declaration to logical mapping assumes 1:1 (C-15)                                                                                                                                                                                      |
| Member-semantics persistence                                                  | OK                  |                                                                                                                                                                                                                                        |
| Logical-symbol coverage endpoints / batched coverage lookup                   | PARTIAL             | frontier emits physical `COVERS_SYMBOL` targets (C-16); stale metadata contradiction (S-1)                                                                                                                                             |
| Source-content candidates, incompatible store, freshness, single-session bulk | OK / not re-audited |                                                                                                                                                                                                                                        |

### Discrepancies

**C-15 (LOW-MEDIUM)**
`findLogicalDeclarationsByDeclarationIds` (`sqlite-graph-database.ts:1347-1371`) keeps the first row per `symbol_id` with no `ORDER BY`, and the schema PK `(logical_symbol_id, symbol_id)` permits one physical declaration to map to several logicals (declaration merging, overload-like cases). `analyze-impact.ts:395` and `collect-impact-specs.ts` also keep one mapping (`Map.set` overwrite). The result is nondeterministic or lossy. The real DB currently has 0 such cases. A unique index, or all rows ordered deterministically, would close it.

**C-16 (MEDIUM, spec/code)**
`queryImpactFrontier` for `resource: 'symbol'`, downstream, `COVERS_SYMBOL` rewrites `relation.target` from the logical id to `ld.symbol_id` (physical) (`sqlite-graph-database.ts:3207-3212,3270`). The in-memory store mirrors it (`in-memory-graph-store.ts:629-647`).

- The returned `Relation` therefore claims a `COVERS_SYMBOL` to a physical id. This contradicts "Coverage queries SHALL preserve the logical target ID ... a declaration-occurrence `SymbolNode.id` MUST NOT be the canonical target".
- It is defensible as a traversal-hydration shortcut, but it is not documented in the port, and `analyze-spec-impact.ts:~230` relies on it. The fallback there (`getSymbolsByIds(relations.map(target))`) treats relation targets as physical ids.

**C-17 (LOW)**
`recreate()` host (`sqlite-graph-store.ts:757-760`) calls `invalidateBulkSession()` before the open check. A rejected `recreate()` on an open store therefore kills an active bulk session while the store stays open. The spec says rejection is a pure precondition error. Not tested.

**C-18 (LOW)**
Host `findLogicalSymbols` (`sqlite-graph-store.ts:855-859`) and `findLocalBindings` (`:957-961`) have no empty-input short-circuit (other batch lookups do). The spec's "no backend work for empty input" is explicit for declaration mapping only, so this is minor. The DB layer does guard `findLocalBindings`.

**C-19 (LOW)**
`GraphStore` is an abstract class but ~20 reference-fact methods are non-abstract defaults that `reject('not supported')` (`graph-store.ts:302-493`), so an incomplete backend compiles. Spec silent.

**C-20 (LOW)**
Spec requires "relation endpoint validation and hierarchy/method lookup SHALL have batch operations" on the Store (Single-session bulk indexing). The port exposes no such operations. The SQLite adapter does it internally (`loadExistingIds`), so the observable guarantee holds, but a non-SQLite backend has no hook.

### Spec-vs-spec issues (graph-store)

- **S-1 (MEDIUM)**
  - Minimum graph semantics: `COVERS_SYMBOL` "MAY carry `metadata.stale` when the archived link no longer resolves to a live indexed symbol".
  - Logical-symbol coverage endpoints: relations whose logical target is missing "MUST be rejected" (sqlite spec: dropped and diagnosed).
  - A stale link cannot persist under the second rule. Code emits `stale: false` only (`index-code-graph.ts:1433,1627`) and never `true`. The stale feature is dead. One of the two statements should be removed.
- **S-2 (LOW)**
  - "Reference and coverage persistence" says lookups by "member form".
  - "Member-semantics persistence" says "MUST NOT keep a `memberForm` field".
  - Terminology conflict: use "member semantics".
- **S-3 (LOW-MEDIUM)**
  - Search scenario "Persisted file content does not introduce file search surface ... no separate file full-text search category".
  - "Source-content search candidates" requires `searchSourceContentCandidates` over `FileNode.content`, and `file_content_fts` exists.
  - The older scenario is stale.
  - `sqlite-graph-store` Default backend role also lists "file ... discovery" among required search. The three statements need reconciling.

### Test coverage (graph-store)

Present: contract suite run against SQLite and the in-memory store (batches, ordering, filtered frontier, coverage, categories, reference facts, observations); wide-traversal.

Missing or weak:

- Complete logical clear: no test populating observations, reference facts, latches, coverage and FTS then asserting empty (including `index_coverage` cannot cause skip). The contract test checks two counters.
- Clear rollback on injected failure (`sqlite-graph-database.ts` transaction): none.
- "Clear contract is backend-neutral" shared suite: only stats.
- "Missing and occurrence-only targets fail endpoint validation" and "Physical symbol rejected as coverage target": verify they exist in `graph-store.contract.ts:1207`; the in-memory store may differ from SQLite validation.
- Display-path derivation never calls exact batch retrieval: no test in code-graph (CLI-level).
- Bulk: one begin / one commit / one semantic and one content-FTS rebuild is not asserted by counting.

---

## Spec 3: code-graph:sqlite-graph-store

Requirement status:

| Requirement                                                 | Status                          | Evidence                                                                                                               |
| ----------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| SQLite-backed implementation, worker non-blocking execution | OK                              | lifecycle/backpressure/responsiveness specs                                                                            |
| Worker-efficient batch reads                                | OK                              | chunking `getSqliteInputChunkSize`, `chunksOf`; tests `sqlite-graph-store.spec.ts:412-1147`                            |
| Query-time filtered impact reads                            | PARTIAL                         | SQL predicates OK; host does not normalize (C-21); no SQL or dispatcher assertion (T-1)                                |
| Exact batch node lookups, logical declaration mapping       | OK                              | `:702-780`, `:1311-1371`; chunk size is 900 constant, not accounting for fixed parameters, but these queries have none |
| Config-derived layout, default backend, sidecar             | OK                              |                                                                                                                        |
| Destructive recreation, locked recreation                   | PARTIAL                         | S-4                                                                                                                    |
| Logical clear parity                                        | OK impl / weak tests            |                                                                                                                        |
| Schema ownership, node storage, relation storage            | OK                              | `schema.ts`                                                                                                            |
| Logical coverage integrity (`relationEndpointsExist`)       | OK                              | `sqlite-graph-database.ts:4755-4770` requires `ids.logicalSymbols`                                                     |
| Batched logical coverage reads                              | OK                              | joins `logical_symbols` (`:883-908`)                                                                                   |
| FTS                                                         | not re-audited (search partial) |                                                                                                                        |
| Transactional mutation, bulk indexing                       | OK                              |                                                                                                                        |
| Schema versioning, reference schema upgrade (v15)           | PARTIAL                         | see schema-15 question and C-22                                                                                        |

### Discrepancies

**C-21 (LOW)**
Spec: the filter is normalized before the worker request ("duplicate filter values SHALL be normalized before the worker request"; "SQLiteGraphStore SHALL send the normalized filter unchanged").

- Host `queryImpactFrontier` (`sqlite-graph-store.ts:409-414`) sends the raw `{ input }`. Normalization (dedupe, sort) happens in the worker-side database (`sqlite-graph-database.ts:631-632,3227,3262`), and `relationTypes: []` still costs an RPC.
- Results are correct; the layering differs from the spec text.

**C-22 (LOW)**
Same-version structural drift is not detected (schema-15 section above). Also `assertExistingSchemaCompatible` treats an existing `meta` table without a `schemaVersion` row as compatible and stamps it (`:2697-2702`).

**S-4 (MEDIUM, spec/code)**
sqlite `Destructive recreation` says recreate "remove[s] the graph persistence directory including SQLite companion files".

- The code removes only `code-graph.sqlite`, `-wal`, `-shm` (`sqlite-graph-store.ts:762-768`, `sqlite-graph-database.ts:423-428`).
- Directory removal would delete `graph/index.lock` (`index-lock.ts:48-50`) and `storage.epoch`, which contradicts "recreate MUST NOT delete a live `index.lock`".
- The code is the consistent reading. Fix the spec text. The `index.lock` survival test exists (spec scenario) in `index-lock.spec.ts`/store spec.

**S-5 (LOW)**
`Schema versioning` still lists the open order "executes the current schema definition, then verifies version". The code (correctly, per `Reference schema upgrade`) verifies the version before executing DDL (`:366-369`). Text is stale.

**C-23 (LOW)**
Local-binding insert has no dedupe/`OR IGNORE`: `INSERT INTO local_bindings ... PK(id)` (`:3538`). The in-memory session dedupes by id (`in-memory-index-session.ts:144,189`) and `reference facts` chunk merge in the worker concatenates (`sqlite-worker.ts:144`). A direct `replaceReferenceFacts` or `writeReferenceFacts` with duplicate ids throws a UNIQUE constraint error. `symbol-index.spec.ts:339` exercises duplicates only against the in-memory path. The spec allows rejecting duplicates; flagging as an untested edge.

### Test coverage (sqlite-graph-store)

Present: schema 15 DDL (`:1631`), reject versions 10-14 and 16 (`:1670`), reopen v15 (`:1706`), v14 to v15 recreate with new epoch (`:1810`), `occurrence_form` round-trip (`:810`), local-binding range round-trip through the contract suite (`graph-store.contract.ts:846-1043`), qualified-name equality (`:797,1770`), chunking families, locked WAL retry (`:1562,1578`), rollback of upsert/bulk.

Missing:

- **T-1.** Filtered-impact scenarios "SQLite filters before crossing the adapter boundary" (no SQL statement inspection) and "Worker transports the normalized request losslessly" (no dispatcher or protocol test for `queryImpactFrontier`; `sqlite-worker-protocol.spec.ts` has none).
- **T-2.** Logical clear completeness and rollback, as above.
- **T-3.** FTS and source-content index rebuilt exactly once per bulk commit.
- **T-4.** Pre-amendment same-version DB (C-22): no test either way.
- **T-5.** `recreate()` on an open store with an active bulk session (C-17).
- **T-6.** `symbol_fts` carries no extra column (`Qualified spelling is an equality column` scenario): only the `qualified_name` equality index is asserted (`:1798`).
- **T-7.** "Search text is not identity" negative lookup scenario.
- **T-8.** "Partial member axes do not match a different member" and "Non-member leaves member axes empty": confirm in the contract/sqlite specs; not individually located.

---

## Cross-spec / global consistency summary

- traversal vs graph-store: consistent on batch signatures and on `getCoveringSpecsForSymbol(s)` taking logical ids (port renamed to `logicalSymbolId`/`logicalSymbolIds`, matching the spec).
- Contradictions to fix in specs: S-1 (stale vs reject), S-2, S-3, S-4, S-5. Code-vs-spec: C-1, C-2, C-3, C-4, C-16.
- Global specs not re-read in this batch beyond architecture (domain services pure, no `@specd/core` import): OK. Traversal functions live in `domain/services/`, never mutate the store (`traversal.spec.ts:1164`).

## Counts by severity

- HIGH: 1 (C-1)
- MEDIUM: 6 (C-2, C-3, C-4, C-6, C-16, S-1) plus S-4 (spec text), so 7 listed
- LOW-MEDIUM: 3 (C-5, C-13, S-3)
- LOW: 14 (C-7, C-8, C-9, C-10, C-11, C-12, C-14, C-15, C-17, C-18, C-19, C-20, C-21, C-22, C-23, S-2, S-5)
- Test gaps: T-1 to T-8 plus the ones listed under each spec (the most important are clear completeness and rollback, and the all-physical-only multi-file case)

## Top 5

1. C-1: exact public-binding impact is structurally empty on real indexes (0 of 5922 bindings have inbound relations). The tests use synthetic binding-targeted edges.
2. C-2: legacy `collectCoveringSpecs` still falls back to physical ids as logical coverage ids on the unfiltered multi-file path.
3. C-3 and C-4: resolved symbol impact ignores covering specs of reached files; file impact fabricates `minDepth: 1` and empty evidence under a specs-only filter.
4. C-16 and S-1: frontier reads rewrite `COVERS_SYMBOL` targets to physical ids, and the spec's "stale" coverage is contradicted by logical-endpoint rejection (stale is never emitted).
5. Schema-15 drift: no spec requires recreate and the code raises an untyped `SqliteError`. Add a structural guard or a doc note. Separately, the complete-clear completeness and rollback tests are missing.

---

# Partial D (round 3): code-graph:indexer, code-graph:composition, sdk:run-graph-impact, cli:graph-impact

Change: cross-language-symbol-semantics. Read-only audit. Evidence from merged spec previews (spec.md + verify.md), source and tests. Line numbers are from the working tree as of this audit.

Severity counts (all four specs): HIGH 3, MEDIUM 9, LOW 8.

## Top findings (ranked)

1. HIGH - cli:graph-impact is self-contradictory on multiple bare-name matches. The verify scenario "Multiple symbol matches" says stdout shows `3 symbols match "validate":` followed by separate impact reports, and Output format says "When multiple symbols match, each analysis is listed sequentially". The Symbol impact requirement (item 6), the Logical presentation requirement, and the scenarios "Exact ambiguity is bounded and not traversed" and "Ambiguous owner-qualified selector lists every match" all forbid traversal. Code and tests implement the no-traversal behaviour (impact.ts:822-850 prints `N symbols exactly match "<sel>"; qualify the selector:`; graph-impact.spec.ts:941-1008 and 1100-1138 assert `analyzeImpact` is not called). The spec text is stale and the literal string differs (`exactly match`).
2. HIGH (static analysis, not run) - A subset run (`--workspace core`) looks like a fingerprint mismatch every time, so subset runs never skip. `computeRootFingerprint` (compute-graph-fingerprint.ts:169-198) hashes the full `workspaces` list. `IndexCodeGraph` computes it from `options.workspaces` (index-code-graph.ts around 590-640), and the SDK passes a filtered list for subset runs. `detectFingerprintMismatch` always compares the `root` key (compute-graph-fingerprint.ts:~410), so a subset run reports `fingerprintMismatch = true` while no workspace fingerprint differs. Consequences:
   - `fullRebuild = true`, the reason is set, and every discovered file is pushed to `newFiles` (index-code-graph.ts:~669-690). A subset run is never incremental.
   - The subset's root fingerprint overwrites the stored `root` entry (the merge only keeps stored entries missing from the current map).
   - The next whole-graph run then sees a root mismatch with `runReplacesWholeGraph` true. With `derivationMismatch: 'fail'` (SDK first attempt) it throws `GraphDerivationMismatchError`, and the SDK physically recreates the whole store. Running `index --workspace core` followed by `index` could therefore destroy and rebuild the graph.
   - In a root-only mismatch, files deleted from disk are not in `deletedFiles` (that list is only built in the non-mismatch branch) and are not in `fingerprintInvalidatedPaths` (only workspaces with a differing fingerprint are added), so their stale rows survive.
   - Nothing in the tests covers this: no test runs a subset non-force pass, or a subset pass followed by a full pass, against a real store. Verify with a probe test before fixing.
3. HIGH - sdk:run-graph-impact forbids "a compatibility branch that selects `declarations[0]`", but legacy physical branches still exist. Details:
   - `ResolvedGraphDeclarationSelector.target` is optional (resolve-graph-selector.ts:57-63). `resolvedResult()` (lines ~480-505) returns `{status:'resolved', match}` with no typed target.
   - `unifyOverloadSetCandidates` (resolve-graph-selector.ts ~400-440) collapses several physical matches to `first`, using `parentId` plus a regex over the physical symbol id (`extractSymbolNameFromId`). That is the "parse a physical ID" and "pick one declaration" pattern the spec forbids.
   - `promoteToLogicalTarget` falls back to that legacy outcome on any store error (`catch { return base }`, ~line 330). The error is swallowed silently.
   - The SDK then synthesizes a `declaration` target from `provider.getSymbol(...)` with a hard-coded `DeclarationOccurrenceForm.Definition` (run-graph-impact.ts:716-748) and traverses one physical seed.
   - For an exact physical id this is legitimate physical semantics. For a name or qualified selector whose declarations did not map to one logical symbol (for example an adapter that emits no logical mapping), it silently produces single-declaration impact labelled "declaration impact".
   - No test covers the mixed, unmapped or store-error fallbacks, so the legacy path is untested.
4. MEDIUM - composition "Package exports": the spec says the `"."` barrel SHALL export only the enumerated list, and the scenario "Barrel exports exactly the enumerated list" requires it. public.ts also exports `FreshnessMode`, `FreshnessState`, `IndexedInputKind`, `IndexedResourceKind`, `FILE_CATEGORIES`, `classifyFileCategory`, `IMPACT_RESULT_TYPES`, `IndexCoverageStatus`, `normalizeFileSelectorPath` and several type groups (`ExactPublicBindingResult`, `IndexPhaseMetric(s)`, `SourceRange`, `FileCategory`, `IndexedInputObservation` and others). barrel.spec.ts:205-300 keeps an `allowed` set that includes these extras, with a comment "Keep in sync with Package exports", so test and spec disagree. Spec and code are both at fault: the spec list is stale and the test cannot catch real leaks beyond its own allow-list.
5. MEDIUM - sdk export impact reports `status:'not_found'` for every non-resolved resolution (run-graph-impact.ts:956-966), although `UnresolvedPublicExportImpactResult.status` is typed `'not_found'|'ambiguous'|'unresolved'`. A resolver `ambiguous` or `unresolved` status is relabelled `not_found`. The CLI then goes to its "other" branch and prints `resolution.status`, so the CLI text and the SDK status disagree. Only the `AMBIGUOUS_PUBLIC_BINDING` path (selected === null) sets `ambiguous`.

## code-graph:indexer

### Requirements summary and status

- IndexCodeGraph use case: OK (index-code-graph.ts). SpecRepository and GetSpecMetadata are consumed. Untested at unit level: "VCS ref not updated when absent" (not verified).
- Incremental indexing: OK/PARTIAL.
  - Fingerprint reason constant: compute-graph-fingerprint.ts:14.
  - Mismatch branch: index-code-graph.ts:~660-700.
  - The newline-only manifest scenario is tested (workspace-indexing.spec.ts:84).
  - PARTIAL because of finding 2 (root fingerprint depends on the workspace subset) and the deleted-file gap in the mismatch branch.
  - Forced run: `fingerprintInvalidatedPaths` is only filled for subset runs. For a whole-graph force the bulk session uses `replaceCodeGraph`, so nothing leaks (OK).
- Deterministic implementation coverage projection: OK (project-spec-coverage.ts, changed). Diagnostic coverage is tested (project-spec-coverage.spec.ts). Not re-audited in depth in this batch.
- Discovery fingerprint, adapter-sourced fingerprint, portable paths, binary filter, bounded memory, two-pass, shared session, scoped binding, chunking, progress, timing, package resolution, error isolation, index result, spec dependency indexing, optimized description, reference fact indexing, classification-aware identity, observation capture, bounded incremental construction, incremental equivalence: not re-verified line by line in this round beyond the points below. The existing suites are present (compute-graph-fingerprint.spec.ts, symbol-index.spec.ts, workspace-indexing.spec.ts, index-project-graph-integration.spec.ts, language-adapter-conformance.spec.ts).
- Incompatible derivation rebuild: PARTIAL.
  - `GraphDerivationMismatchError` (new file) is thrown before any write only when `derivationMismatch==='fail' && fingerprintMismatch && !force && runReplacesWholeGraph` (index-code-graph.ts:~653-668). OK.
  - SDK retry: run-index-project-graph.ts:101-160. It first runs the index with `'fail'`, catches the error, and then runs `withOpenGraphProvider` with `beforeOpen: provider.recreate()`. `recreate()` is only allowed while closed (code-graph-provider.ts:280). `rotateStorageGeneration` is called in sqlite-graph-database.ts:419-436. OK.
  - Subset: `replacesWholeGraph` (domain/services/replaces-whole-graph.ts). The provider (code-graph-provider.ts:319-330) and the indexer each recompute it. The provider adds `root` only when `includePaths.length>0`, and the indexer adds `root` in the same condition (index-code-graph.ts:~536, 560). They are consistent today but are two independent copies.
  - Caller-owned provider: the default `'rebuild'` does an in-place logical rebuild via `replaceCodeGraph: fullRebuild && runReplacesWholeGraph` (index-code-graph.ts:~1702). OK.
  - Removed workspace: if a workspace is dropped from config, its rows are never considered (deletion is limited to indexed workspaces by spec), `runReplacesWholeGraph` becomes false because that workspace still owns files, and recreation is therefore never taken. Orphan rows persist until a forced whole-graph run. This is a spec-level gap (Medium, unverified at runtime).
- Index result: OK. `fullRebuild` and `fullRebuildReason` are returned (index-code-graph.ts:~1806). DRIFT: with `force`, `fullRebuildReason` is the literal `'Forced logical graph reindex requested by indexing'` (index-code-graph.ts:~643), which the spec does not define. The spec describes only the fingerprint-mismatch reason. If force and mismatch coincide, the mismatch reason is lost.

### Discrepancies

- [HIGH] Finding 2 above (root fingerprint covers the workspace subset).
- [MEDIUM] In the mismatch branch, `deletedFiles` is never computed for workspaces whose own fingerprint did not change (index-code-graph.ts:~666-700 versus 764-778). In a root-only mismatch this leaves stale rows for files deleted from disk.
- [MEDIUM] Spec tension: "Incremental indexing" says the preferred behavior is to "recreate the store" on mismatch and a backend that cannot recreate "MAY fail fast". "Incompatible derivation rebuild" mandates provider-owned recreation and in-place logical rebuild for a caller-supplied provider. The implementation follows the second text. The first paragraph should be reconciled, since it still reads as if the indexer itself recreates the store.
- [MEDIUM] The `derivationMismatch` option on `IndexOptions` (index-options.ts:140-150) is not mentioned in the indexer spec. It is the mechanism that implements the retry, so the contract is code-only.
- [LOW] The scenario "Deleted file removal remains scoped" has fingerprint-matching preconditions that a real subset run does not satisfy (finding 2).
- [LOW] Duplicated `runReplacesWholeGraph` logic in provider and indexer (provider re-reads `getAllFiles` and `getAllDocuments` for every forced run, which is O(graph) memory).

### Tests present

- Subset force preserves the other workspace's file and symbols: workspace-indexing.spec.ts:350-391.
- `derivationMismatch:'fail'` throws and leaves files unchanged; the default rebuilds in place: workspace-indexing.spec.ts:393-429.
- Manifest newline and text changes: workspace-indexing.spec.ts:84-145.
- Incremental closure and newly-added target: workspace-indexing.spec.ts:214-295.

### Missing tests

- Non-forced fingerprint-mismatch run on a strict subset that preserves the other workspaces' files, symbols, relations, specs, coverage records and fingerprints.
- A subset run followed by a full run with a real store: no destructive mismatch, no re-extraction. This would expose finding 2.
- A root-only mismatch with a file deleted from disk (stale row left behind).
- The in-place rebuild test (workspace-indexing.spec.ts:393) asserts only the reason string. It never asserts that stale rows were cleared, that the bulk session used `replaceCodeGraph`, or that the generation behaved correctly.
- `GraphDerivationMismatchError` with `force:true` (must NOT throw) and with a subset (must NOT throw). Neither is tested.
- The generation rotates when a real SQLite store is recreated on the SDK retry path. The SDK test mocks everything.
- Store-error path in `promoteToLogicalTarget` (the silent catch).

## code-graph:composition

### Status per requirement

- CodeGraphProvider facade: OK. `index` force clears logically (code-graph-provider.ts:~311-323), and the test at code-graph-provider.spec.ts:292-326 asserts `clear` is called once and `recreate` is not. `recreate()` rejects while open with `GraphStoreRecreateRequiresClosedError` (spec test :462) and takes the index lock (:469-473).
- PARTIAL: provider-level force over a strict subset (`runReplacesWholeGraph` false, so no `store.clear`) has no provider-level test. The only subset test is the use-case test.
- Filtered-impact provider surface: delegates with a single `assertAvailable` (`analyzeResolvedSymbolImpact` at :811-819). Not re-audited in depth.
- Factory function, Public and internal entry points, Lifecycle, Dependency on core, Host use cases: no discrepancy found in this round.
- Package exports: PARTIAL (finding 4).
- Symbol-reference provider surface, Resolution-aware impact provider surface, Adapter-backed reference normalization, unified search surface: delegation confirmed. `analyzeResolvedSymbolImpact` passes the whole `ResolvedSymbolTarget` to the domain service. Legacy `analyzeImpact(symbolId)` remains on the facade (physical only) as the spec allows for compatibility.

### Discrepancies

- [MEDIUM] Barrel exports versus the spec's "only" list (finding 4). The spec scenario "Barrel exports exactly the enumerated list" is not what the test implements. Fix either the spec list or add the extras to the enumerated list and make barrel.spec.ts assert set equality on runtime names.
- [MEDIUM] Spec says `index({force:true})` "ensures the indexer reprocesses every selected input", while `IndexResult.fullRebuildReason` becomes a force-specific string (see indexer drift).
- [LOW] The `getSpec(specId)` facade returns undefined for absent data (composition spec). The cli:graph-impact spec says "the provider SHALL throw `SpecNotFoundError`". In practice the SDK throws it (run-graph-impact.ts:897-901). The cli wording is wrong about who throws.
- [LOW] public.ts exports `GraphDerivationMismatchError` and the SDK depends on it. The composition spec lists the error subclasses by example ("including"), so this is allowed, but the error's `reason` property and code `GRAPH_DERIVATION_MISMATCH` are not documented in any spec.

### Tests present

- barrel.spec.ts: allowed runtime set, internal helpers absent.
- code-graph-provider.spec.ts: force/clear, recreate closed-only, recreate lock, open propagates recoverable error.

### Missing tests

- Strict equality between the runtime export list and the spec list.
- Provider force with a strict subset must not call `store.clear`.
- `recreate()` leaves the provider closed and rotates the generation (check the generation cache is null after recreate).

## sdk:run-graph-impact

### Status per requirement

- runGraphImpact orchestration: OK. Files, symbol, spec and export branches exist (run-graph-impact.ts:591-1068). The default `maxDepth` is 3 (:577), the transient provider uses `withOpenGraphProvider` (:1075-1079), and the filter is forwarded.
- Resolution-preserving symbol impact orchestration: PARTIAL.
  - The typed `analyzeResolvedSymbolImpact` is used (:750-758). Ambiguous and missing outcomes return before traversal (:677-711). Nested locations are projected for declarations, resolvedTarget, semantic targets, physical evidence and covering specs (:430-540, 805-865).
  - The legacy-physical fallback (:716-748) conflicts with the "no compatibility branch" requirement (finding 3).
  - The count-unit documentation requirement ("Aggregate count and risk fields MUST document whether they count unique logical targets or physical occurrences") is not met. `ResolvedSymbolImpactResult.directDepsCount/indirectDepsCount/transitiveDepsCount/affectedFilesCount` (:257-294) have no unit doc comment. Only `semanticCounts` is explicit.
  - The `impact.target` derivation is OK for logical targets (:847-850).
  - The deprecated `symbol` summary is derived after traversal in the typed branch, but in the fallback branch `sym` is loaded before traversal (:719-726). Display-only, but it contradicts "derived only after".
- Elimination of displayPath: OK. No such fields exist in the types.
- Pure path projection: OK for file, symbol and export paths. PARTIAL for symbol-ambiguity candidates (:699), which use the stored `sym.projectRelativePath` (a graph read result, not config projection).
- No presenter formatting: OK.

### Discrepancies

- [HIGH] Finding 3 (legacy physical fallback and `unifyOverloadSetCandidates`).
- [MEDIUM] Finding 5: every non-resolved export resolution is reported as `not_found` (:956-966).
- [MEDIUM] Export surface normalization is skipped when `from` contains ':' (:934). Windows absolute paths (`C:\...`) and any config-relative path containing ':' bypass `resolveFileSelector`. The workspace then falls back to `'default'` through `splitWorkspaceIdentity(...)?.workspace ?? 'default'` (:947). `from` is documented to accept absolute paths.
- [MEDIUM] Count-unit documentation missing (above).
- [LOW] The spec numbering is broken: step "6)" appears twice and the symbol step is appended after step 10 (spec.md lines 22-35).
- [LOW] `depth` is not validated in the SDK (the spec says "positive integer"). It is validated only in the CLI (impact.ts:413).
- [LOW] The multi-file `perFile` mapping relies on `result.symbols[i]` order matching `resolved[i]` (:638-653). Duplicate selectors resolving to the same file are not deduplicated.
- [LOW] The not-found symbol outcome (`{kind,status,symbol}`) drops the resolution outcome entirely. The scenario "the resolution outcome remains available to the caller" is satisfied only for ambiguous results.
- [LOW] Affected symbols overwrite `filePath` with the project-relative path (:603-607, 856-860, 911-915, 1029-1033). The canonical path is lost on those entries, although the spec says only that `projectRelativePath` is exposed. `canonicalPath` is exposed on the single-file target only.

### Tests present (sdk/test/orchestration/run-graph-impact.spec.ts)

Single and multi-file, symbol (typed and legacy shape), transient and caller-owned provider, spec, export (resolved and ambiguous), forwarding of direction, depth and filter, not-found, ambiguous, SpecNotFound, selector errors.

### Missing tests

- Fallback branch (`resolved.target` undefined) behaviour, and the fact that `analyzeResolvedSymbolImpact` is the only impact call used with a typed declaration target. The test at :203 uses a mock status `'exact'`, which is not a real resolver status, so it passes by accident through the fallback.
- Export `unresolved` and `ambiguous` resolver statuses producing a status that matches the resolver.
- Windows-absolute or colon-containing `from`.
- Projection of declarations in resolution candidates for the not-found export result.
- A provider that implements only the legacy method must be rejected or unsupported (the spec says implementations "SHALL implement the typed operation"). No runtime check exists.

## cli:graph-impact

### Status per requirement

- Command signature: OK (impact.ts:321-500). The mutually-exclusive checks, the half-selector usage error before provider open (:417-419), the direction alias normalization (:298-315) and the depth validation are all present. The synopsis in the spec omits `--type/--kind/--workspace/--exclude-workspace` (added by a later requirement).
- Provider-owned impact result filters: OK (`normalizeImpactResultFilter`, :78-160). The type list is `files|symbols|specs`, and `--kind` requires `symbols` in `--type`. The CLI does not remove entries from results. Tests: graph-impact.spec.ts:1770-2250.
- File impact analysis, Spec impact, Concurrent indexing guard, Pure display-path projection, Availability validated once, Error cases: OK by delegation. Covering-spec rendering is in formatCoveringSpecs (impact.ts:183-201, used at :677, 750, 921).
- Symbol impact analysis: OK, with the contradictory verify scenario (finding 1).
- Logical and declaration presentation: PARTIAL.
  - Text output shows the target kind, semantic counts, declarations, semantic affected targets, physical evidence and covering specs (impact.ts:852-928).
  - JSON/TOON output hand-picks fields (impact.ts:929-955). `kind` and `status` are dropped, and nothing guarantees future SDK fields reach structured output. The requirement says JSON and TOON "SHALL expose the SDK result without removing its target discriminant ...". The `targetKind` discriminant is present.
  - Ambiguous candidates are physical declarations, not semantic targets. `resolveSymbolSelector` flattens every declaration of every logical candidate into `candidates` and counts declarations in `totalCandidates` (resolve-graph-selector.ts:236-249). A logical overload set that conflicts with another symbol is therefore listed as several lines and counted as several matches, contradicting "Several declarations that belong to one logical target are one target, not several matches" and "deterministic semantic candidates".
- Public export impact analysis: OK. It uses the exact public-binding lookup via the SDK. The text view does not render `projectRelativeSurface` (it prints the raw `surface`).
- File-impact covering-spec presentation: OK.

### Discrepancies

- [HIGH] Finding 1 (contradictory verify scenario and Output-format line).
- [MEDIUM] Ambiguity candidates are per declaration rather than per logical target (above).
- [MEDIUM] The JSON/TOON symbol branch cherry-picks fields and drops `kind/status`. The spec requires pass-through of the SDK result. In the same area, the CLI help-text JSON schema (impact.ts:369-387) is stale: it lists `--symbol (single match)` without `targetKind/resolvedTarget/declarations/semanticCounts/semanticAffectedTargets/physicalEvidence`, and has nothing for `--export`.
- [MEDIUM] The count units are not named in the text. "Direct deps / Indirect deps / Transitive deps" render the legacy `impact.*Dependents`. Only the "Semantic counts" block labels logical versus physical. The structured `directDepsCount` etc. have no unit.
- [LOW] The spec numbering is broken: Symbol impact steps run 1-5, then "5", then "6".
- [LOW] Step 4 of "Spec impact analysis" says the CLI calls `analyzeSpecImpact(specId, direction)`. In fact the CLI delegates to `runGraphImpact`, with depth and filter.
- [LOW] Item 3 of "Spec impact analysis" says the provider throws `SpecNotFoundError`. The SDK throws it (`GraphSpecNotFoundError`).
- [LOW] `--all` silently overrides `--category`; the combination is not specified.

### Tests present (cli/test/commands/graph-impact.spec.ts)

Direction, depth, context, selector validation, spec output and SPEC_NOT_FOUND, symbol output (single, ambiguous, not-found, owner-qualified, ambiguous owner-qualified), multi-file aggregation, JSON/TOON output, public export (incomplete selector, exact binding, ambiguous candidates), covering specs, filters and categories, omission notice, logical impact text (:2373) and JSON/TOON (:2511).

### Test-quality issues

- The shared provider mock (graph-impact.spec.ts:67-190) re-implements `analyzeResolvedSymbolImpact` as a shim that calls `analyzeImpact(declarations[0].symbolId)`. Assertions such as :436-481 (`expect(analyzeImpact).toHaveBeenCalledWith(sym.id,'upstream',7)`) therefore check the very collapse the spec forbids, and only pass because the mock does it. The CLI tests do not prove a logical target is analysed once with all declarations, except in the dedicated cases that replace the mock (:2373 onward).
- The "Multiple symbol matches" verify scenario has no matching test (the tests assert the opposite, see finding 1).

### Missing tests

- Exit code 3 for `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` on impact (not found by name in this file; not verified).
- Single availability check per run (`assertAvailable` count) is not asserted in the CLI tests.
- `--type documents` rejection.
- A wide multi-file impact against a real SQLite store with `maxPendingOperations: 32` (the scenario describes a real store; only mock-level tests exist).
- Ambiguity candidate count per logical target.

## Cross-spec contradictions (merged specs and global specs)

1. cli:graph-impact "Multiple symbol matches" and "each analysis is listed sequentially" versus the same spec's ambiguity rules and sdk:run-graph-impact ("Ambiguous or unresolved selector does not traverse"). Real contradiction; code follows the ambiguity rules.
2. code-graph:indexer "Incremental indexing" (store recreation preferred, caller may fail fast) versus "Incompatible derivation rebuild" (provider-owned recreation, in-place logical rebuild for a caller-owned provider). Reconcile the wording.
3. code-graph:composition "Package exports" ("only" list and "exactly the enumerated list") versus code-graph:composition "Symbol-reference provider surface" ("SHALL export resolver input/result/status/reason/provenance types and factories, logical-symbol/public-binding/member/coverage vocabulary, and the enriched health/index result types") and other requirements that name search, selector and filter types. The "only" list is not closed in practice, so the exact-list scenario cannot be satisfied.
4. cli:graph-impact says the provider throws `SpecNotFoundError`; composition says `getSpec` returns undefined; sdk says the SDK throws it. The behaviour is consistent (SDK throws) but the three texts differ.
5. composition "Recovery ... Force MUST NOT invoke physical storage recreation" and indexer "Incompatible derivation rebuild" ("visible destructive full rebuild through provider-owned recreation"): consistent only because force never recreates and mismatch is the sole trigger. The SDK first-attempt `'fail'` plus retry protocol is not described in any spec (it lives in code and docs/sdk only).

## Docs check (docs/cli/graph.md, docs/sdk/index.md, docs/code-graph/index.md)

- [MEDIUM] docs/sdk/index.md:~212-228: the `runGraphImpact` example uses `{ target: { type: 'file', filePaths: [...] } }` and reads `impactResult.impactedFiles[0]`. Neither exists. The real input is `files: [...]` and the real result field is `affectedFiles`.
- [MEDIUM] docs/sdk/index.md:250-255 documents only the open-failure repair for `force: true`. It does not describe the `GraphDerivationMismatchError` first-attempt-fail, recreate and retry flow, nor `derivationMismatch`, nor that a caller-supplied provider gets an in-place logical rebuild, nor the subset semantics. It says "recreates closed derived storage ... exactly once", which matches open failure but not the second retry path.
- [LOW] docs/code-graph/index.md:278-290 documents recovery and `fullRebuild`/`fullRebuildReason` but not the subset (strict workspace subset) rule or the `derivationMismatch` option.
- [LOW] docs/cli/graph.md matches the symbol behaviours (logical, declaration and public-binding impact; ambiguity). `--force` is described as "a full rebuild" without saying that it is a logical clear and that, for `--workspace` subsets, other workspaces are preserved.
- docs/sdk/index.md:142-175 (resolution-preserving impact) is consistent with the code, except for the fallback branch noted in finding 3.

## Suggested next actions (outside this read-only audit)

1. Confirm finding 2 with a probe test (subset non-force run, then full run on a real SQLite store). If confirmed, make the root fingerprint independent of the indexed subset (or only compare the `root` key on a whole-graph run) and compute `deletedFiles` for non-invalidated workspaces in the mismatch branch.
2. Rewrite the cli:graph-impact "Multiple symbol matches" scenario and the "each analysis is listed sequentially" sentence to the ambiguity behaviour, with the actual string.
3. Remove or fence the legacy physical-selector fallback (optional `target`, `unifyOverloadSetCandidates`, the silent catch) and make the SDK reject results without a typed `target`.
4. Decide on the export list (extend the spec list or trim public.ts) and make barrel.spec.ts assert exact set equality with the spec.
5. Fix the SDK export `status` mapping and the colon-containing `from` normalization.

---
