# @specd/code-graph

Code graph indexing and analysis library for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Parses source files across
multiple languages, extracts symbols and relationships, and stores the result in
a persistent graph database for impact analysis, traversal, and full-text search.

## Key features

- **Multi-language indexing** — TypeScript, Go, Python, and PHP via ast-grep
- **Symbol extraction** — functions, classes, methods, variables, types, interfaces, and enums
- **Relationship tracking** — imports, exports, calls, construction, type usage, hierarchy, defines, depends_on, covers
- **Incremental updates** — content-hash diffing skips unchanged files on re-index
- **Impact analysis** — blast-radius queries by symbol or file, with upstream/downstream direction
- **Hotspot detection** — ranks symbols by how many dependents they have
- **Change detection** — given a list of changed files, returns all transitively affected symbols
- **Full-text search** — BM25-ranked search across symbols and spec documents
- **Persistent storage** — backed by a registry-selected `GraphStore`, with `sqlite` as the built-in default and `ladybug` still available by explicit backend id
- **Workspace-aware** — paths and IDs are prefixed with workspace name for cross-workspace uniqueness

## Domain model

The graph has three node types:

| Node         | Key fields                                                           | Description                                         |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------- |
| `FileNode`   | `path`, `language`, `contentHash`, `workspace`                       | A source file. `path` is `workspace:relative/path`. |
| `SymbolNode` | `id`, `name`, `kind`, `filePath`, `line`, `column`                   | A declared symbol within a file.                    |
| `SpecNode`   | `specId`, `path`, `title`, `description`, `contentHash`, `dependsOn` | A specd spec document.                              |

Relations between nodes are typed by `RelationType`: `IMPORTS`, `EXPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `DEFINES`, `DEPENDS_ON`, `COVERS`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`.

`CONSTRUCTS` records deterministic instantiation or constructor-like dependencies. `USES_TYPE` records static type dependencies in signatures, annotations, fields, or deterministic binding declarations. Both are included in traversal, impact analysis, and hotspot scoring alongside `CALLS`.

Symbol kinds are: `function`, `class`, `method`, `variable`, `type`, `interface`, `enum`.

## Architecture

```
createCodeGraphProvider(config)
  └─ CodeGraphProvider          ← public facade (index, query, traverse, analyze)
       ├─ IndexCodeGraph         ← application use case (discover → diff → extract → store)
       │    ├─ AdapterRegistry   ← routes files to the right language adapter
       │    │    ├─ TypeScriptLanguageAdapter
       │    │    ├─ GoLanguageAdapter
       │    │    ├─ PythonLanguageAdapter
       │    │    └─ PhpLanguageAdapter
       │    └─ GraphStore (port) ← implemented by SQLiteGraphStore or LadybugGraphStore
       └─ domain services        ← getUpstream, getDownstream, analyzeImpact, computeHotspots, …
```

Language adapters implement the `LanguageAdapter` interface and can be registered
externally for additional language support.

Built-in TypeScript/TSX/JavaScript/JSX, Python, Go, and PHP adapters also emit
deterministic binding and call facts for shared scoped resolution. These facts
cover conservative static cases such as constructor injection, typed parameters,
typed properties, literal dynamic imports, package selector calls, and
constructor-like expressions. Runtime-only values, reflection, service locator
ids, monkey-patching, and non-literal dynamic expressions are intentionally
dropped rather than guessed.

Custom adapters can keep implementing the original required methods. The scoped
binding extension points are optional:

```ts
extractBindingFacts?(filePath, content, symbols, imports)
extractCallFacts?(filePath, content, symbols)
```

The shared indexer builds a scoped binding environment from these facts and the
in-memory symbol index, then emits deterministic `CALLS`, `CONSTRUCTS`, and
`USES_TYPE` relations without adding language-specific resolution rules to
`IndexCodeGraph`.

## Usage

```ts
import { createCodeGraphProvider } from '@specd/code-graph'

const graph = createCodeGraphProvider(specdConfig)
await graph.open()

// Index a workspace
const result = await graph.index({
  workspaces: [{ name: 'core', codeRoot: 'packages/core/src', specRoot: 'specs/core' }],
  exclude: ['**/*.spec.ts'],
})

// Query
const symbols = await graph.findSymbols({ name: 'createChange', kind: 'function' })

// Impact analysis
const impact = await graph.analyzeImpact(symbols[0].id, 'downstream', 3)

// Hotspots
const hotspots = await graph.getHotspots({ limit: 10 })

await graph.close()
```

To force the legacy backend explicitly:

```ts
const legacyGraph = createCodeGraphProvider(specdConfig, {
  graphStoreId: 'ladybug',
})
```

Pass a `SpecdConfig` (the standard specd configuration object) to
`createCodeGraphProvider` and it derives the storage path from `config.configPath`.

For the default project layout this means:

- graph backend files under `.specd/config/graph`
- graph staging and scratch files under `.specd/config/tmp`

Backends are selected internally by id at composition time:

- default built-in backend: `sqlite`
- alternate built-in backend: `ladybug`
- additive custom backends can be registered with `graphStoreFactories`

## Role in specd

`@specd/code-graph` is used by the MCP server and CLI to answer questions about
code structure and spec coverage. It indexes both source files and spec documents
so that tools can surface which specs cover which code, which symbols are at risk
when a file changes, and which parts of the codebase change most frequently.

The package depends on `@specd/core` for configuration types and is otherwise
self-contained. It does not depend on `@specd/cli` or `@specd/mcp`.
