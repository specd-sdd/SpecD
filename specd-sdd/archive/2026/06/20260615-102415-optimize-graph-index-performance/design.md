# Design: optimize-graph-index-performance

## Non-goals

- Changing the persisted graph-store schema in Ladybug or SQLite.
- Adding new persisted relation types beyond the existing `IMPORTS`, `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`.
- Retaining ASTs, tree-sitter nodes, or full parse trees across indexing phases.
- Introducing runtime code execution, speculative whole-program inference, or filesystem probing during relation extraction.
- Making the adapter migration backwards-compatible with the old fragmented extraction contract. All built-in adapters move to the new contract in the same change.

## Affected areas

- `IndexCodeGraph` in `packages/code-graph/src/application/use-cases/index-code-graph.ts`
  Change: replace the current fragmented pass pipeline (`extractSymbols*`, `extractImportedNames`, `extractBindingFacts`, `extractCallFacts`, `extractRelations`) with a session-backed pipeline where each file is analyzed once and the resulting compact facts are reused in Pass 2.
  Callers: 4 direct, 5 indirect, 19 transitive · Risk: CRITICAL
  Note: this is the main indexing entry point used by `CodeGraphProvider`, CLI graph commands, project status graph loading, and code-graph integration tests.

- `LanguageAdapter` in `packages/code-graph/src/domain/value-objects/language-adapter.ts`
  Change: replace the fragmented extraction interface with a unified per-file analysis contract and a relation-building contract that operate on a shared index session context.
  Callers: 11 direct, 9 indirect, 10 transitive · Risk: CRITICAL
  Note: all built-in adapters (`TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, `PhpLanguageAdapter`), `AdapterRegistry`, and related tests must be updated in the same implementation window.

- `SymbolIndex` in `packages/code-graph/src/application/use-cases/index-code-graph.ts`
  Change: demote `SymbolIndex` from the main cross-pass runtime structure to an implementation detail of a broader `IndexSession`, or remove it entirely if its responsibilities are fully absorbed.
  Callers: 6 direct, 3 indirect, 4 transitive · Risk: HIGH
  Note: existing tests focused on `findByFilePrefix`, `findByName`, and file grouping must be rewritten around the new session behavior rather than the old class shape.

- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
  Change: implement the new unified adapter contract and emit a complete `FileAnalysisDraft` in one analysis pass per file.
  Callers: via `AdapterRegistry` and `createCodeGraphProvider` · Risk: HIGH
  Note: TypeScript/JS remains the lowest-risk first-class adapter and acts as the reference implementation for the new contract.

- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`
  Change: implement the new unified adapter contract and move any deterministic import, binding, and call extraction into the single-file analysis result.
  Callers: via `AdapterRegistry` and `createCodeGraphProvider` · Risk: HIGH

- `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`
  Change: implement the new unified adapter contract and keep package/import resolution deterministic under the shared session context.
  Callers: via `AdapterRegistry` and `createCodeGraphProvider` · Risk: HIGH

- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
  Change: implement the new unified adapter contract, remove repeated extraction work, keep dynamic loader handling deterministic, and consume the shared session instead of rebuilding per-call lookup state.
  Callers: via `AdapterRegistry` and `createCodeGraphProvider` · Risk: CRITICAL
  Note: this is the highest-risk adapter because the motivating performance regression comes from PHP-heavy repositories such as `iccms`.

- `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`
  Change: no semantic change to language selection, but the registry must compile against the new `LanguageAdapter` shape and continue serving mixed-language projects by extension.
  Callers: `createCodeGraphProvider`, tests · Risk: MEDIUM

- `packages/code-graph/src/composition/create-code-graph-provider.ts`
  Change: keep built-in adapter registration intact while compiling against the new adapter contract.
  Callers: code-graph provider construction and CLI graph commands · Risk: MEDIUM

- `packages/code-graph/src/application/use-cases/discover-files.ts`
  Change: preserve the binary filtering work already in scope; the new design still depends on discovery excluding obvious binary and non-source inputs before analysis begins.
  Callers: `IndexCodeGraph.execute()` · Risk: MEDIUM

- `packages/code-graph/src/domain/services/scoped-binding-environment.ts`
  Change: no new runtime responsibility, but the service must consume the facts persisted in `FileAnalysis` instead of facts regenerated ad hoc later in Pass 2.
  Callers: `IndexCodeGraph` scoped dependency resolution path · Risk: HIGH

- `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`
  Change: rewrite tests to assert the new one-analysis-per-file pipeline, session-backed relation resolution, preserved mixed-language behavior, and bounded-memory chunk flow.
  Risk: HIGH

- `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`
- `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`
  Change: update all built-in adapter tests to the new contract and verify each adapter emits a full `FileAnalysisDraft` without requiring follow-up extraction calls.
  Risk: HIGH

- `packages/cli/src/commands/graph/index-graph.ts`, `packages/cli/src/commands/graph/impact.ts`, `packages/cli/src/commands/graph/search.ts`, `packages/cli/src/commands/graph/stats.ts`, `packages/cli/src/commands/project/status.ts`
  Change: no expected behavioral redesign at the CLI contract level, but these callers exercise `IndexCodeGraph` and must continue to work unchanged after the internal refactor.
  Callers: user-facing graph commands and status views · Risk: MEDIUM

- `docs/adr/`
  Change: add an ADR documenting the shift from fragmented per-step adapter extraction to a shared `IndexSession` + unified `FileAnalysis` architecture, because this is a significant architectural decision that constrains future adapter work and memory behavior.
  Risk: MEDIUM

## New constructs

- `IndexSession` in `packages/code-graph/src/domain/value-objects/index-session.ts`
  Shape:

  ```ts
  export interface IndexSession {
    registerFile(input: RegisterFileInput): number
    registerAnalysis(input: RegisterAnalysisInput): FileAnalysis
    getFileId(filePath: string): number | undefined
    getAnalysis(filePath: string): FileAnalysis | undefined
    getAllFilePaths(): ReadonlySet<string>
    findSymbolsByFile(filePath: string): readonly SymbolNode[]
    findSymbolsByName(name: string, filePrefix?: string): readonly SymbolNode[]
    findSymbolByQualifiedName(qualifiedName: string): string | undefined
    findSpecsBySymbol(symbolId: string): readonly SpecNode[]
    findSymbolsBySpec(specId: string): readonly SymbolNode[]
    registerDocument(document: DocumentNode): void
    registerSpec(spec: SpecNode): void
    addRelations(relations: readonly Relation[]): void
    getRelations(): readonly Relation[]
    getAdapterState<T>(adapterKey: string): T | undefined
    setAdapterState<T>(adapterKey: string, state: T): void
  }
  ```

  Responsibility: own the shared in-memory indexing state for a single `IndexCodeGraph.execute()` run.
  Relationships: created by `IndexCodeGraph`, passed read/write to adapters through typed contexts, consumed by shared scoped binding resolution, never persisted directly.

- `InMemoryIndexSession` in `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`
  Shape:

  ```ts
  export class InMemoryIndexSession implements IndexSession {
    constructor()
    registerFile(input: RegisterFileInput): number
    registerAnalysis(input: RegisterAnalysisInput): FileAnalysis
    getFileId(filePath: string): number | undefined
    getAnalysis(filePath: string): FileAnalysis | undefined
    getAllFilePaths(): ReadonlySet<string>
    findSymbolsByFile(filePath: string): readonly SymbolNode[]
    findSymbolsByName(name: string, filePrefix?: string): readonly SymbolNode[]
    findSymbolByQualifiedName(qualifiedName: string): string | undefined
    findSpecsBySymbol(symbolId: string): readonly SpecNode[]
    findSymbolsBySpec(specId: string): readonly SymbolNode[]
    registerDocument(document: DocumentNode): void
    registerSpec(spec: SpecNode): void
    addRelations(relations: readonly Relation[]): void
    getRelations(): readonly Relation[]
    getAdapterState<T>(adapterKey: string): T | undefined
    setAdapterState<T>(adapterKey: string, state: T): void
  }
  ```

  Responsibility: concrete O(1)-biased storage for file analyses, canonical file paths, file IDs, symbol lookups, spec/document cross-lookups, qualified-name lookups, and deduplicated relations for one indexing run.
  Relationships: application-layer helper used only by `IndexCodeGraph`; it must not leak as a public persistence API.

- `FileAnalysisDraft` and `FileAnalysis` in `packages/code-graph/src/domain/value-objects/file-analysis.ts`
  Shape:

  ```ts
  export interface FileAnalysisDraft {
    readonly language: string
    readonly namespace?: string
    readonly fileNode?: FileNode
    readonly documentNode?: DocumentNode
    readonly symbols: readonly SymbolNode[]
    readonly imports: readonly ImportDeclaration[]
    readonly bindingFacts: readonly BindingFact[]
    readonly callFacts: readonly CallFact[]
    readonly parserState?: ParserState
  }

  export interface FileAnalysis extends FileAnalysisDraft {
    readonly fileId: number
    readonly filePath: string
    readonly contentHash: string
    readonly workspace: string
    readonly configRelativePath: string
  }
  ```

  Responsibility: represent the complete compact result of one adapter analysis pass over one file.
  Relationships: emitted by every adapter, registered in `IndexSession`, reused by Pass 2 relation resolution and shared scoped binding logic.

- `ParserState` in `packages/code-graph/src/domain/value-objects/file-analysis.ts`
  Shape:

  ```ts
  export interface ParserState {
    readonly kind: string
  }
  ```

  Responsibility: allow adapters to preserve small, compact, per-file parser-specific runtime facts between Pass 1 and Pass 2.
  Relationships: optional field on `FileAnalysis`; no adapter may store ASTs, tree nodes, or unbounded text blobs here.

- `AdapterSessionState` in `packages/code-graph/src/domain/value-objects/index-session.ts`
  Shape:

  ```ts
  export interface AdapterSessionState {
    readonly kind: string
  }
  ```

  Responsibility: allow adapters to share small, deterministic run-scoped caches across files in the same indexing run.
  Relationships: stored behind `IndexSession.getAdapterState()` / `setAdapterState()`; distinct from per-file `ParserState`; no adapter may store ASTs, tree nodes, or unbounded text blobs here.

- `AdapterAnalyzeContext` in `packages/code-graph/src/domain/value-objects/language-adapter.ts`
  Shape:

  ```ts
  export interface AdapterAnalyzeContext {
    readonly session: IndexSession
    readonly workspaceName: string
    readonly codeRoot?: string
    readonly repoRoot?: string
  }
  ```

  Responsibility: expose the shared run context available while analyzing one file.
  Relationships: passed from `IndexCodeGraph` to `LanguageAdapter.analyzeFile`.

- `ImportResolutionContext` in `packages/code-graph/src/domain/value-objects/language-adapter.ts`
  Shape:

  ```ts
  export interface ImportResolutionContext {
    readonly session: IndexSession
    readonly qualifiedNames: ReadonlyMap<string, string>
    readonly packageToWorkspace: ReadonlyMap<string, string>
    readonly codeRoot?: string
    readonly repoRoot?: string
  }
  ```

  Responsibility: provide the shared lookup inputs required to resolve `ImportDeclaration[]` into symbol ids or file imports.
  Relationships: passed from `IndexCodeGraph` to `LanguageAdapter.resolveImports`.

- `RelationBuildContext` in `packages/code-graph/src/domain/value-objects/language-adapter.ts`
  Shape:

  ```ts
  export interface RelationBuildContext {
    readonly session: IndexSession
    readonly resolvedImports: ResolvedImports
    readonly codeRoot?: string
    readonly repoRoot?: string
  }
  ```

  Responsibility: provide the resolved import data and shared run-scoped lookups required to build deterministic relations from an existing `FileAnalysis`.
  Relationships: passed from `IndexCodeGraph` to `LanguageAdapter.buildRelations`.

- `ResolvedImports` in `packages/code-graph/src/domain/value-objects/language-adapter.ts`
  Shape:
  ```ts
  export interface ResolvedImports {
    readonly importMap: ReadonlyMap<string, string>
    readonly fileImports: readonly string[]
  }
  ```
  Responsibility: normalize Pass 2 import-resolution output across all languages.
  Relationships: consumed by `IndexCodeGraph` and `LanguageAdapter.buildRelations`.

## Approach

The implementation keeps the existing two-pass indexer architecture, binary discovery filtering, and mixed-language adapter registry, but it changes the unit of work from “many extraction methods over the same file” to “one complete `FileAnalysisDraft` per file”.

The new execution flow is:

1. **Discovery and diff remain intact**
   `discoverFiles` still finds workspace files and project-global documents, applies built-in binary filtering, honors graph config, and computes the diff against the store. This change does not remove or dilute the binary filtering already added to the specs.

2. **Pass 1 becomes complete file analysis registration**
   For each changed code file:
   - `IndexCodeGraph` resolves the adapter by extension.
   - The adapter is called once through `analyzeFile(filePath, content, context)`.
   - The returned `FileAnalysisDraft` contains everything that later phases need: symbols, imports, namespace, binding facts, call facts, and optional compact parser state.
   - `IndexCodeGraph` registers the file and then registers that draft into `InMemoryIndexSession`, which builds the shared indices:
     - file path -> file id
     - file path set
     - file -> symbols
     - symbol name -> symbols
     - qualified name -> symbol id
     - document/spec and symbol/spec cross-lookups
     - optional run-scoped adapter cache state
       For unchanged files already present in the graph, `IndexCodeGraph` still hydrates enough symbol data from the store to satisfy cross-file lookups, but it does not synthesize fresh `FileAnalysis` objects for unchanged files unless a later phase truly needs them.

3. **Pass 2 resolves imports without re-parsing**
   For each analyzed file:
   - `IndexCodeGraph` loads its `FileAnalysis`.
   - `LanguageAdapter.resolveImports(analysis, context)` resolves the previously extracted imports into `importMap` and `fileImports`.
   - The resolver must use the shared session and shared maps instead of rebuilding ad hoc sets or rescanning workspace symbols.
   - PHP path existence checks use `IndexSession.getAllFilePaths()`; no adapter may rebuild `Set<string>` from symbol arrays per match.

4. **Pass 2 builds relations from stored facts**
   - Shared scoped binding resolution uses `analysis.bindingFacts`, `analysis.callFacts`, `analysis.symbols`, and the resolved import data.
   - Adapter-specific relation building runs through `buildRelations(analysis, context)` and may consume `analysis.parserState`.
   - Relations are added back into `IndexSession` with deduplication by `(source, target, type)`.
   - Self-relations remain forbidden.

5. **Chunk memory remains bounded**
   The session is long-lived for the run, but only compact facts survive between phases. Raw content and parser-local temporaries remain eligible for garbage collection after each chunk. The implementation must not retain ASTs, full parse trees, or unbounded text buffers in per-file `ParserState` or run-scoped `AdapterSessionState`.

6. **Mixed-language behavior stays unchanged at the user level**
   The adapter registry continues to map file extensions to adapters. A mixed repository still indexes TypeScript, JavaScript, Python, Go, and PHP together because every adapter emits the same `FileAnalysisDraft` shape and the session provides the common lookup layer that Pass 2 requires.

7. **The current PHP-specific regression is addressed as a consequence, not as the primary abstraction**
   The immediate PHP fix is no longer “patch `selectCandidatePath` only”. Instead, the root cause is removed:
   - file analysis happens once
   - import-related facts are reused
   - path existence checks use a stable shared file set
   - adapter-local temporary maps stop being rebuilt for every resolution site

## Key decisions

- **Decision**: keep the two-pass indexer architecture, but make Pass 1 produce a complete reusable `FileAnalysis`.
  Rationale: the specs already require a two-pass indexer so that all symbols exist before relation resolution, and that architecture still works well for mixed-language indexing. The problem is repeated extraction work inside that structure, not the existence of two passes.
  Alternatives rejected: collapsing indexing into a single pass. Rejected because it would weaken cross-file and cross-workspace relation determinism and would fight the existing indexer spec rather than fixing the actual hot path.

- **Decision**: introduce a shared `IndexSession` for the run instead of adding more one-off maps inside `IndexCodeGraph`.
  Rationale: the current architecture already has several partial shared caches (`SymbolIndex`, `qualifiedNames`, `filePaths`, `workspaceSymbolsCache`). A dedicated session makes the shared runtime contract explicit and reusable by all adapters.
  Alternatives rejected: continue patching `SymbolIndex` and adapter-local caches in place. Rejected because that keeps the architecture fragmented and does not address repeated extraction or GC churn consistently.

- **Decision**: adapters emit compact facts, not ASTs.
  Rationale: the goal is to reduce recomputation and short-lived allocations without inflating old-generation memory. Compact facts provide the needed reuse without retaining heavyweight syntax structures.
  Alternatives rejected: cache parse trees across phases. Rejected because it increases retained heap and GC pressure on large repositories, which conflicts with the motivating memory problem.

- **Decision**: break the old `LanguageAdapter` contract and migrate all built-in adapters together.
  Rationale: a compatibility layer would keep the old fragmented APIs alive and perpetuate duplicate extraction logic. The user explicitly wants a clean pivot in the same change rather than a partial bridge.
  Alternatives rejected: optional `analyzeFile()` plus legacy methods. Rejected because it increases complexity, preserves old hot paths, and weakens the architectural change.

- **Decision**: keep persisted graph identities as strings, even if the session uses compact numeric ordinals internally.
  Rationale: graph-store schema, traversal logic, CLI output, and existing relation semantics all depend on canonical string identities (`filePath`, `symbol.id`, `specId`). Internal numeric indexing may be used purely as a runtime optimization, but it must not leak into the persisted graph contract.
  Alternatives rejected: replace canonical persisted ids with numeric ids. Rejected because it would ripple into graph-store specs, traversal behavior, CLI expectations, and far more packages than this change is meant to affect.

- **Decision**: add an ADR documenting the `IndexSession` architecture.
  Rationale: this is a lasting architectural constraint on how all future adapters must integrate with the code graph.
  Alternatives rejected: leaving the rationale only in change artifacts. Rejected because future adapter maintainers need a durable repository-level decision record in `docs/adr/`.

## Trade-offs

- `[Medium]` A breaking adapter-contract change touches every built-in adapter and many tests at once.
  Mitigation: migrate all built-in adapters in the same implementation slice, start with TypeScript as the reference implementation, and keep the session API deliberately small.

- `[High]` A shared session can become an uncontrolled “god object”.
  Mitigation: expose only typed APIs on `IndexSession`; do not expose raw mutable maps to adapters; keep parser-specific state namespaced by adapter key.

- `[Medium]` If too many compact facts are retained indefinitely, the session can still increase long-lived heap size.
  Mitigation: keep `FileAnalysis` limited to facts needed in Pass 2, never store ASTs, and avoid retaining raw content beyond the phase/chunk that needs it.

- `[Medium]` Hydrating unchanged files from the store still requires careful handling so cross-file lookups remain correct.
  Mitigation: keep the existing symbol hydration behavior for unchanged files, but do not invent synthetic `FileAnalysis` data that was never extracted in this run unless a concrete use case needs it.

## Spec impact

### `code-graph:indexer`

- Direct dependents: `cli:graph-index`
- Indirect/transitive dependent specs surfaced by graph impact: `cli:graph-impact`, `cli:graph-search`, `cli:graph-stats`, `code-graph:composition`
- Assessment:
  - `cli:graph-index`, `cli:graph-impact`, `cli:graph-search`, and `cli:graph-stats` remain satisfied because the public CLI behavior does not change; only internal indexing architecture changes.
  - `code-graph:composition` remains satisfied because `createCodeGraphProvider` still registers built-in adapters and returns the same provider surface.
  - No additional spec needs to be added to change scope from the `indexer` ripple.

### `code-graph:language-adapter`

- Direct dependents: `code-graph:indexer`, `code-graph:composition`
- Indirect/transitive dependent specs surfaced by graph impact: `cli:graph-index`, `cli:graph-impact`, `cli:graph-search`, `cli:graph-stats`
- Assessment:
  - `code-graph:indexer` is already in scope and must be updated in lockstep.
  - `code-graph:composition` remains semantically satisfied because built-in adapter registration and extension-based selection continue unchanged.
  - CLI specs remain satisfied because they depend on graph capabilities, not on the internal adapter method split.
  - No additional spec needs scope expansion from the `language-adapter` ripple.

### `code-graph:symbol-model`

- Direct dependents surfaced by graph impact: `code-graph:indexer`, `code-graph:graph-store`, `code-graph:document-model`, `code-graph:ladybug-graph-store`, `code-graph:sqlite-graph-store`, `code-graph:traversal`, `code-graph:composition`, `cli:change-implementation`
- Indirect dependents surfaced by graph impact: `cli:graph-index`, `cli:graph-impact`, `cli:graph-search`, `cli:graph-stats`
- Assessment:
  - `code-graph:graph-store`, `code-graph:ladybug-graph-store`, and `code-graph:sqlite-graph-store` remain satisfied because persisted node and relation identities do not change.
  - `code-graph:document-model` remains satisfied because documents still use the same canonical path identity and are not re-architected.
  - `code-graph:traversal` remains satisfied because relation types and persisted ids remain unchanged.
  - `cli:change-implementation` and graph CLI specs remain satisfied because symbol-level traceability output semantics do not change.
  - No additional spec must be added to the change scope as long as the implementation keeps the new session as an internal runtime structure and does not alter persisted graph contracts.

## Dependency map

```mermaid
graph LR
  A[IndexCodeGraph.execute] --> B[IndexSession]
  A --> C[LanguageAdapter.analyzeFile]
  A --> D[LanguageAdapter.resolveImports]
  A --> E[LanguageAdapter.buildRelations]
  C --> F[FileAnalysis]
  F --> B
  D --> B
  E --> B
  B --> G[Scoped Binding Resolution]
  G --> H[Relation[]]
  E --> H
  H --> I[GraphStore.bulkLoad]
  J[TypeScript/Python/Go/PHP Adapters] --> C
  J --> D
  J --> E
  K[code-graph:language-adapter] --> L[code-graph:indexer]
  M[code-graph:symbol-model] --> K
  M --> L
```

```
┌────────────────────────────┐
│ IndexCodeGraph.execute()   │  [CRITICAL]
└──────────────┬─────────────┘
               │ creates / owns
               ▼
      ┌──────────────────────┐
      │ InMemoryIndexSession │
      │ file paths           │
      │ symbols by file/name │
      │ qualified names      │
      │ parser state         │
      └───────┬───────┬──────┘
              │       │
   reads/writes│       │shared lookup
              ▼       ▼
┌──────────────────┐  ┌──────────────────────┐
│ analyzeFile()    │  │ resolveImports()     │
│ all adapters     │  │ all adapters         │
└────────┬─────────┘  └──────────┬───────────┘
         │ emits                  │ resolves
         ▼                        ▼
     ┌────────────────────────────────────┐
     │ FileAnalysis                       │
     │ symbols/imports/facts/parserState │
     └──────────────┬─────────────────────┘
                    │ reused by
                    ▼
          ┌────────────────────────┐
          │ buildRelations()       │
          │ adapters + shared      │
          │ scoped binding logic   │
          └────────────┬───────────┘
                       │
                       ▼
               ┌───────────────┐
               │ GraphStore    │
               │ bulkLoad()    │
               └───────────────┘

Specs:
┌────────────────────────┐ depends on ┌───────────────────────┐
│ code-graph:indexer     │───────────▶│ code-graph:language-  │
└────────────────────────┘            │ adapter               │
         ▲                            └──────────┬────────────┘
         │ depends on                            │ depends on
         │                                       ▼
         └────────────────────────────────┌────────────────────┐
                                          │ code-graph:symbol-│
                                          │ model             │
                                          └────────────────────┘
```

## Migration / Rollback

- There is no safe partial rollout for the adapter contract inside this repository. The implementation must migrate all built-in adapters and the indexer together in one coherent change.
- Rollback is source-level only: revert the implementing commit(s) for this change. There is no graph-store schema migration to reverse.
- Because persisted graph identities stay unchanged, re-running `graph index` after rollback rebuilds the graph using the previous extraction architecture without requiring storage cleanup beyond the normal reindex path.

## Testing

**Automated tests**

- Update `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`
  - Cover the complete new pipeline: one analysis per file, preserved two-pass relation resolution, mixed-language indexing, and stable incremental behavior.
  - Map verify scenarios:
    - full pipeline orchestration
    - unchanged-file skipping under matching fingerprint
    - full rebuild on fingerprint mismatch
    - combined namespace and symbol extraction fast path
    - language adapters receiving the full file-path set
    - progress callback behavior
    - debug timing logging

- Replace `packages/code-graph/test/application/use-cases/symbol-index.spec.ts`
  - Re-scope it to `InMemoryIndexSession` behavior:
    - file lookup
    - symbol name lookup
    - qualified-name lookup
    - relation deduplication
    - no linear symbol rescans in hot-path APIs

- Update `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`
  - Assert `analyzeFile()` emits symbols, imports, binding facts, call facts, and namespace in one contract.
  - Cover deterministic dynamic imports, CommonJS imports, constructor facts, and member-call facts.

- Update `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`
  - Assert `analyzeFile()` covers import extraction, deterministic dynamic imports, and typed/bound call facts under the new contract.

- Update `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`
  - Assert `analyzeFile()` covers grouped/aliased imports and selector-call facts under the new contract.

- Update `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`
  - Assert `analyzeFile()` emits all reusable PHP facts once.
  - Cover:
    - `require/include` extraction
    - loader-based dependency facts
    - loaded-instance call facts
    - use of the shared file set instead of rebuilding per-call path sets
    - no AST retention in parser state

- Update `packages/code-graph/test/composition/code-graph-provider.spec.ts`
  - Assert built-in adapter registration still supports mixed-language repositories with the new adapter interface.

- Update CLI graph command tests only where needed to confirm no user-facing regression in:
  - `packages/cli/test/commands/graph-index.spec.ts`
  - `packages/cli/test/commands/graph-impact.spec.ts`
  - `packages/cli/test/commands/graph-search.spec.ts`
  - `packages/cli/test/commands/graph-stats.spec.ts`

**Manual / E2E verification**

- Run `pnpm --filter @specd/code-graph test`
- Run `pnpm --filter @specd/code-graph lint`
- Run `pnpm --filter @specd/code-graph typecheck`
- Run `pnpm --filter @specd/cli test -- graph`
- Run `node packages/cli/dist/index.js graph index --config ../iccms/specd.yaml --format toon`
  - Expect completion without the previous pathological slowdown around Pass 2.
  - Expect PHP-heavy indexing to reuse shared session lookups rather than rebuilding large temporary lookup structures per file.
- Run `node packages/cli/dist/index.js graph stats --config ../iccms/specd.yaml --format toon`
  - Expect a healthy graph with mixed-language coverage preserved.

**Documentation**

- Add an ADR under `docs/adr/` describing the `IndexSession` + unified adapter analysis architecture and its memory/GC rationale.
- Update `packages/code-graph/README.md` if it documents the old extraction model or adapter surface in a way that would mislead future adapter implementers.

## Open questions

- None. The design intentionally removes the previous ambiguity around “small PHP optimization vs broader indexer redesign” by making the shared session architecture the canonical implementation target.
