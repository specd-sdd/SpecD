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

1. **Package map.** Before any file is analyzed, `packageResolution.identity` names the package that each workspace's manifest declares. The first adapter that returns an identity for a workspace wins. The indexer builds a `package name → workspace` map from those answers.
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

| Member                                                         | Contract                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity(codeRoot, repoRoot?)`                                | Returns the package identity that the manifest at or above `codeRoot` declares (searching no higher than `repoRoot` when given), or `undefined`. May read the filesystem.                                               |
| `prepare({ session, workspaces, repoRoot? })`                  | Stores the facts the adapter needs for all configured workspaces once per run as compact, immutable data in the session. May read the filesystem and may be a no-op. Pass 2 never calls it again.                       |
| `matchSpecifier(specifier, knownPackages, session)`            | Returns which known package a non-relative specifier refers to, or `undefined`. Depends only on its arguments and the data `prepare` stored. No I/O. Use the session when the specifier is not named after its package. |
| `entrySurface({ specifier, packageName, workspace, session })` | Returns the ordered entries through which the package publishes the specifier. Each entry has a workspace-prefixed `filePath` and the public `surface` id under which that file's exports are stored. No I/O.           |

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

Unresolved imports create no relation, no binding target, and no step. The diagnostics are reported in the run result and are never stored in the graph. `importDiagnostics` holds the number of failures (`total`), the exact count per reason (`byReason`), and at most 20 sampled diagnostics per reason (`samples`). `package-unknown` is not a failure: the import names a package that no workspace declares, such as an npm dependency, so it is counted only in `externalPackageImports`. An adapter without the facet (or whose facet failed) is not a failure either: it is listed once in `adaptersWithoutPackageResolution` and never counted in `total`, `byReason`, or `samples`.

`resolveImports` also returns `steps` and `diagnostics` arrays. Return empty arrays when there is nothing to report.

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

1. Implement the required core: `languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`.
2. Declare `capabilities()` and `declarationPolicy()` truthfully for the semantic categories the adapter can prove. See [Identity and adapter contract](./index.md#identity-and-adapter-contract) for the rules about declaration classification, parser authority, ranges, and hierarchy provenance.
3. Provide each facet the language supports, with every member. Skip a facet when the language has no equivalent concept. Never provide a partial facet.
4. List every manifest your facets read in `resolutionManifests()`, and nothing else.
5. Register the adapter and fix every `INVALID_LANGUAGE_ADAPTER` error.
6. Pass the cross-language semantic conformance suite and the facet scenarios in the specification's verification. Useful extra tests: unresolved imports producing no relation, Pass 2 performing no filesystem reads after preparation, and incremental indexing equal to a clean rebuild.
7. Write the adapter's specific spec and add it to the list of built-in adapter specs when it is built in.
