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
