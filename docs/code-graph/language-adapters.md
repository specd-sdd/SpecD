---
title: Language adapters
description: How to write and register a language adapter for `@specd/code-graph`, including the required core, the optional facets, and how package imports resolve across workspaces.
sidebar_position: 4
---

# Language adapters

A language adapter teaches `@specd/code-graph` one language: how to read its source files, which manifests describe its packages, and how its imports find their targets. This page is the complete contract for adapter authors. You do not need any other document to write one.

> **Hosts:** hosts import `@specd/sdk` only. This page is for people who write or change adapters inside the monorepo, or who register their own adapter through the code-graph package API.

## How an adapter fits in

The indexer is language-agnostic. It discovers files, asks the adapter registered for each file's extension to analyze it, and then resolves everything that crosses a file or a workspace boundary using only what the adapters declare. The indexer never inspects a language identifier, a file extension, or a manifest name to decide how to resolve something.

An indexing run has these steps, in order:

1. **Package map.** Before any file is analyzed, `packageResolution.identity` names the package that each workspace's manifest declares. Every adapter that provides package resolution is asked for every workspace; a multi-language workspace keeps one identity per language. If multiple workspaces claim the same name, the collision is recorded as an error and the name resolves to neither. The indexer builds a `package name → workspace` map from those answers.
2. **Pass 1.** For each changed file, `analyzeFile` returns every fact the adapter can prove about it. Unchanged files keep their stored facts.
3. **Preparation.** `packageResolution.prepare` is called once per adapter with every configured workspace, including unchanged ones. It stores compact data in the run's session and may be a no-op when the package map and the indexed files are enough.
4. **Re-export linking.** `reExportLinking.link` turns re-export routes into public bindings, so that every package entry has its final set of exports before any import is resolved.
5. **Pass 2.** For each file, `resolveImports` resolves its imports and `buildRelations` derives graph relations from the stored facts. Pass 2 performs no filesystem access.

## The required core

Every adapter implements these six members. All of them are synchronous and deterministic with respect to their arguments and the session they receive. None of them may keep mutable state on the adapter instance that leaks between runs; use the session's adapter state instead.

| Member                  | Purpose                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `languages()`           | The language identifiers the adapter handles, for example `['python']`. Must not be empty.                                                                 |
| `extensions()`          | A map from file extension (with the dot) to one of the declared language identifiers, for example `{ '.py': 'python', '.pyi': 'python' }`.                 |
| `resolutionManifests()` | The exact basenames of every manifest the adapter reads (for example `['pyproject.toml']`). Returns an empty array when it reads none. Never performs I/O. |
| `analyzeFile(...)`      | Parses one file once and returns symbols, imports, binding facts, call facts, and reference facts. Receives the file content as a string.                  |
| `resolveImports(...)`   | Resolves the file's stored imports into symbol mappings, file dependencies, resolution steps, and diagnostics, using the session and the context helpers.  |
| `buildRelations(...)`   | Builds relations from the stored facts and the resolved imports.                                                                                           |

`resolutionManifests()` has a second job: the indexer includes those manifests in the graph's derivation fingerprint. When any of them changes, the next run rebuilds the graph. List every manifest your facets read and nothing else.

### Parser resource lifecycle and memory management

An adapter whose parsing library holds native, WASM, or otherwise explicitly managed memory (such as tree-sitter C/C++ bindings) **MUST** register the parser-owned resources it creates while analysing a file into the parser-resource scope exposed by the `IndexSession`:

1. **Immediate registration:** The registration `session.parserResources.register(resource, () => resource.delete())` MUST happen inside `analyzeFile`, immediately after the content is parsed and before any traversal of the parse result. This guarantees that the resource is released when the file's epoch closes, even if subsequent AST traversal throws an unhandled error.
2. **No external retention:** Adapters MUST NOT retain parser AST nodes, syntax trees, or native handles in adapter-private session state, in adapter-instance fields, or in any collection that outlives the single file's analysis.
3. **Plain data return:** Everything returned in the `FileAnalysisDraft` from `analyzeFile` MUST be plain, memory-friendly data structures. It must not retain AST nodes, parse trees, or references to parser-runtime objects.
4. **No-op for managed libraries:** An adapter whose parser requires no explicit retention or release (e.g. pure TypeScript/JavaScript parsers whose ASTs are managed entirely by V8 GC) registers nothing. The registration contract is independent of any specific parsing technology.

## Facets

A **facet** is a group of resolution services that an adapter provides only when it supports them. An adapter exposes a facet as an optional read-only property.

Rules that apply to every facet:

- **Presence is the declaration.** If the property exists, the adapter supports the capability behind it. Consumers check for the facet and never probe individual methods.
- **No optional members.** Every member of a facet is required. If you cannot provide all members, do not expose the facet.
- **Absent facet, no error.** When a facet is absent, the behaviour that depends on it does not run for your language. Nothing fails and no fallback guesses a result. Affected imports stay unresolved and the run records, outside the graph, that your adapter does not provide the facet.
- **A facet that throws does not stop the run.** The error is recorded for the file or the adapter, and the run continues. If `identity`, `prepare`, or `link` throws, the adapter behaves as if it did not provide package resolution for the rest of the run (for every workspace) and is listed in `importDiagnostics.adaptersWithoutPackageResolution`.
- **Facets are different from capability flags.** `capabilities()` states which semantic categories the adapter can prove (declarations, members, bindings, hierarchy, build context). `declarationPolicy()` states how it classifies declarations. Facets state which resolution services the adapter provides. They are separate declarations, and one never stands in for the other.

There are five facets.

### `packageResolution`

Connects a package specifier used in one workspace to the files that the target workspace's package publishes. Provide it when your language has packages that other workspaces import by name.

Three directory roots are distinct and must not be confused:

- The **project root** is where the project configuration lives; it anchors configuration, graph storage, and project-relative paths. It is never a boundary for package resolution.
- The **code root** is the directory holding that workspace's code, which may be inside the project root or outside it (for example a workspace in another repository).
- The **package root** is the directory of the manifest that gives the workspace its package identity.

The package root is located by a single search shared between `identity` and `prepare`. The search starts at the canonical code root (symlinks resolved, no trailing slash) and walks upward to find the manifest, bounded by `repoRoot` (the root of the version-control repository containing that code root). When no VCS repository is detected, only the code root itself is inspected and the walk never goes upward.

Candidate manifests are read and parsed once during the upward walk via `findPackageManifest`. When inspecting candidates, parsed values and terminal skip diagnostics are returned together (`{ match, skipped }`). Terminal skipped manifests (such as manifests lacking identity fields or displaced fallbacks) are always reported via the optional `report` diagnostic callback—including when no matching manifest is found across the entire walk up to `repoRoot`. When a valid manifest is selected, its already-parsed compact data is reused during preparation so manifest file contents are never re-parsed.

| Member                                                         | Contract                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity(codeRoot, repoRoot?, report?)`                       | Returns the package identity declared in the manifest at or above `codeRoot` (bounded by `repoRoot` when given), or `undefined`. Receives optional `report?: (diagnostic: string) => void` for skipped manifests. Terminal skipped paths are always reported even when no valid manifest is found. May read the filesystem. |
| `prepare({ session, workspaces, projectRoot })`                | Stores facts needed by `matchSpecifier` and `entrySurface` for all configured workspaces as compact, immutable data in the session. `workspaces` provides `{ name, codeRoot, repoRoot? }`. Reads candidate manifests once and reuses parsed compact manifest data. Pass 2 never calls it again.                             |
| `matchSpecifier(specifier, knownPackages, session)`            | Returns which known package a non-relative specifier refers to, or `undefined`. Depends only on its arguments and the data `prepare` stored. No I/O. Use the session when the specifier is not named after its package.                                                                                                     |
| `entrySurface({ specifier, packageName, workspace, session })` | Returns the ordered entries through which the package publishes the specifier. Each entry has a workspace-prefixed `filePath` and the public `surface` id under which that file's exports are stored. No I/O.                                                                                                               |

Rules for `entrySurface`:

- Derive entries only from the manifest and the language's layout rules, using data stored by `prepare`.
- Never search symbols by name. An entry is a place that publishes names, not a symbol.
- Returning test files is harmless: the indexer discards files classified as tests (a test file is never a package entry, even when the specifier names it) and files that are not indexed, so you do not need to filter them.
- Return an empty array when the package publishes nothing for the specifier.
- Return every alternative the manifest offers (for example two different runtime targets). The indexer resolves a name only when all entries that publish it agree on one target, and reports it as ambiguous otherwise.

Built-in adapters read these manifests:

| Language   | Manifest         | Identity         |
| ---------- | ---------------- | ---------------- |
| TypeScript | `package.json`   | `name`           |
| Python     | `pyproject.toml` | `[project].name` |
| Go         | `go.mod`         | `module`         |
| PHP        | `composer.json`  | `name`           |

### `relativeImportResolution`

Maps a relative module specifier to candidate files, using the language's extension and index-file conventions.

| Member                         | Contract                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve(fromFile, specifier)` | Returns one candidate file id or several, most likely first. Pure, no I/O. It does not choose between candidates; the caller keeps the indexed ones. |

Do not provide this facet when your language has no relative imports.

### `qualifiedNameResolution`

Supports languages whose imports and loaders are addressed by namespace-qualified names.

| Member                                            | Contract                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `build(namespace, symbolName)`                    | Builds the language's canonical qualified name. Pure.                                                                      |
| `resolveToPath(qualifiedName, codeRoot, session)` | Maps a qualified name to a file path using metadata already prepared in the session. Never probes the filesystem per call. |

### `symbolReferenceSyntax`

Lets users write symbol references in your language's own syntax.

| Member                      | Contract                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse(text)`               | Parses human or native member-reference text into structured owner-then-member selectors. Returns zero, one, or many explicit candidates. Dynamic or ambiguous text yields none. Pure. |
| `render(symbol, ownerPath)` | Renders a logical symbol as a generic spelling and, when different, a native spelling. `ownerPath` lists owner names from the root to the immediate owner. Pure.                       |

When the adapter anchoring a reference does not provide this facet, the reference is not parsed with any other adapter's syntax.

### `reExportLinking`

Turns re-export routes found while analyzing files into public bindings and resolution steps.

| Member                                  | Contract                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link({ session, packageToWorkspace })` | Returns the public bindings and steps to add. No I/O. Runs after Pass 1 and before any import is resolved, so it may rely only on facts available after Pass 1 and on data stored by `prepare`. |

## Resolving a package import

Your `resolveImports` does not search for the imported name. It asks the indexer, which reads the public bindings of the entries that your `packageResolution` facet returned. The context passed to `resolveImports` provides:

- `workspaces`: every workspace with its name and code root.
- `packageToWorkspace`: the package map.
- `packageEntryFiles(specifier)`: matches the specifier to a known package through your facet and returns the usable entries, or the reason there are none.
- `resolvePackageExport({ specifier, exportedName, spaces, fromFile, localBindingId })`: resolves `exportedName` against the entries and returns either a resolved target or a reason.

`spaces` lists the symbol spaces the import could address, for example `value` and `type` for a plain named import of TypeScript, or only `type` for a type-only import.

A resolved result carries the target's logical id (`targetLogicalId`), the symbol id of its primary declaration (`targetSymbolId`), the entry file that published the name (`entryFile`), the public binding that was followed, and a ready-made `step`. To use it:

1. Put `targetSymbolId` in the `importMap` under the import's local name.
2. Add `entryFile` to `fileImports`.
3. Add `step` to the `steps` you return, so that changes to the target workspace re-resolve this file in later incremental runs.

When the result is unresolved, add a diagnostic and nothing else:

| Reason             | Meaning                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `facet-absent`     | Internal: the adapter has no usable `packageResolution`. Never counted; see `adaptersWithoutPackageResolution`. |
| `package-unknown`  | No workspace declares a package that matches the specifier: an external dependency.                             |
| `no-entry-surface` | The package publishes nothing for the specifier, or none of its entries is an indexed source.                   |
| `not-exported`     | No entry publishes the name. A unique symbol with that name elsewhere is not used.                              |
| `ambiguous`        | Entries publish the name with different targets.                                                                |

Unresolved imports create no relation, no binding target, and no step. The diagnostics are reported in the run result and are never stored in the graph. `importDiagnostics` holds the number of failures (`total`), the exact count per reason (`byReason`), and at most 20 sampled diagnostics per reason (`samples`). `package-unknown` is not a failure: the import names a package that no workspace declares, such as an npm dependency, so it is counted only in `externalPackageImports` and excluded from `total`, `byReason`, and `samples`. An adapter without the facet (or whose facet failed) is not a failure either: it is listed once in `adaptersWithoutPackageResolution` and never counted in `total`, `byReason`, or `samples`.

`resolveImports` also returns `steps` and `diagnostics` arrays. Return empty arrays when there is nothing to report. It may also return `qualifiedTargets`, a map from `qualifiedReferenceKey(fact)` to the target symbol id. An absent map means the adapter resolved no qualified references. `FileAnalysisDraft.qualifiedReferenceFacts` is the optional syntactic evidence (`qualifier.name`, kind `call`, `construct`, or `type`) that `resolveImports` consumes. Adapters that do not emit those facts leave both fields absent.

### Go selectors

A Go import binds a namespace name: an explicit alias, otherwise the `package` clause shared by every indexed entry, otherwise the last path segment. Blank imports and dot imports bind no namespace. Two imports that produce the same namespace name bind neither. `analyzeFile` records a qualified reference for `pkg.Name()` (`call`), `pkg.Name{}` (`construct`, including `pkg.Name[T]{}`), and any other `pkg.Name` type position (`type`), including results, constants, type declarations, and type arguments. `pkg.Fn[T]()` is a call: tree-sitter-go wraps that selector in an `index_expression`. A qualifier is shadowed, and emits no fact, when an enclosing function binds it as a receiver, parameter, or result (those names apply only inside the function body, so a signature type still names the package) or when a `var` (including a grouped spec), `const`, `type`, `:=`, `range` clause, `if`/`for`/`switch` initializer, or type-switch binding declares it earlier in the same block. A use that precedes that declaration is not shadowed. A call or composite literal in a package-level variable initializer uses that variable as its source. `resolveImports` resolves an uppercase name through `resolvePackageExport` (`value` for calls, `type` otherwise) and stores the symbol id in `qualifiedTargets`. The `import:package` step is anchored on the file-scope Namespace binding of that import — the alias or last path segment, even when the chosen namespace is a declared package name or a `/v2` path. When that binding is absent the step is omitted. `buildRelations` emits one `CALLS`, `CONSTRUCTS`, or `USES_TYPE` per source and target, and drops a fact with no source symbol. An unresolved selector is dropped: no relation, no diagnostic, and no guessed target.

### Python re-exports

A module-level `from` import in `__init__.py` or `__init__.pyi` is a re-export route when it names a file in the same top-level package directory as the entry (`<workspace>:<package>` or `<workspace>:src/<package>`). Relative routes go through `relativeImportResolution`. Absolute routes go through `packageResolution.entrySurface` and stay inside that directory, so a sub-package entry may re-export a sibling module. Relative imports (`from .models import User`) and absolute imports that stay in the package (`from acme_auth.models import User`) qualify. An absolute import of another top-level package, a wildcard, a plain `import`, `from . import name`, and an import nested in a function, `try`, or conditional do not. When `__init__.py` and `__init__.pyi` are both indexed, only the source file is linked. `X.py` together with `X/__init__.py` is ambiguous and publishes no route. `reExportLinking` publishes the bound name (the alias when one is written) on the package surface with a `re-export:named` step. A static `__all__` is a module-level `=`, an annotated `=`, or `+=` whose value is a list, a parenthesized tuple, an unparenthesized tuple (`__all__ = "A", "B"`), or `+` of plain string literals. Bytes literals, `.append`, `.extend`, comprehensions, non-literal elements, and a read such as `"X" in __all__` are dynamic and publish no routes. `__all__` never filters declarations. A cycle publishes nothing. A later `import:package` step is returned only when the resolved import still has a retained file-scope local binding.

## Registering an adapter

Adapters are registered with `AdapterRegistry.register(adapter)`, or by passing them in the `adapters` option when creating the code-graph provider. Built-in adapters are registered the same way.

`register` validates the adapter before it changes anything. It throws an `InvalidLanguageAdapterError` (code `INVALID_LANGUAGE_ADAPTER`) and leaves the registry unchanged when:

| Rule                                                        | Example message                                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A core member is missing or is not a function               | `Invalid language adapter [python]: missing required member "analyzeFile" (member "analyzeFile")`                       |
| `languages()` returns no identifier                         | `Invalid language adapter [unknown]: languages() returned no language`                                                  |
| An extension maps to a language the adapter did not declare | `Invalid language adapter [python]: extension ".rs" maps to undeclared language "rust"`                                 |
| A facet is not an object                                    | `Invalid language adapter [python]: facet "packageResolution" must be an object (member "packageResolution")`           |
| A facet lacks a member                                      | `Invalid language adapter [python]: facet "packageResolution" is missing member "entrySurface" (member "entrySurface")` |

The message names the languages the adapter declares, the rule that failed, and the offending member. Fix the member and register again.

Registering an adapter for a language that is already registered **replaces** the earlier adapter for that language: the later registration wins. This lets you substitute a built-in adapter with your own, for example a faster implementation. Replacement is per language:

- Extension mappings that your adapter declares overwrite earlier mappings of the same extension.
- An earlier adapter keeps every language that your adapter does not declare. Replacing only `typescript` leaves the built-in adapter serving `tsx`, `javascript`, and `jsx`.
- An earlier adapter left without any language is no longer consulted by the indexer.
- Registering the same instance again changes nothing.

## Example: a minimal adapter

This adapter supports a made-up language `zig2`. It implements only the core, so its files are indexed but its package imports are not resolved across workspaces.

```ts
import { type LanguageAdapter } from '@specd/code-graph'

export const zig2Adapter: LanguageAdapter = {
  languages: () => ['zig2'],
  extensions: () => ({ '.z2': 'zig2' }),
  resolutionManifests: () => [],
  analyzeFile: (filePath, content, context) => parseZig2(filePath, content, context),
  resolveImports: () => ({ importMap: new Map(), fileImports: [], steps: [], diagnostics: [] }),
  buildRelations: () => [],
}
```

## Example: adding package resolution

The same language declares a `zig2.pkg` manifest with `name=` and `entry=` lines. The adapter adds the `packageResolution` facet and lists the manifest in `resolutionManifests()`.

```ts
import {
  type ImportResolutionContext,
  type LanguageAdapter,
  type PackageResolutionFacet,
} from '@specd/code-graph'

const packageResolution: PackageResolutionFacet = {
  identity: (codeRoot) => readManifest(codeRoot)?.name,
  prepare: ({ session, workspaces }) => {
    const prepared = new Map<string, { workspace: string; entry: string }>()
    for (const workspace of workspaces) {
      const manifest = readManifest(workspace.codeRoot)
      if (manifest !== undefined) {
        prepared.set(manifest.name, { workspace: workspace.name, entry: manifest.entry })
      }
    }
    session.setAdapterState('zig2:packages', prepared)
  },
  matchSpecifier: (specifier, knownPackages) =>
    knownPackages.includes(specifier) ? specifier : undefined,
  entrySurface: ({ packageName, session }) => {
    const owner = session
      .getAdapterState<Map<string, { workspace: string; entry: string }>>('zig2:packages')
      ?.get(packageName)
    if (owner === undefined) return []
    const filePath = `${owner.workspace}:${owner.entry}`
    return [{ filePath, surface: filePath }]
  },
}

export const zig2Adapter: LanguageAdapter = {
  // ...the core members from the previous example, with:
  resolutionManifests: () => ['zig2.pkg'],
  packageResolution,
  resolveImports: (analysis, context: ImportResolutionContext) => {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const steps = []
    const diagnostics = []
    for (const imp of analysis.imports) {
      const binding = analysis.referenceFacts?.localBindings.find(
        (item) => item.localName === imp.localName,
      )
      const result = context.resolvePackageExport({
        specifier: imp.specifier,
        exportedName: imp.originalName,
        spaces: ['value'],
        fromFile: analysis.filePath,
        localBindingId: binding?.id ?? '',
      })
      if (result.status === 'resolved') {
        importMap.set(imp.localName, result.targetSymbolId)
        fileImports.push(result.entryFile)
        // Link the step only when the file has a local binding for the name.
        if (binding !== undefined) steps.push(result.step)
      } else {
        diagnostics.push({
          filePath: analysis.filePath,
          specifier: imp.specifier,
          exportedName: imp.originalName,
          reason: result.reason,
        })
      }
    }
    return { importMap, fileImports, steps, diagnostics }
  },
}
```

No change to the indexer is needed for this language to resolve package imports across workspaces. The code-graph tests prove it with a stub adapter for a made-up language and an unmodified indexer.

## Checklist for a new language

Complete the steps in order. None of them touches the indexer, the index session, the resolver, or the graph stores.

1. Implement the required core: `languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`. In `analyzeFile`, register parser-owned resources in `session.parserResources` immediately after parsing, and return only plain data.
2. Declare `capabilities()` and `declarationPolicy()` truthfully for the semantic categories the adapter can prove. See [Identity and adapter contract](./index.md#identity-and-adapter-contract) for the rules about declaration classification, parser authority, ranges, and hierarchy provenance.
3. Provide each facet the language supports, with every member. Skip a facet when the language has no equivalent concept. Never provide a partial facet.
4. List every manifest your facets read in `resolutionManifests()`, and nothing else.
5. Register the adapter and fix every `INVALID_LANGUAGE_ADAPTER` error.
6. Verify semantic conformance and facet behavior with tests covering:
   - syntax parsing, authoritative AST ranges, and comment attribution;
   - declaration classification and policy;
   - parser resource registration and disposal (resources registered immediately, disposed at epoch closure, no AST instances leaking into instance fields or drafts);
   - manifest search bounded by `repoRoot` with manifests read and parsed once, reporting terminal skips;
   - unresolved imports producing no relation and no heuristic guessing;
   - Pass 2 performing no filesystem reads after preparation;
   - incremental indexing matching a clean rebuild;
   - production importers never resolving to test symbols.
7. Write the adapter specification under `specs/code-graph/<language>-language-adapter/` covering language identity, file extensions, manifest layout rules, facet contracts, and verification scenarios in Given/When/Then format. When adding a built-in adapter, register it in `AdapterRegistry` (`src/infrastructure/tree-sitter/adapter-registry.ts`) and add it to the built-in manifests table in this guide.
