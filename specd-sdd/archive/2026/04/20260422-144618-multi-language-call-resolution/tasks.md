# Tasks: multi-language-call-resolution

## 1. Domain vocabulary

- [x] 1.1 Add `CONSTRUCTS` and `USES_TYPE` to the closed relation vocabulary
      `packages/code-graph/src/domain/value-objects/relation-type.ts`: `RelationType` and `isRelationType()` - add `Constructs = 'CONSTRUCTS'` and `UsesType = 'USES_TYPE'` so persisted graph edges can distinguish construction and static type usage.
      Approach: widen the enum/object in place, keep `createRelation()` unchanged, and update every exhaustive relation-type enumeration without changing existing relation semantics.
      (Req: Relation types, Scoped binding relation output)

- [x] 1.2 Add source-location value object
      `packages/code-graph/src/domain/value-objects/source-location.ts`: `SourceLocation` - represent workspace-prefixed file path plus start/end line and column for binding and call facts.
      Approach: create an immutable readonly interface with JSDoc; keep it as a domain value object with no resolution logic or I/O.
      (Req: Scoped binding model)

- [x] 1.3 Add binding fact value objects
      `packages/code-graph/src/domain/value-objects/binding-fact.ts`: `BindingScopeKind`, `BindingSourceKind`, `BindingScope`, `BindingFact` - encode deterministic adapter-provided scope and binding facts.
      Approach: define readonly interfaces and const string vocabularies for file/class/method/function/block scopes and local/parameter/return-type/property/class-managed/inherited/file-global/imported-type/framework-managed/constructor-call/alias/receiver sources.
      (Req: Scoped binding model, Detectable dependency boundary)

- [x] 1.4 Add call fact value objects
      `packages/code-graph/src/domain/value-objects/call-fact.ts`: `CallForm`, `CallFact`, `ResolvedDependency` - normalize free, member, static, and constructor calls before shared resolution.
      Approach: define readonly interfaces where `ResolvedDependency.relationType` is limited to `RelationType.Calls`, `RelationType.Constructs`, or `RelationType.UsesType`; include deterministic reason and source location.
      (Req: Scoped binding model, Scoped binding relation output)

- [x] 1.5 Classify import declarations without fake local names
      `packages/code-graph/src/domain/value-objects/import-declaration-kind.ts` and `packages/code-graph/src/domain/value-objects/import-declaration.ts`: `ImportDeclarationKind`, `ImportDeclaration.kind` - represent named, namespace, default, side-effect, dynamic, require, and blank import forms.
      Approach: add optional `kind?: ImportDeclarationKind | undefined`; treat `undefined` as `named`; keep `localName`, `originalName`, `specifier`, and `isRelative` required; use empty names for file-only imports.
      (Req: Import declaration)

- [x] 1.6 Export the new public value-object types
      `packages/code-graph/src/domain/value-objects/index.ts` and `packages/code-graph/src/index.ts`: public exports - expose the new types referenced by `LanguageAdapter`.
      Approach: use named ESM exports only and add JSDoc to every exported symbol introduced by this change.
      (Req: LanguageAdapter interface, Scoped binding model)

## 2. Shared scoped environment

- [x] 2.1 Add the scoped binding environment service shell
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: `SymbolLookup`, `BuildScopedBindingEnvironmentInput`, `ScopedBindingEnvironment`, `buildScopedBindingEnvironment()` - create the pure domain service entry point.
      Approach: keep the service in `domain/services`, accept only symbols/imports/importMap/scopes/facts and a `SymbolLookup`, and avoid store, filesystem, adapter, or application imports.
      (Req: Scoped binding environment resolution, Scoped binding model)

- [x] 2.2 Implement lexical lookup and deterministic shadowing
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: `ScopedBindingEnvironment.lookup()` - resolve visible facts by walking `scopeId -> parentId` and preferring nearest lexical scope.
      Approach: sort facts by scope depth and source location, include import-derived facts from the input, and drop equal-confidence duplicate candidates rather than selecting arbitrarily.
      (Req: Scoped binding environment resolution, Detectable dependency boundary)

- [x] 2.3 Implement target and receiver resolution
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: `resolveTargetSymbol()` and `resolveReceiver()` - resolve binding facts and member-call receivers to deterministic symbol candidates.
      Approach: use `targetSymbolId` first, then `targetName` plus `SymbolLookup.findByName()` with file/workspace prefix when available; return no target for unresolved or ambiguous receiver facts.
      (Req: Scoped binding environment resolution, Scoped binding fact extraction)

- [x] 2.4 Implement dependency fact resolution
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: `resolveDependencyFacts()` - convert binding and call facts into resolved dependency edges.
      Approach: emit `CALLS` for deterministic free/member/static calls, `CONSTRUCTS` for deterministic constructor facts, and `USES_TYPE` for parameter/return/property/imported/static type references; runtime-only or ambiguous facts emit no relation.
      (Req: Scoped binding relation output, Detectable dependency boundary)

## 3. Indexer integration

- [x] 3.1 Add a `SymbolLookup` wrapper around the in-memory symbol index
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: Pass 2 helper functions - expose `findByName()` and `findByFile()` over the existing `SymbolIndex`.
      Approach: keep the wrapper private to the use case, do not query `GraphStore`, and preserve current constructor signature and dependency injection.
      (Req: Scoped binding environment resolution, Two-pass extraction with in-memory index)

- [x] 3.2 Extend import resolution for file-only imports
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `resolveImports()` - emit file-level `IMPORTS` for side-effect, dynamic, require, and blank imports when the target file resolves.
      Approach: for file-only kinds, skip import-map population and resolve only `fileImports`; keep unresolved external packages dropped silently.
      (Req: Import declaration, Two-pass extraction with in-memory index)

- [x] 3.3 Collect adapter binding and call facts in Pass 2
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: Pass 2 extraction loop - call `adapter.extractBindingFacts?.(prefixedPath, content, symbols, imports) ?? []` and `adapter.extractCallFacts?.(prefixedPath, content, symbols) ?? []`.
      Approach: build import-derived binding facts from `importMap`, then call `buildScopedBindingEnvironment()` with per-file data and the shared `SymbolLookup`.
      (Req: LanguageAdapter interface, Scoped binding environment resolution)

- [x] 3.4 Convert resolved dependencies into staged graph relations
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: relation staging helpers - turn `ResolvedDependency` values into `Relation` objects.
      Approach: preserve existing `adapter.extractRelations()` output, append shared-resolution relations, and de-duplicate by `source:type:target` inside the chunk before bulk load.
      (Req: Scoped binding relation output, Two-pass extraction with in-memory index)

- [x] 3.5 Preserve adapter compatibility during migration
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: adapter invocation path - keep all new adapter methods optional and keep `extractRelations()` as a compatibility backstop.
      Approach: custom adapters that omit binding/call fact methods continue to index with existing imports, calls, hierarchy, exports, and defines.
      (Req: LanguageAdapter interface, Detectable dependency boundary)

## 4. Built-in adapters

- [x] 4.1 Implement TypeScript import declaration gaps
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractImportedNames()` and resolver helpers - detect side-effect imports, string-literal `import()`, string-literal `require()`, namespace imports, default imports, and type-only imports.
      Approach: set `ImportDeclaration.kind` accurately; create file-only declarations with empty names; keep variable `import()` and `require()` unresolved; keep `tsconfig` path/baseUrl support in adapter-owned resolver helpers, not in `IndexCodeGraph`.
      (Req: Built-in multi-language dependency coverage, Import declaration)

- [x] 4.2 Implement TypeScript binding facts
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractBindingFacts()` - emit facts for constructor parameters, typed parameters, return types, class fields, constructor parameter properties, `this`, imported type names, and `const x = new X()` aliases.
      Approach: use static syntax only; emit facts sufficient for constructor injection to become `USES_TYPE` and local construction aliases to support receiver resolution.
      (Req: Scoped binding fact extraction, Built-in multi-language dependency coverage)

- [x] 4.3 Implement TypeScript call facts
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractCallFacts()` - emit normalized free, member, static/namespace, and constructor call facts.
      Approach: map `new X()` and `new ns.X()` to `CallForm.Constructor`, map `obj.method()` and `ns.fn()` with receiver names, and drop computed calls such as `obj[method]()` unless deterministic.
      (Req: Scoped binding fact extraction, Built-in multi-language dependency coverage)

- [x] 4.4 Implement Python import, binding, and call facts
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `extractImportedNames()`, `extractBindingFacts()`, `extractCallFacts()` - support `import package.module`, alias imports, relative package layouts, `importlib.import_module("literal")`, `__import__("literal")`, `self`/`cls`, annotations, constructor-like calls, and simple aliases.
      Approach: normalize accessible local names for imports, emit `USES_TYPE` candidates from annotations, emit `CONSTRUCTS` candidates from resolvable class calls, and drop monkey-patching, `getattr()`, and non-literal dynamic imports.
      (Req: Built-in multi-language dependency coverage, Detectable dependency boundary)

- [x] 4.5 Implement Go import, binding, and call facts
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `extractImportedNames()`, `extractBindingFacts()`, `extractCallFacts()` - support grouped, aliased, dot, and blank imports; package selector calls; receiver method calls; composite literals; parameter, return, field, and interface type references.
      Approach: map alias imports to package binding facts, blank imports to file-only dependencies, `pkg.Func()` to deterministic `CALLS`, `UserRepo{}` and `&UserRepo{}` to `CONSTRUCTS`, and type references to `USES_TYPE` when symbols resolve.
      (Req: Built-in multi-language dependency coverage, Scoped binding fact extraction)

- [x] 4.6 Implement PHP shared fact extraction while preserving mature behavior
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractBindingFacts()` and `extractCallFacts()` - expose existing require/include, dynamic loader, framework-managed alias, loaded-instance, and deterministic construction/type facts through the shared model.
      Approach: keep existing `extractRelations()` output as a compatibility backstop, migrate covered alias flows into binding/call facts first, map `new X()` to `CONSTRUCTS`, and map typed parameters/properties/returns to `USES_TYPE`.
      (Req: Built-in multi-language dependency coverage, Detectable dependency boundary)

## 5. Persistence, traversal, and impact

- [x] 5.1 Prove graph stores persist new relation types
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: shared contract tests - add `USES_TYPE` and `CONSTRUCTS` bulk-load, query, and relation retrieval cases.
      Approach: exercise the same public `GraphStore` contract used by SQLite and Ladybug so both backends prove the new edge types behave like existing relations.
      (Req: Relation types, Scoped binding relation output)

- [x] 5.2 Update SQLite graph-store relation handling if needed
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: relation persistence and query code - include `USES_TYPE` and `CONSTRUCTS` anywhere relation types are enumerated or filtered.
      Approach: keep method signatures unchanged; if relations are stored as strings with no constraint, make no behavioral change beyond tests.
      (Req: Scoped binding relation output)

- [x] 5.3 Update Ladybug graph-store relation handling if needed
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: relation persistence and query code - include `USES_TYPE` and `CONSTRUCTS` anywhere Cypher labels, filters, or relation batches enumerate relation types.
      Approach: keep backend schema behavior compatible with full graph clear/re-index rollback; do not change the `GraphStore` public contract.
      (Req: Scoped binding relation output)

- [x] 5.4 Ensure traversal, impact, and hotspots count the new dependency edges
      `packages/code-graph/src/domain/services/get-upstream.ts`, `packages/code-graph/src/domain/services/get-downstream.ts`, `packages/code-graph/src/domain/services/analyze-impact.ts`, `packages/code-graph/src/domain/services/analyze-file-impact.ts`, `packages/code-graph/src/domain/services/compute-hotspots.ts`: dependency traversal logic - include `USES_TYPE` and `CONSTRUCTS` wherever relation filters define dependency edges.
      Approach: prefer generic relation traversal when available; otherwise add the two new relation types to explicit dependency filters so impact and hotspots include static type and construction dependencies.
      (Req: Scoped binding relation output, Relation types)

## 6. Unit and integration tests

- [x] 6.1 Add relation and value-object tests
      `packages/code-graph/test/domain/value-objects/relation-type.spec.ts`, `packages/code-graph/test/domain/value-objects/import-declaration.spec.ts`, `packages/code-graph/test/domain/value-objects/binding-fact.spec.ts`, `packages/code-graph/test/domain/value-objects/call-fact.spec.ts`: value-object coverage - verify relation acceptance, immutable fact shape, import kind compatibility, file-only import declarations, scope/source/call vocabularies, and readonly properties.
      Approach: use Vitest with explicit assertions, no snapshots, and tests mirroring `src/domain/value-objects`.
      (Req: Relation types, Import declaration, Scoped binding model)

- [x] 6.2 Add scoped environment edge tests
      `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts`: shared resolver coverage - verify lexical lookup, inner-scope shadowing, imported type lookup, local alias from known binding, unknown alias drop, receiver resolution, constructor resolution to `CONSTRUCTS`, type annotation resolution to `USES_TYPE`, ambiguous duplicate candidate drop, and no store access.
      Approach: use in-memory `SymbolNode` fixtures and a fake `SymbolLookup`; assert `CALLS`, `CONSTRUCTS`, and `USES_TYPE` between the same source/target can coexist when semantics differ.
      (Req: Scoped binding environment resolution, Detectable dependency boundary)

- [x] 6.3 Add TypeScript edge-case adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: import, type, constructor, and call fact tests - cover side-effect imports, unresolved side-effect imports, literal and variable `import()`, literal and variable `require()`, `require.resolve()` exclusion, type-only imports, namespace/default imports, constructor parameters, ordinary parameters, returns, fields, constructor parameter properties, generics, unions/intersections, built-in type exclusions, `new X()`, `new ns.X()`, optional chaining, and computed member-call drops.
      Approach: assert adapter fact output rather than final store state; use deterministic symbol fixtures where target names must be represented.
      (Req: Built-in multi-language dependency coverage, Scoped binding fact extraction)

- [x] 6.4 Add Python edge-case adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: import, annotation, constructor, and receiver tests - cover `import package.module`, `from package import Class as Alias`, relative imports across `__init__.py`, literal and variable `importlib.import_module()`, literal `__import__()`, constructor calls, parameter/return/attribute annotations, monkey-patched attributes, `getattr()` drops, and deterministic `super().method()` handling.
      Approach: assert accessible local names, binding facts for `self` and `cls`, `USES_TYPE` candidates from annotations, `CONSTRUCTS` candidates from class calls, and no persisted candidates for dynamic-only flows.
      (Req: Built-in multi-language dependency coverage, Detectable dependency boundary)

- [x] 6.5 Add Go edge-case adapter tests
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: import, selector, composite literal, and type-reference tests - cover grouped imports, aliases, dot imports, blank imports, `pkg.Func()`, `obj.Method()`, `UserRepo{}`, `&UserRepo{}`, parameter types, return types, struct fields, interface embedding, and unresolved selector drops.
      Approach: assert blank imports become file-only dependencies without callable bindings, package aliases feed selector resolution, and unknown receiver method calls emit no relation candidate.
      (Req: Built-in multi-language dependency coverage, Scoped binding fact extraction)

- [x] 6.6 Add PHP parity and shared fact tests
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: framework parity tests - cover `require_once 'literal.php'`, dynamic require drops, `use App\Service as Svc`, `new Svc()`, typed parameters/properties/returns, CakePHP `$uses`, `$this->Article->save()`, runtime service ID drops, and deterministic framework string IDs.
      Approach: prove existing CakePHP/CodeIgniter/framework-managed relations remain stable while shared binding/call facts are emitted for covered deterministic flows.
      (Req: Built-in multi-language dependency coverage, Detectable dependency boundary)

- [x] 6.7 Add traversal and hotspot tests for new edge types
      `packages/code-graph/test/domain/services/traversal.spec.ts` and `packages/code-graph/test/domain/services/compute-hotspots.spec.ts`: dependency analysis tests - assert upstream/downstream traversal and hotspot scoring include `USES_TYPE` and `CONSTRUCTS`.
      Approach: build minimal relation graphs where removing either new relation type changes expected impact/hotspot results.
      (Req: Scoped binding relation output)

- [x] 6.8 Add indexer integration tests for issue examples
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: Pass 2 integration cases - verify `constructor(expander: TemplateExpander)` emits `USES_TYPE`, `new TemplateExpander(builtins)` emits `CONSTRUCTS`, `HookRunner` and `GraphStore` type annotations are reachable through `USES_TYPE`, and file-only imports create `IMPORTS` without fake local symbols.
      Approach: index small in-memory/temp workspaces through `IndexCodeGraph` and assert final relations produced by bulk load or the test graph store.
      (Req: Scoped binding environment resolution, Two-pass extraction with in-memory index)

## 7. Documentation and verification

- [x] 7.1 Update code-graph package documentation
      `packages/code-graph/README.md`: relation and adapter API sections - document `USES_TYPE`, `CONSTRUCTS`, existing hierarchy relations, deterministic scoped binding support, and conservative non-goals.
      Approach: describe that built-in adapters emit deterministic facts and shared resolution maps them to persisted edges; do not add `docs/` files unless a code-graph guide exists by implementation time.
      (Req: LanguageAdapter interface, Relation types)

- [x] 7.2 Run package-level code-graph tests
      `packages/code-graph`: verification command - run `pnpm --filter @specd/code-graph test`.
      Approach: use this as the focused suite for value objects, domain services, adapters, graph stores, traversal, and indexer integration before wider checks.
      (Req: Built-in multi-language dependency coverage, Scoped binding environment resolution)

- [x] 7.3 Run repository type checks
      Repository root: verification command - run `pnpm typecheck`.
      Approach: confirm new public types, optional adapter methods, exports, and readonly value objects compile under strict TypeScript and ESM NodeNext rules.
      (Req: LanguageAdapter interface, Scoped binding model)

- [x] 7.4 Re-index and verify concrete upstream dependent impact examples
      Repository root: CLI verification - run `node packages/cli/dist/index.js graph index --force --format json`, then impact checks for `TemplateExpander`, `HookRunner`, and `GraphStore`.
      Approach: use `node packages/cli/dist/index.js graph impact --symbol <name> --direction upstream --format json`; expected result is deterministic upstream dependents when source relationships exist, with `TemplateExpander` showing both `USES_TYPE` constructor-injection and `CONSTRUCTS` construction dependents.
      (Req: Scoped binding relation output, Built-in multi-language dependency coverage)

## 8. Direction alias follow-up

- [x] 8.1 Implement CLI direction alias normalization
      `packages/cli/src/commands/graph/impact.ts`: `registerGraphImpactCommand()` and a new `parseImpactDirection()` helper - accept `dependents` and `dependencies` as user-facing aliases.
      Approach: normalize `dependents` to `upstream` and `dependencies` to `downstream` before opening the provider; keep `upstream`, `downstream`, and `both` accepted; fail invalid values with a CLI usage error before provider access.
      (Req: Command signature)

- [x] 8.2 Add CLI direction alias tests
      `packages/cli/test/commands/graph-impact.spec.ts`: graph impact command tests - verify alias normalization and invalid direction handling.
      Approach: assert `--direction dependents` reaches provider calls as `upstream`, `--direction dependencies` reaches provider calls as `downstream`, compatibility values still work, and `--direction sideways` exits with code 1 before provider access.
      (Req: Command signature, scenario: Dependents direction alias maps to upstream, scenario: Dependencies direction alias maps to downstream, scenario: Invalid direction fails before provider access)

- [x] 8.3 Update CLI graph impact reference terminology
      `docs/cli/cli-reference.md`: `graph impact` section - document `dependents` and `dependencies` as preferred direction values while preserving `upstream` and `downstream` as compatibility values.
      Approach: list `--direction dependents|dependencies|upstream|downstream|both`; describe omitted/default direction as dependent analysis; describe `dependencies` / `downstream` counts as dependency counts.
      (Req: Command signature, Output format, CLI documentation)

- [x] 8.4 Update workflow skill template graph-impact guidance
      `packages/skills/templates/shared/shared.md`, `packages/skills/templates/specd-design/SKILL.md`, `packages/skills/templates/specd-implement/SKILL.md`: graph impact instructions - replace ambiguous downstream-dependent wording with dependents/dependencies terminology.
      Approach: use `--direction dependents` or the term dependents for blast-radius queries; reserve `--direction dependencies` or compatibility `--direction downstream` for dependency queries; keep CLI examples valid.
      (Req: Graph impact terminology in workflow templates)

- [x] 8.5 Verify graph-impact terminology and aliases after documentation updates
      `docs/cli/cli-reference.md` and `packages/skills/templates/`: terminology scan and CLI smoke checks - confirm docs/templates use aliases correctly and compatibility values are described accurately.
      Approach: run `rg "downstream dependents|downstream impact" docs/cli packages/skills/templates` and expect no matches; review remaining `--direction downstream` matches to ensure they describe dependencies; run graph impact smoke checks with `--direction dependents`, `--direction dependencies`, `--direction upstream`, and `--direction downstream`.
      (Req: Command signature, Output format, Graph impact terminology in workflow templates)

## 9. Review follow-up: self-relation filtering

- [x] 9.1 Filter shared resolver self-relations
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: `resolveDependencyFacts()` - drop any resolved dependency whose `sourceSymbolId` equals `targetSymbolId`.
      Approach: apply the filter before returning `ResolvedDependency[]`; keep it relation-type agnostic so `CALLS`, `CONSTRUCTS`, and `USES_TYPE` cannot create self-edges from shared resolution.
      (Req: Scoped binding relation output, scenario: Self-relation is not persisted)

- [x] 9.2 Guard Pass 2 staging against adapter backstop self-edges
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: Pass 2 relation staging/de-duplication helper - reject symbol-to-symbol relations where `source === target` before bulk-load staging.
      Approach: add the guard next to existing relation normalization/de-duplication so legacy `extractRelations()` output cannot reintroduce self-edges while adapter backstops remain enabled.
      (Req: Scoped binding environment resolution, scenario: Resolved self-relation is dropped before staging)

- [x] 9.3 Add scoped environment regression tests for self-relations
      `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts`: resolver tests - assert self `CALLS`, `CONSTRUCTS`, and `USES_TYPE` candidates are dropped.
      Approach: use in-memory symbol fixtures where the caller/owner and resolved target share the same symbol id; assert `resolveDependencyFacts()` returns no edge for those candidates while still preserving non-self edges.
      (Req: Scoped binding relation output, Detectable dependency boundary)

- [x] 9.4 Add indexer integration regression for no persisted self-edge
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`: Pass 2 integration case - verify a self-edge candidate does not reach the test graph store.
      Approach: index a minimal fixture or adapter stub that would otherwise produce `source === target`; assert stored relations contain no self-edge and normal `USES_TYPE` / `CONSTRUCTS` relations still persist.
      (Req: Scoped binding environment resolution, Two-pass extraction with in-memory index)

- [x] 9.5 Re-run formal graph smoke checks after filtering
      Repository root: CLI verification - re-index and run impact checks for `TemplateExpander`, `HookRunner`, and `GraphStore` with `--direction dependents`.
      Approach: after `node packages/cli/dist/index.js graph index --force --format json`, inspect `TemplateExpander` impact output and confirm it has real dependents but is not reported as its own dependent.
      (Req: Scoped binding relation output, Built-in multi-language dependency coverage)
