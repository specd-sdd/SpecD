# Proposal: multi-language-call-resolution

## Motivation

The code graph currently under-represents real dependencies and calls in supported languages, which makes impact analysis and hotspot detection less reliable. Issues 52 and 54 should be handled together because more complete dependency detection depends on a shared, deterministic way to reason about scoped receiver bindings.

## Current behaviour

`@specd/code-graph` registers built-in adapters for TypeScript/TSX/JavaScript/JSX, Python, Go, and PHP, but their dependency and call coverage is uneven.

TypeScript handles simple static imports and identifier calls, but misses dynamic `import()`, CommonJS `require()`, side-effect imports, member-call resolution, constructor calls, constructor-injected type dependencies, parameter type annotations, and project alias layouts such as `tsconfig` `paths`/`baseUrl`. Python handles common static import syntax but misses deterministic dynamic imports such as `importlib.import_module()` and `__import__()`, has limited package/submodule resolution, and resolves calls mostly by name. Go parses imports and symbols but does not yet emit useful `IMPORTS` or `CALLS` relations for normal selector-expression forms such as `pkg.Func()` or `obj.Method()`. PHP already has richer dynamic-loader support, but much of the alias and loaded-instance call handling is adapter-local rather than reusable.

The current pipeline passes `extractImportedNames()` output through indexer resolution and then calls adapter-local `extractRelations()`. Anything outside that import-map model is either adapter-specific or invisible to the graph.

## Proposed solution

Extend the existing code-graph specs so all current built-in adapters can contribute deterministic binding and call-resolution facts while the shared indexer pipeline builds and applies a scoped binding environment.

The first iteration should remain conservative:

- adapters extract raw syntax facts and language-specific binding semantics
- shared code-graph model types represent binding facts, call forms, scoped lookup inputs, and two new persisted dependency relation types: `USES_TYPE` and `CONSTRUCTS`
- the indexer builds per-file scoped binding environments during Pass 2 and provides them to relation extraction or shared call resolution
- constructor calls are emitted as `CONSTRUCTS` when the constructed target resolves deterministically
- constructor injection, parameter annotations, field/property annotations, and other deterministic type references are emitted as `USES_TYPE` when the referenced type symbol resolves deterministically
- `CALLS`, `IMPORTS`, `USES_TYPE`, `CONSTRUCTS`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` become the relevant persisted dependency vocabulary for code impact
- unresolved, dynamic, fuzzy, reflection-based, runtime-container, interprocedural, or whole-program cases are dropped or recorded only as non-persisted diagnostics/debug metadata
- resolved dependency edges whose source and target are the same symbol are dropped before persistence, because self-relations add noise to impact analysis without increasing blast-radius signal

This should improve dependency and call/type/constructor coverage across TypeScript/TSX/JavaScript/JSX, Python, Go, and PHP without moving language-specific semantics into `IndexCodeGraph`.

The user-facing CLI, documentation, and workflow skills should also stop forcing users through the ambiguous graph-theory wording when the intent is code-impact analysis. `specd graph impact --direction` should accept the clearer aliases `dependents` and `dependencies` while preserving the existing `upstream`, `downstream`, and `both` values for compatibility. The preferred documentation language is:

- **dependents** for symbols and files that depend on the target, implemented by `--direction dependents` and compatible with existing `--direction upstream`
- **dependencies** for symbols and files the target depends on, implemented by `--direction dependencies` and compatible with existing `--direction downstream`

CLI and skill docs should use these clearer aliases by default and mention `upstream` / `downstream` as compatibility values.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:code-graph/symbol-model`: define the shared, immutable value-object vocabulary for binding facts, scope ownership, call forms, receiver bindings, deterministic resolution metadata, and the new `USES_TYPE` / `CONSTRUCTS` relation types.
  - Depends on (added): none
- `code-graph:code-graph/language-adapter`: extend adapter responsibilities so built-in adapters can extract deterministic binding facts, dynamic import declarations where statically identifiable, call-form facts, and hierarchy-related facts without performing shared scoped lookup themselves.
  - Depends on (added): none
- `code-graph:code-graph/indexer`: extend the two-pass extraction pipeline so Pass 2 builds scoped binding environments from adapter facts and uses them for import, call, and hierarchy resolution across all workspaces.
  - Depends on (added): none
- `cli:cli/graph-impact`: add `dependents` and `dependencies` aliases for impact direction, mapping them to `upstream` and `downstream` respectively, and clarify user-facing direction nomenclature.
  - Depends on (added): none
- `skills:skill-templates-source`: update bundled specd workflow skill templates so graph impact guidance uses the dependents/dependencies nomenclature and does not request `downstream` when it means dependents.
  - Depends on (added): none
- `default:_global/docs`: no requirement change; included to own the `docs/cli/cli-reference.md` update required by the global CLI documentation rule.
  - Depends on (added): none

## Impact

Affected code areas include:

- `packages/code-graph/src/domain/value-objects/language-adapter.ts`
- `packages/code-graph/src/domain/value-objects/relation.ts`
- `packages/code-graph/src/domain/value-objects/import-declaration.ts`
- new or existing code-graph domain value objects/services for binding facts and scoped environment construction
- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
- code-graph adapter and indexer tests under `packages/code-graph/test/`
- `packages/cli/src/commands/graph/impact.ts`
- `packages/cli/test/commands/graph-impact.spec.ts`
- `docs/cli/cli-reference.md`
- `packages/skills/templates/shared/shared.md`
- `packages/skills/templates/specd-design/SKILL.md`
- `packages/skills/templates/specd-implement/SKILL.md`

The change will affect high-impact symbols, especially `LanguageAdapter`, `IndexCodeGraph`, relation creation, and graph-store relation handling. Persisted graph semantics are intentionally widened by the `symbol-model` delta to add `USES_TYPE` and `CONSTRUCTS`; stores, traversal, impact analysis, docs, and tests must be updated accordingly.

Concrete validation should include known constructor-dependency gaps from the issue discussion, including `TemplateExpander` constructor injection in `NodeHookRunner`, `new TemplateExpander(builtins)` in composition code, and port/interface dependencies such as `HookRunner` and `GraphStore`. These should no longer report zero upstream dependents when deterministic source relationships exist.

No new external runtime dependency is expected from the proposal. If TypeScript path alias support needs `tsconfig` parsing beyond existing package-identity reads, the design should keep that I/O behind adapter-owned optional methods and preserve the rule that extraction methods remain synchronous and pure over provided source content.

## Technical context

The user clarified that the scope is all languages currently supported by `@specd/code-graph` built-in adapters, not only languages currently present in this repository's indexed graph. The current built-in adapters are TypeScript/TSX/JavaScript/JSX, Python, Go, and PHP.

Issue 52 records adapter-specific gaps in TypeScript, Python, and Go dependency detection. Its comments add constructor injection, constructor calls, and parameter type annotations as concrete dependency gaps, especially for hexagonal architecture code where dependencies often flow through constructors and composition factories. Issue 54 defines the shared Scoped Binding Environment direction, and its comments tie those TypeScript constructor/type dependency cases directly to the shared environment design. Combining the issues avoids building more adapter-local heuristics that would need to be replaced by a shared environment later.

Existing specs already cover the three relevant responsibilities: `symbol-model` defines shared graph vocabulary, `language-adapter` defines adapter extraction and language-specific resolution, and `indexer` defines the two-pass orchestration. A separate `scoped-binding-environment` spec was considered, but this proposal keeps the change in the existing specs so the environment is specified as part of the shared model and indexing pipeline rather than as a standalone capability. After review, the design direction changed from overloading `CALLS` for constructor/type dependencies to adding explicit `CONSTRUCTS` and `USES_TYPE` relations because code impact needs to distinguish instantiation, invocation, and type dependency semantics.

Formal graph verification after the initial implementation found a noisy self-relation (`TemplateExpander -> TemplateExpander`) emitted by scoped binding resolution. The intended model is that deterministic dependency edges represent impact between distinct symbols; self-edges should be filtered in the shared resolver or relation staging path, and covered by regression tests.

Important constraints from current specs:

- domain logic must remain pure and must not import infrastructure
- the application layer must not import concrete infrastructure adapters
- adapter extraction methods must remain synchronous and pure
- `getPackageIdentity()` and `resolveQualifiedNameToPath()` are currently the only adapter methods allowed to perform I/O
- `IndexCodeGraph` must not contain language-specific resolution logic
- `RelationType` is closed; this change explicitly updates that closed set with `USES_TYPE` and `CONSTRUCTS`
- unsupported or unresolvable calls and dependency targets should be dropped rather than guessed
- `specd graph impact` currently accepts only `--direction upstream|downstream|both`; the user confirmed this should change so `dependents` and `dependencies` are accepted CLI aliases, not just documentation wording
- CLI docs and bundled workflow skills must prefer the clearer `dependents`/`dependencies` aliases while still documenting `upstream`/`downstream` compatibility values

## Open questions

None.
