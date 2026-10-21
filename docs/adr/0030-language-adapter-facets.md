---
status: accepted
date: 2026-10-20
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0030: Language Adapter Facets and Package Entry Surfaces

## Context and Problem Statement

Imports written as a package specifier (`import { SymbolNode } from '@specd/code-graph'` in another workspace) were never linked to their declaration. The TypeScript and Python adapters looked the name up among the symbols of the target workspace and accepted a unique match. That match ignored what the package actually publishes, so it could pick an internal or test symbol and silently dropped exported names that were not unique. As a result impact, hotspots, and coverage were blind across workspaces.

Fixing it exposed a second problem. The public `LanguageAdapter` contract had no way to declare resolution services. Eight optional methods were detected only by checking that a method exists, related methods were scattered, and a method could exist without the adapter meaning to support the capability. The cross-workspace resolution needed one more.

The indexer must also stay language-agnostic: adding a language must not require changing it.

## Decision Drivers

- Resolve package imports only through what a package publishes, never by name.
- Adding a language requires only a new adapter.
- The adapter contract is public, so shape errors must be reported clearly at registration.
- The project is in alpha with no external adapters, so the contract can change without a migration path.
- Third parties must be able to substitute a built-in adapter, for example with a faster one.

## Considered Options

1. Keep the unique-name match and filter out test files. Rejected: it still ignores the export surface and visibility.
2. Detect optional methods by presence, adding one more method. Rejected: it cannot tell a deliberate omission from a gap, and it keeps related methods scattered.
3. Add a flag to `AdapterCapabilities` next to a loose method. Rejected: the flag and the method can disagree, and the indexer still needs an unchecked call.
4. Declare resolution services as cohesive facets, with the entry surface supplied by the adapter and the name resolved generically by the indexer. Chosen.
5. Keep a compatibility layer for the old methods. Rejected: there are no external adapters to protect in alpha.

## Decision Outcome

`LanguageAdapter` is a required core (`languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`) plus five optional facets: `packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, and `reExportLinking`. A facet is declared by being present and has no optional members. `capabilities()` and `declarationPolicy()` keep their meaning and are unrelated to facets.

The `packageResolution` facet gives the indexer the package identity, a specifier matcher, a preparation step that stores per-run package facts for all configured workspaces (it may be a no-op), and an entry surface: the ordered files and public surfaces through which a package publishes a specifier. The indexer implements the name lookup once, generically, over the public bindings of those entries. A name resolves only when every entry that publishes it leads to the same logical target. Test files are never entries. Unresolved imports create no relation, binding target, or step; the reason is a run diagnostic that is never persisted.

A resolved import persists the binding target, an `import:package` resolution step, and a file-level `IMPORTS` relation. The incremental closure follows those steps, so a change in a target workspace re-resolves its importers across workspaces. Re-export linking runs after Pass 1 and before imports are resolved, so entries have their final public bindings. A re-export is also a file dependency, so changing a re-exported module reaches the barrel that republishes it.

`AdapterRegistry.register` validates the adapter shape before changing any state and raises `INVALID_LANGUAGE_ADAPTER`. Registering a language that is already registered replaces the previous adapter for that language, per language, so a third-party adapter can substitute a built-in one.

The shared binding environment resolves a name that an import binds to a resolved declaration to that declaration, in any workspace, before it considers a same-name symbol of the importing workspace.

## Consequences

- Good: cross-package dependents appear in impact analysis, `crossWorkspaceCallers` in hotspots becomes meaningful, and spec coverage crosses packages.
- Good: a new language is one adapter, proven by a test with a made-up language and the unmodified indexer.
- Good: contract mistakes fail at registration with an actionable message.
- Bad: this is a breaking change to a public type. It is accepted while there are no external adapters.
- Bad: the graph grows with cross-workspace and barrel `IMPORTS` edges, and the incremental closure can be larger.
- Limitation: Go qualified selectors (`pkg.Name`) are still not resolved to symbols across packages, and Python names that a package `__init__` only re-imports stay unresolved because they are not public routes.

## Decision Outcome Confirmation

Compliance is confirmed by the code-graph test suite: registration validation, the package import resolver, per-language entry surfaces, cross-workspace integration fixtures for TypeScript, Python, Go, and PHP, incremental runs compared with clean rebuilds, a made-up language that resolves package imports with the unmodified indexer, and a static scan that keeps language, extension, and manifest names out of the indexer and the resolver.

## More Information

- Spec: `code-graph:language-adapter`
- Spec: `code-graph:workspace-integration`
- Spec: `code-graph:indexer`
