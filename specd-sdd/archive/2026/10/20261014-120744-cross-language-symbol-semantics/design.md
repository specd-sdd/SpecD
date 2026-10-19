# Design: cross-language-symbol-semantics

## Non-goals

- Do not remove local variables, parameters, aliases, closures, or other lexical evidence from `SymbolNode`, `BindingFact`, `CallFact`, source search, or navigation APIs.
- Do not replace physical dependency relations with a materialized logical dependency graph. `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` remain declaration-to-declaration evidence.
- Do not make dynamic dispatch, reflection, PHP service containers, Python runtime monkey-patching, TypeScript type inference, or unsupported build-system behavior appear resolved.
- Do not preserve identity across a semantic rename, owner change, workspace change, or canonical surface change. Those operations create a new logical identity.
- Do not infer overload or declaration merging from equal text, equal `SymbolKind`, or source proximity. Only language-proven grouping is allowed.
- Do not change physical `getSymbol`, `findSymbols`, or `getSymbolsByIds` into semantic APIs.
- Do not delete every regular expression indiscriminately. Regex remains valid for declared auxiliary manifests and for tokenizing text already bounded by an authoritative parser node; it cannot rediscover source structure from whole-file text.

## Affected areas

Graph inspection was refreshed immediately before this design. The identity model file has 109 direct, 80 indirect, and 31 transitive dependents across 54 production files; the adapter contract has 20 direct, 12 indirect, and 2 transitive dependents across 16 production files. The exact 36-file planned production surface reports **CRITICAL** risk with 1,211 direct, 716 indirect, and 239 transitive dependents across 94 affected production files; 343 test files are omitted from the source-only result. The CLI endpoint alone is MEDIUM risk, but it consumes SDK and provider contracts that are HIGH/CRITICAL. The implementation must be coherent across all layers in one change.

### Domain identity and adapter contracts

- `packages/code-graph/src/domain/value-objects/symbol-reference.ts`
  - Extend `DeclarationOccurrence` with required `form: DeclarationOccurrenceForm` and keep `logicalId`, `symbolId`, `location`, and `kind`.
  - Add the discriminated resolution and impact target types defined under “New constructs”.
  - Change `SymbolResolutionResult` from a nullable logical-only `target` to an explicit `resolvedTarget` union while retaining deprecated `target: LogicalSymbol | null` as a read-only compatibility projection for one release cycle.
  - Add `declarationSymbolId` and `position` to `ResolveSymbolReferenceInput`. They are exact physical selectors; they cannot be combined with each other or with `logicalId`.
  - `createLogicalSymbol` keeps the existing location-independent ID components. Declaration form is never encoded in `LogicalSymbol.id` or `MemberSemantics`.
  - Risk: CRITICAL because this file reaches adapters, store, resolver, provider, SDK, and 38+ omitted tests. Compatibility is additive except for new required fields constructed internally; public result consumers receive the deprecated `target` projection during migration.
- `packages/code-graph/src/domain/value-objects/language-adapter.ts`
  - Add `declarationPolicy(): AdapterDeclarationPolicy` as a required pure method on `LanguageAdapter`.
  - The policy declares callable-container kinds, parser-authoritative extraction, and adapter identity capabilities; it performs no I/O and contains no parser nodes.
  - Existing `analyzeFile`, import resolution, and relation signatures remain unchanged.
- `packages/code-graph/src/domain/value-objects/file-analysis.ts`
  - Keep physical symbols and binding/call facts unchanged. `ReferenceFacts.declarations` remains a partial mapping: absence means the physical symbol has no logical target.
- `packages/code-graph/src/domain/value-objects/impact-result.ts`
  - Add semantic affected targets, declaration evidence, explicit logical/physical counts, and logical coverage evidence.
  - Preserve existing `affectedSymbols` and `directDependents`/`indirectDependents`/`transitiveDependents` as deprecated projections whose documented unit becomes the semantic target unit only in the new resolved-target operation; the existing exact physical operation retains its current unit.
- `packages/code-graph/src/domain/value-objects/traversal-result.ts`
  - No change to physical BFS semantics. It continues to return physical nodes and relations used as evidence.
- `packages/code-graph/src/domain/value-objects/call-fact.ts`
  - Keep `callerSymbolId?: string`; clarify JSDoc that it is an eligible containing callable declaration, never a nearest preceding symbol or lexical binding.

### Shared semantic helpers

- `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`
  - Introduce the four-way pre-emission `AdapterDeclarationDecision` and the three emitted descriptor branches defined below. `role: 'unsupported'` has no `SymbolNode`; it is filtered before physical symbol creation.
  - `buildLogicalDeclarationFacts` handles only `role: 'logical'`, rejects duplicate physical classifications, builds canonical owners first, and records occurrence form without using it in identity. It groups multiple declarations only when every member supplies the same non-empty language-proven `groupKey`; two missing keys never group. If several ungrouped descriptors would collide on the same canonical logical ID, none is silently chosen or merged: retain their physical evidence, omit the ambiguous logical projection, and emit the deterministic `UNGROUPED_LOGICAL_COLLISION` diagnostic.
  - Add `findContainingCallableSymbol` using full half-open line/column ranges and the adapter policy. It returns the smallest eligible containing range, with deterministic tie-breaking, or `undefined`.
  - Keep `withEnclosingTypeParents`, but physical parent assignment must not be used as a substitute for canonical logical ownership.
- `packages/code-graph/src/domain/services/scoped-binding-environment.ts`
  - Remove the nearest-preceding fallback. If a `CallFact` has no valid caller, resolve its caller using `findContainingCallableSymbol`; if containment cannot be proven, omit the dependency and retain the unresolved call fact for diagnostics.
  - Lexical bindings remain usable for target resolution but never become the caller merely because they start closest to a call.
- `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`
  - Validate that every registered adapter returns a policy and has at least one callable-container kind when it reports call extraction support.

### Built-in language adapters

- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
  - Delete private `findEnclosingSymbolIdByLine` and call the shared range helper with function, method, constructor, accessor, and executable property-initializer candidates proven by parser context.
  - Replace `extractCallFactsFromData()` whole-source patterns with one AST visitor over `call_expression` and `new_expression`; derive callee shape, receiver, arguments, arity, call range, and caller ancestry from nodes. Do not infer static dispatch or construction from capitalization alone.
  - Replace structural scans in `extractImportedNamesFromData()`, `extractBindingFactsFromData()`, `extractClassReceiverFacts()`, `extractTypedParameterFacts()`, `extractReturnTypeFacts()`, `extractPropertyTypeFacts()`, `extractConstructionAliasFacts()`, `extractTypeAliasRhsFacts()`, and `collectTypeDeclarations()` with node/field traversal. Bounded tokenization inside a parser-proven type node remains permitted.
  - Replace `processPairNode()` scalar-value heuristics and `isArrayDataRecordProperty()` with ancestor-based ownership classification before `addSymbol`. Scalar keys in anonymous expression/argument objects return `role: 'unsupported'` and create no `SymbolNode` or `LocalBinding`. A scalar property under a supported named object declaration may create physical property evidence with that declaration as `parentId`; object methods/accessors may remain physical-only executable evidence even when the object has no logical target.
  - Emit a physical-only `SymbolKind.Function` named `<anonymous>` for arrow functions and function expressions that contain executable bodies and are needed as callers. Use the complete parser range, exact start position, and nearest physical callable/type parent; never create a `LogicalSymbol` for the synthetic name.
  - Classify parameters, ordinary locals, catch bindings, import aliases, and destructuring bindings as `lexical-binding`; classify anonymous executable declarations with useful location evidence as `physical-only`; classify syntax that is not a declaration, including scalar keys of anonymous argument objects, as `unsupported`; classify modules, exported/module variables, functions, classes, interfaces, types, enums, properties, accessors, constructors, and methods as `logical` when their required owner is proven.
  - Normalize overload signatures and the implementation to one method/function logical identity. Store `signature` versus `implementation` on each `DeclarationOccurrence.form`; do not encode it as `MemberKind.Signature` for an overload occurrence.
  - Same-name nested functions remain distinct through canonical logical owners. Same-name block locals remain different `LocalBinding` identities and have no logical target.
  - Import resolution emits a dependency only for a candidate proven by workspace/module resolution; remove first-candidate fallback. Imported `extends`/`implements` edges are emitted through `buildHierarchyReferenceFacts` so each relation has the same resolved target, parser range, and provenance as its shared hierarchy fact.
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`
  - Delete line-only caller selection. Eligible callers are functions, async functions, methods, and lambdas/closures only when a stable physical callable declaration exists.
  - Replace literal dynamic-import, `collectClassInfo()`, `extractBindingFactsFromData()`, and `extractCallFactsFromData()` whole-source matching with traversal of import/call/class/annotation/assignment/type nodes. Python indentation and containment come only from parser ancestry and ranges. `pyproject.toml` parsing remains auxiliary metadata.
  - Extract calls from `call` nodes: identifier callees are free calls, attribute callees are member calls, and construction is emitted only after the resolved target is proven class-like, never from initial capitalization.
  - Module/class declarations and functions/methods receive logical identity; parameters, comprehensions, loop targets, assignments, import aliases, and ordinary locals are lexical bindings. A closure without a stable declared semantic identity is physical-only.
  - Nested declarations use their canonical containing declaration as logical owner. Decorator-proven member forms remain occurrence evidence and do not manufacture owners.
  - Static and literal dynamic imports emit no dependency when resolution returns no target; remove first-candidate fallback. Imported class bases flow through the shared hierarchy builder so the relation and hierarchy reference fact retain one target and matching provenance.
- `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`
  - Delete line-only caller selection. Eligible callers are package functions, receiver methods, and function literals only when represented by a complete physical callable range.
  - Replace `collectTypeInfo()`, `collectInterfaceMethodNames()`, `extractGoImportsFromText()`, `extractBindingFactsFromData()`, and `extractCallFactsFromData()` structural scans with traversal of declaration, import-spec, field, type, selector, call, function-literal, and composite-literal nodes. Remove brace counting for source scopes. `go.mod` parsing remains auxiliary metadata.
  - Treat composite literals as construction facts only when their type node resolves deterministically. A call-expression identifier/selector remains a call until target resolution proves a type conversion or constructor-like target.
  - Package functions, named types, interfaces, receiver methods, and interface methods are logical. Parameters, receivers, short-variable declarations, range variables, import aliases, and ordinary variables are lexical bindings unless exported package declarations are explicitly classified logical.
  - Go does not create overload groups. Invalid same-owner same-name declarations remain distinct/unsupported evidence and are never merged by name.
  - Import specs retain their raw spelling as syntax/diagnostic evidence, but emit a dependency relation only after package resolution proves a workspace or supported external target. A raw specifier is never used as the relation target.
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
  - Delete line-only caller selection. Eligible callers are functions, methods, and closures with complete parser ranges.
  - Replace structural scans in `collectPhpTypeInfo()`, `extractBindingFactsFromData()`, `extractCallFactsFromData()`, and `extractRequireRelations()` with PHP AST traversal. Remove brace counting as a declaration-range mechanism.
  - Refactor `collectRawDynamicLoaders()` so registered CakePHP, CodeIgniter, Yii, Laravel, Zend, Drupal, and other framework policies receive parser-proven function/member/static-call nodes plus literal arguments. Registry matching of known API names remains; whole-source regex recognition of the call syntax is removed. Alias assignments, construction, member calls, require/include, and framework loaders in Pass 2 consume retained AST-derived facts only; callable-body regex scans are deleted.
  - Parse `composer.json` and PSR-4 metadata once while preparing `AdapterSessionState`. Per-file Pass 2 receives that immutable session value and performs no filesystem I/O. Remove adapter-instance metadata caches so concurrent and consecutive sessions cannot share resolution state.
  - Namespaced functions, class-like declarations, methods, properties, class constants, and enum cases are logical when owners are proven. Parameters, local assignments, `use` aliases, and framework-loader aliases are lexical bindings. Dynamic service-container results are not declarations.
  - Same-line declarations use exact columns and half-open ranges. Closures without stable language-level identity remain physical-only.
  - Namespace imports, require/include expressions, and loader calls emit no relation when resolution proves no target; remove first-candidate fallback. Imported parent/interface/trait hierarchy flows through the shared hierarchy builder with matching provenance.
- `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts` also owns the shared conformance fixtures’ policy-independent assertions so future adapters cannot copy a line-only algorithm.

### Indexing and incremental equivalence

- `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`
  - Accept partial logical mappings. Maintain both `declarationsByLogicalId` and `logicalIdByDeclarationSymbolId`; never parse or synthesize a logical ID for a physical-only symbol.
  - Reject one physical declaration being mapped to two logical targets in the same session.
- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
  - Register logical owners before owned members, preserve all logical declaration occurrences, and persist occurrence form.
  - Coverage writes continue to target `LogicalSymbol.id`. A physical-only declaration is classified coverage-not-applicable rather than missing.
  - Expand the affected-file closure for declaration movement, owner/group changes, body dependency changes, deletions, and newly resolvable references. After cleanup, no retained relation may reference a deleted physical symbol.
  - Incremental and clean rebuilds of identical final input must normalize to identical logical symbols, declaration mappings/forms, bindings, relations, resolution evidence, and coverage.
- `packages/code-graph/src/application/services/project-spec-coverage.ts`
  - Treat missing physical-to-logical mapping as `coverage-not-applicable`; reserve `symbol-not-found` for an implementation selector that has no physical declaration.
- `packages/code-graph/src/application/services/session-reference-store.ts`
  - Implement both logical-to-declaration and declaration-to-logical batch mappings against the in-memory session with the same ordering rules as SQLite.

### Resolution, traversal, and provider composition

- `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`
  - Resolve canonical IDs, owner-qualified names, and public semantic text to `kind: 'logical-target'`.
  - Resolve `declarationSymbolId` or exact file/position to `kind: 'declaration'` and include its logical target when mapped.
  - Compute ambiguity at the selected layer: declarations of one overload/merge target are one logical candidate; competing logical IDs are ambiguous; multiple physical occurrences at an exact position are declaration-ambiguous.
  - Never choose the first declaration as the target.
- `packages/code-graph/src/application/services/resolve-graph-selector.ts`
  - Return `ResolvedGraphSymbolSelector`, discriminating a logical target, exact declaration, public binding, ambiguous set, or missing result. Do not expand one logical target into several ambiguous selector matches.
- `packages/code-graph/src/domain/services/analyze-impact.ts`
  - Keep existing `analyzeImpact(store, symbolId, ...)` as exact physical impact.
  - Add `analyzeResolvedSymbolImpact(store, target, ...)`. Logical targets seed physical traversal with all declaration IDs; exact declarations seed only their ID; public bindings keep exact-route and canonical-target impact separate.
  - Aggregate reached physical declarations to their logical IDs in one batch, keep physical-only declarations as explicit affected targets, retain all relation/location evidence, and use shallowest semantic depth.
  - Risk is computed from unique semantic affected targets: unique logical IDs plus unique physical-only declaration IDs. Equivalent extra declarations cannot change risk.
- `packages/code-graph/src/domain/services/collect-impact-specs.ts`
  - Map reached declaration IDs to logical IDs in one batch before `COVERS_SYMBOL` lookup. Deduplicate logical IDs and retain the contributing declaration IDs and locations on coverage evidence. Never substitute an unmapped declaration ID for a missing logical ID. If the mapped logical frontier is empty, do not call `getCoveringSpecsForSymbols`; return only physical-only/coverage-not-applicable evidence.
- `packages/code-graph/src/domain/services/analyze-file-impact.ts` and `analyze-files-impact.ts`
  - Reuse the same logical coverage projection. File coverage remains independent and all input files begin at depth zero.
- `packages/code-graph/src/composition/code-graph-provider.ts`
  - Add `analyzeResolvedSymbolImpact(target, direction, maxDepth?, filter?)` to `CodeGraphProvider` and implementation.
  - Composition validates provider lifecycle/freshness, then delegates semantic aggregation, coverage, counts, and risk to the domain service. It does not recreate grouping rules.
  - Preserve `analyzeImpact(string, ...)` as exact physical compatibility API.
- Root/public barrels `packages/code-graph/src/index.ts`, `packages/code-graph/src/public.ts`, and `packages/sdk/src/index.ts` export new public types and functions as named ESM exports. No concrete infrastructure adapter is exposed.

### Store and SQLite

- `packages/code-graph/src/domain/ports/graph-store.ts`
  - Keep existing `findDeclarations(logicalSymbolIds)` and add `findLogicalDeclarationsByDeclarationIds(declarationSymbolIds)`.
  - Rename coverage parameters in JSDoc and implementations to `logicalSymbolId(s)`; keep method names for compatibility, but their accepted identity domain is exclusively logical.
  - Empty batches return `[]` without backend work. Inputs deduplicate by first occurrence. Results follow input-group order, then declaration order `(filePath,line,column,symbolId)`.
- `packages/code-graph/src/infrastructure/sqlite/schema.ts`
  - Bump the schema version from 14 to 15.
  - Add non-null `occurrence_form TEXT` to `logical_declarations`, constrained by application validation to the `DeclarationOccurrenceForm` values. The existing unique declaration mapping remains.
  - Schema 15 is the only readable current version. Schema 14 opens only through index-mode destructive rebuild; versions below 14 and above 15 are incompatible. No in-place `ALTER TABLE` path exists.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`
  - Add operation `findLogicalDeclarationsByDeclarationIds` with payload `{ readonly declarationSymbolIds: readonly string[] }` and result `LogicalDeclaration[]`.
  - Rename coverage payload fields to `logicalSymbolId` / `logicalSymbolIds`; this is an internal host-worker protocol updated atomically.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`
  - Dispatch the new mapping operation and renamed logical coverage payloads.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`
  - Short-circuit empty requests, send exactly one worker RPC per abstract batch operation, and never loop RPCs by identity.
- `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`
  - Query mappings with bounded `IN` chunks inside the worker, merge deterministically, persist/read `occurrence_form`, and filter reverse coverage against committed `logical_symbols` targets.
  - A physical row with an equal-looking ID cannot satisfy logical coverage.
- `packages/code-graph/src/application/services/session-reference-store.ts` and `packages/code-graph/test/helpers/in-memory-graph-store.ts` implement the complete port contract without partial casts.

### SDK, CLI, and documentation

- `packages/sdk/src/orchestration/run-graph-impact.ts`
  - Replace symbol orchestration that picks one declaration with resolution-preserving orchestration.
  - `ResolvedSymbolImpactResult` exposes `resolvedTarget`, all projected declarations, semantic affected targets, physical evidence, logical coverage, and explicit count units.
  - Delete the legacy branch that selects `resolvedTarget.declarations[0]` and invokes physical `analyzeImpact`. The provider dependency is fully typed with `analyzeResolvedSymbolImpact`; tests use a complete typed provider rather than incomplete compatibility mocks.
  - Ambiguous, missing, or unresolved outcomes do not invoke traversal. Every retained location is projected to `projectRelativePath` without another provider read, including locations nested under `resolvedTarget`, its declarations and resolution path, semantic affected targets, physical evidence, public surfaces, and covering-spec evidence.
- `packages/sdk/src/orchestration/index.ts` and `packages/sdk/src/index.ts`
  - Export new result types from the SDK host surface.
- `packages/cli/src/commands/graph/impact.ts`
  - Delegate resolution and execution to `runGraphImpact` exactly once.
  - Text distinguishes “logical target impact” from “declaration impact”, lists declaration locations, labels logical counts and physical evidence counts, and displays logical covering specs.
  - JSON and TOON pass through the structured SDK contract without regrouping or recomputing risk.
- `docs/adr/0029-cross-language-symbol-semantics.md`
  - Record the three identity layers, physical-edge/logical-projection decision, rejected alternatives, migration, and conformance fitness functions in MADR format.
- `docs/code-graph/index.md`
  - Document adapter obligations, partial physical-to-logical mapping, overload grouping, logical coverage targets, and physical evidence.
- `docs/sdk/index.md`
  - Document the discriminated impact result and count units using only `@specd/sdk` imports.
- `docs/cli/graph.md`
  - Update `graph impact` text/JSON/TOON schemas and logical versus exact selector examples.

### Tests

- Modify or add mirrored Vitest files under:
  - `packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts`
  - `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`
  - `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` (new shared harness)
  - the four existing `*-language-adapter.spec.ts` files
  - `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts`
  - `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`
  - `packages/code-graph/test/domain/services/traversal.spec.ts`
  - `packages/code-graph/test/domain/ports/graph-store.contract.ts`
  - `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
  - `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`
  - `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts`
  - `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
  - `packages/code-graph/test/composition/code-graph-provider.spec.ts`
  - `packages/sdk/test/orchestration/run-graph-impact.spec.ts`
  - `packages/cli/test/commands/graph-impact.spec.ts`
  - `packages/cli/test/documentation-coverage.spec.ts`

## New constructs

The following definitions are the implementation contract. JSDoc with descriptions, `@param`, `@returns`, and `@throws` where applicable is mandatory on every new symbol.

```ts
// packages/code-graph/src/domain/value-objects/symbol-reference.ts
export const DeclarationOccurrenceForm = {
  Declaration: 'declaration',
  Signature: 'signature',
  Implementation: 'implementation',
  Definition: 'definition',
} as const

export type DeclarationOccurrenceForm =
  (typeof DeclarationOccurrenceForm)[keyof typeof DeclarationOccurrenceForm]

export interface SourcePosition {
  readonly line: number
  readonly column: number
}

export interface LogicalResolutionTarget {
  readonly kind: 'logical-target'
  readonly logicalSymbol: LogicalSymbol
  readonly declarations: readonly DeclarationOccurrence[]
  readonly path: readonly ResolutionStep[]
}

export interface DeclarationResolutionTarget {
  readonly kind: 'declaration'
  readonly declaration: DeclarationOccurrence
  readonly logicalSymbol: LogicalSymbol | undefined
  readonly path: readonly ResolutionStep[]
}

export interface PublicBindingResolutionTarget {
  readonly kind: 'public-binding'
  readonly binding: PublicBinding
  readonly logicalSymbol: LogicalSymbol
  readonly declarations: readonly DeclarationOccurrence[]
  readonly path: readonly ResolutionStep[]
}

export type ResolvedSymbolTarget =
  | LogicalResolutionTarget
  | DeclarationResolutionTarget
  | PublicBindingResolutionTarget

export interface ResolveSymbolReferenceInput {
  // all existing fields remain
  readonly declarationSymbolId?: string
  readonly position?: SourcePosition
}

export interface SymbolResolutionResult {
  readonly request: ResolveSymbolReferenceInput
  readonly status: ResolutionStatus
  readonly reasonCode: string | null
  readonly health: ResolutionHealth
  readonly resolvedTarget: ResolvedSymbolTarget | null
  readonly candidates: readonly ResolutionCandidate[]
  readonly path: readonly ResolutionStep[]
  /** @deprecated Read `resolvedTarget`; this is non-null only for targets with a logical symbol. */
  readonly target: LogicalSymbol | null
}
```

```ts
// packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts
export type AdapterDeclarationDecision =
  | {
      readonly role: 'logical'
      readonly surface: string
      readonly space: SymbolSpace
      readonly ownerSymbolId?: string
      readonly requiresOwner: boolean
      readonly memberSemantics?: MemberSemantics
      readonly occurrenceForm: DeclarationOccurrenceForm
      readonly groupKey?: string
    }
  | {
      readonly role: 'lexical-binding'
      readonly scopeId: string
      readonly space: SymbolSpace
      readonly reason: string
    }
  | {
      readonly role: 'physical-only'
      readonly reason: string
    }
  | {
      readonly role: 'unsupported'
      readonly reason: string
    }

export type GraphDeclarationDecision = Exclude<
  AdapterDeclarationDecision,
  { readonly role: 'unsupported' }
>

export type AdapterDeclarationDescriptor = GraphDeclarationDecision & {
  readonly symbol: SymbolNode
}

export interface AdapterSyntaxCandidate {
  readonly syntaxRole: string
  readonly nodeKind: string
  readonly name: string | undefined
  readonly range: SourceRange
  readonly selectionRange: SourceRange | undefined
}

export interface CallableContainmentPolicy {
  readonly callableKinds: ReadonlySet<SymbolKind>
  readonly eligibleSymbolIds?: ReadonlySet<string>
}

export function findContainingCallableSymbol(
  symbols: readonly SymbolNode[],
  position: SourcePosition,
  policy: CallableContainmentPolicy,
): SymbolNode | undefined
```

`groupKey` is optional positive language evidence used only to authorize multi-declaration grouping; it is not serialized into the logical ID. A descriptor with no `groupKey` represents one ungrouped declaration. Two or more descriptors may share one logical target only when their canonical identity fields match and every descriptor provides the same non-empty `groupKey`. Missing keys never compare equal and never authorize grouping. Different non-empty keys remain separate groups. If two ungrouped descriptors would otherwise produce the same canonical ID, `buildLogicalDeclarationFacts` retains both physical declarations, omits their logical mappings, and emits `UNGROUPED_LOGICAL_COLLISION` rather than selecting or merging either declaration.

```ts
// packages/code-graph/src/domain/value-objects/language-adapter.ts
export interface AdapterDeclarationPolicy {
  readonly languageIds: readonly string[]
  readonly callableContainerKinds: ReadonlySet<SymbolKind>
  readonly supportsLogicalDeclarationGroups: boolean
  readonly supportsPhysicalOnlyDeclarations: boolean
  readonly structuralFactsAreParserAuthoritative: true
}
```

Each adapter classifies an `AdapterSyntaxCandidate` before calling `createSymbolNode`/`addSymbol`. `role: 'unsupported'` returns immediately and never enters `FileAnalysis.symbols`, binding facts, logical declaration facts, or relation building. The other three decisions may create a `SymbolNode`; the resulting descriptor is passed to logical-fact construction. This two-stage contract prevents “physical-only” from becoming a dumping ground for syntax that is not a declaration at all.

```ts
// private to each Tree-sitter adapter; SgNode never crosses FileAnalysisDraft
interface AstCallCandidate {
  readonly node: SgNode
  readonly form: CallForm
  readonly name: string
  readonly receiverName: string | undefined
  readonly targetName: string | undefined
  readonly arity: number | undefined
  readonly location: SourceLocation
}

function createCallFactFromAst(
  candidate: AstCallCandidate,
  symbols: readonly SymbolNode[],
  policy: CallableContainmentPolicy,
): CallFact
```

`createCallFactFromAst` is an adapter-local helper shape, not a persisted/public type. It computes `callerSymbolId` from the call node's start position and `findContainingCallableSymbol`, uses the parser-proven complete call range in `location`, and copies no parser node into `FileAnalysisDraft`. Adapters may name the private helper differently, but every emitted `CallFact` must be constructed from equivalent node-derived inputs.

```ts
// packages/code-graph/src/domain/ports/graph-store.ts
export abstract class GraphStore {
  // existing methods remain
  findDeclarations(logicalSymbolIds: readonly string[]): Promise<LogicalDeclaration[]>
  findLogicalDeclarationsByDeclarationIds(
    declarationSymbolIds: readonly string[],
  ): Promise<LogicalDeclaration[]>
  getCoveringSpecsForSymbol(logicalSymbolId: string): Promise<Relation[]>
  getCoveringSpecsForSymbols(logicalSymbolIds: readonly string[]): Promise<Relation[]>
}
```

```ts
// packages/code-graph/src/domain/value-objects/impact-result.ts
export interface PhysicalDependencyEvidence {
  readonly relationType: RelationType
  readonly sourceDeclarationId: string
  readonly targetDeclarationId: string
  readonly sourceLocation: SourceLocation | undefined
  readonly targetLocation: SourceLocation | undefined
  readonly depth: number
}

export interface LogicalAffectedTarget {
  readonly kind: 'logical-target'
  readonly logicalSymbol: LogicalSymbol
  readonly declarations: readonly DeclarationOccurrence[]
  readonly depth: number
  readonly evidence: readonly PhysicalDependencyEvidence[]
}

export interface PhysicalOnlyAffectedTarget {
  readonly kind: 'physical-only'
  readonly declaration: SymbolNode
  readonly depth: number
  readonly evidence: readonly PhysicalDependencyEvidence[]
}

export type SemanticAffectedTarget = LogicalAffectedTarget | PhysicalOnlyAffectedTarget

export interface SemanticImpactCounts {
  readonly directLogicalTargets: number
  readonly indirectLogicalTargets: number
  readonly transitiveLogicalTargets: number
  readonly physicalOnlyTargets: number
  readonly physicalDeclarationOccurrences: number
}

export interface ResolvedSymbolImpactResult extends ImpactResult {
  readonly resolvedTarget: ResolvedSymbolTarget
  readonly semanticAffectedTargets: readonly SemanticAffectedTarget[]
  readonly physicalEvidence: readonly PhysicalDependencyEvidence[]
  readonly semanticCounts: SemanticImpactCounts
  readonly coveringSpecs: readonly CoveringSpecImpact[]
}
```

```ts
// packages/code-graph/src/composition/code-graph-provider.ts
export interface CodeGraphProvider {
  // existing methods remain
  analyzeResolvedSymbolImpact(
    target: ResolvedSymbolTarget,
    direction: ImpactDirection,
    maxDepth?: number,
    filter?: ImpactResultFilter,
  ): Promise<ResolvedSymbolImpactResult>
}
```

## Data models & Contracts

### Identity layers

1. `SymbolNode.id` is physical and location-backed. It identifies where parser evidence exists and may change after movement.
2. `LocalBinding.id` is lexical and scope-bound. It identifies a spelling inside one proven scope and may point to a logical target, but is not itself a global semantic declaration.
3. `LogicalSymbol.id` is semantic and location-independent. It contains workspace, canonical surface, name, symbol space, canonical logical owner, and stable member semantics. It can have zero-to-many public/local bindings and one-to-many declaration occurrences.

Mappings are intentionally partial and non-bijective. Every logical declaration maps to one logical target. A physical symbol may map to no logical target. One logical target may have many physical declarations. One physical declaration may never map to multiple logical targets.

### Source ranges and containment

Lines are 1-based; columns are 0-based; ranges are half-open. A position `p` is contained when `start <= p < end`. A call’s semantic caller is the innermost eligible callable whose complete range contains the call position. “Innermost” is the candidate with the latest start and earliest end; equal ranges break ties by `SymbolNode.id`. Merely starting earlier is insufficient. An unresolved caller creates no guessed dependency relation.

### Parser-authoritative structural boundary

`analyzeFile()` parses source exactly once. During that same parser lifetime, the adapter walks named nodes and emits serializable symbols, imports, bindings, calls, hierarchy/reference facts, and compact language state. It MUST NOT retain `SgNode`, a tree, or parser-runtime objects in `FileAnalysisDraft`, and Pass 2 MUST NOT reparse source.

Whole-source regex or substring scanning cannot decide that a declaration, import, binding, call, construction, type reference, hierarchy edge, owner, scope, caller, or argument exists. A regex is allowed only in these cases:

1. Parsing an adapter-declared auxiliary manifest with no configured syntax tree: `package.json`, `pyproject.toml`, `go.mod`, or `composer.json`.
2. Tokenizing text wholly contained inside one parser-proven node when the supported grammar lacks finer named children. The match range is offset from and clipped to that node; it cannot cross the node boundary.
3. A documented grammar-compatibility branch covered by a fixture proving the parser node that anchors the bounded text. It cannot create a fact without that anchor.

Import syntax and import resolution remain separate. An `ImportDeclaration` may retain the raw specifier when no target resolves, but relation construction accepts only a proven resolved target ID. Candidate ordering is deterministic discovery evidence, never authority to persist the first unresolved candidate. Imported hierarchy uses one shared `HierarchyReferenceFact` as the source of the physical relation; both carry the same child, resolved parent/contract target, parser-derived source range, and resolution provenance.

Auxiliary metadata is loaded only during adapter-session preparation. The immutable `AdapterSessionState` contains normalized package/module/PSR-4 maps used by all files in that run. Per-file Pass 2 code receives this value explicitly, performs no filesystem reads, and writes no adapter-instance cache.

The built-in call mappings are:

| Language              | Parser evidence                                               | Normalized fact                                                                                     |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| TypeScript/JavaScript | `new_expression`                                              | `CallForm.Constructor`; name/receiver/arity from constructor and arguments fields                   |
| TypeScript/JavaScript | `call_expression` with identifier callee                      | `CallForm.Free`                                                                                     |
| TypeScript/JavaScript | `call_expression` with member/subscript/optional-chain callee | `CallForm.Member` initially; static dispatch only after receiver resolution proves a type/namespace |
| Python                | `call` with identifier callee                                 | `CallForm.Free`; construction is decided only after target resolution proves a class                |
| Python                | `call` with attribute callee                                  | `CallForm.Member`                                                                                   |
| Go                    | `call_expression` with identifier/selector function           | `CallForm.Free`/`Member`; conversion or type construction requires resolved type evidence           |
| Go                    | typed `composite_literal`                                     | `CallForm.Constructor` only when its type resolves deterministically                                |
| PHP                   | `object_creation_expression`                                  | `CallForm.Constructor`                                                                              |
| PHP                   | function/member/nullsafe/static call expression               | `CallForm.Free`, `Member`, or `Static` from the callee node                                         |

Argument arity is the number of parser argument children when statically present. Receiver and target names come from named callee fields and may remain `undefined`; capitalization is never semantic evidence. Comments, string/template/heredoc contents, declarations whose headers resemble calls, and parser error-node text produce no call fact unless a supported call node exists.

Anonymous executable nodes that contain calls are physical-only callable containers: TypeScript arrow/function expressions, Python lambdas, Go function literals, and PHP anonymous/arrow functions. Their physical symbol uses name `<anonymous>`, `SymbolKind.Function`, exact node range, exact node start, and the nearest supported physical parent. Location makes the ID deterministic for the indexed version; they receive no `LogicalSymbol` solely from that name/location.

TypeScript `pair`/`property_definition` classification occurs before symbol creation. A scalar or nested-object key under an anonymous object used as an expression or argument is `unsupported`. A property beneath a supported named object declaration may be emitted with that declaration as its physical parent. Method/accessor syntax remains a real executable declaration and may be physical-only even when a logical owner is unavailable.

### Declaration forms and overloads

Occurrence form is declaration evidence, not logical identity. TypeScript overload signatures and implementation declarations share the same logical function/method target and differ through `DeclarationOccurrence.form`. Interface/abstract members without implementations still use stable method/property/constructor member semantics. Python, Go, and PHP do not form overload groups unless the adapter proves a language-native merge/group construct. Equal names alone never group declarations.

Every multi-declaration group has one non-empty adapter-provided `groupKey`. An omitted key always means “ungrouped”, not a default group. Canonical-ID collisions between ungrouped declarations are conservative classification failures: both remain physical evidence and neither is promoted to an arbitrarily merged logical target.

### Batch mapping ordering

Batch inputs remove duplicates by first occurrence. Unknown IDs are omitted. Empty input produces empty output with no backend/worker request. Logical-to-declaration output follows logical input order; within each logical target, declarations sort by `filePath`, `line`, `column`, `symbolId`. Declaration-to-logical output follows declaration input order. SQLite may chunk SQL parameters but the host-to-worker boundary remains one RPC.

### Coverage

`COVERS_SYMBOL.source` is a spec ID and `target` is exclusively `LogicalSymbol.id`. Physical declaration IDs are invalid targets. Impact first maps reached declarations to logical IDs, performs one bounded reverse lookup, and attaches the contributing declarations as evidence. Physical-only declarations are `coverage-not-applicable`, not silently uncovered. `COVERS_FILE` remains unchanged.

### Resolution validation and reason codes

- `INVALID_SELECTOR`: mutually exclusive exact/logical selector fields were combined or a position has invalid coordinates.
- `DECLARATION_NOT_FOUND`: an exact declaration ID or exact position has no physical match.
- `LOGICAL_TARGET_NOT_FOUND`: a canonical logical ID has no target.
- `AMBIGUOUS_LOGICAL_TARGET`: more than one logical target matches semantic text.
- `AMBIGUOUS_DECLARATION`: an exact physical selector matches more than one occurrence.
- Existing stale/incomplete graph reason codes remain and take precedence over absence claims.

These are normal `SymbolResolutionResult` outcomes; they do not throw. Store lifecycle, schema incompatibility, corrupt rows, and invalid internal invariants continue to throw their existing typed errors.

### SDK and CLI compatibility

The SDK result adds `resolvedTarget`, `declarations`, `semanticAffectedTargets`, `physicalEvidence`, `semanticCounts`, and logical coverage evidence. During one release cycle, `SymbolResolutionResult.target`, `ResolvedSymbolImpactResult.symbol`, and legacy aggregate fields remain as deprecated projections. `symbol` is the first deterministically ordered declaration only for display compatibility and must never be used to drive traversal. JSON/TOON include both old and new fields during that cycle. Text uses new terminology immediately. Removal requires a separate change.

## Approach & Execution flow

1. `analyzeFile()` creates one Tree-sitter tree and walks its named nodes while the tree is alive. Each adapter extracts declarations, imports, bindings, calls/construction, types, and hierarchy evidence directly from node kinds, named fields, ancestry, and exact ranges.
2. Before emitting a declaration, the adapter builds an `AdapterSyntaxCandidate` and returns one `AdapterDeclarationDecision`: `logical`, `lexical-binding`, `physical-only`, or `unsupported`. The unsupported branch emits nothing. The other branches may create a physical `SymbolNode`; only the logical branch enters logical declaration construction.
3. Anonymous executable AST nodes needed as call containers receive physical-only `<anonymous>` function symbols. TypeScript anonymous object argument keys such as `{ name: 'my-change' }` are unsupported and never call `addSymbol`; named-object properties retain their owner-aware policy.
4. Each parser call/construction node becomes one deduplicated `AstCallCandidate`. The adapter derives form, names, receiver, argument count, and complete location from the node. It invokes the shared containment helper with the call start and declared callable policy. No caller is recorded when containment or eligibility is unproven. No whole-source call regex runs.
5. Session preparation reads auxiliary manifests once and stores normalized immutable resolution maps in `AdapterSessionState`. The adapter finishes extracting every serializable source fact during the AST walk, releases parser objects, and returns `FileAnalysisDraft`. Pass 2 uses only the draft, immutable session state, and shared session lookups; it neither reparses, scans raw callable text, nor performs filesystem I/O.
6. `buildLogicalDeclarationFacts` validates one emitted classification per physical symbol, recursively materializes canonical logical owners, creates location-independent logical targets, groups only descriptors sharing the same non-empty language-proven group key, and emits occurrences with form metadata. Missing group keys create independent declarations; a canonical collision without group evidence remains physical-only with `UNGROUPED_LOGICAL_COLLISION`.
7. The index session registers all physical symbols, then partial logical mappings, bindings, public routes, hierarchy, and resolution evidence. Lexical/physical-only symbols remain available without a logical mapping.
8. Incremental indexing computes the dependency and semantic invalidation closure, removes stale physical state, rebuilds every affected consumer, and replaces the normalized semantic snapshot transactionally. A clean rebuild of final input is the equivalence oracle.
9. Symbol resolution chooses the requested layer. Canonical/name/public selectors produce logical targets; declaration ID or file-position selectors produce exact declarations. Logical ambiguity groups by logical ID, not declaration count.
10. The provider passes the complete `ResolvedSymbolTarget` to `analyzeResolvedSymbolImpact`. It never converts a logical target to one declaration ID.
11. Logical traversal loads every declaration for the target in one batch and runs physical traversal from all unique declaration IDs. Exact traversal uses only the selected declaration. Public binding impact preserves the exact binding route and separately computes canonical logical impact.
12. Reached physical declarations are mapped to logical targets in one bounded batch. Results group by logical ID at shallowest semantic depth while retaining all physical relation and location evidence. Unmapped declarations become physical-only affected targets.
13. Counts are computed over semantic targets; risk uses those counts. Physical evidence counts are reported separately. Additional equivalent declarations cannot change risk.
14. Reverse symbol coverage receives deduplicated logical IDs only. Unmapped declarations are removed from the frontier without substituting their physical IDs; an empty frontier skips the store call. Coverage evidence connects each spec/logical target to all reached physical declarations that caused the match.
15. SDK invokes only the provider's discriminated resolved-target impact operation; there is no first-declaration compatibility traversal. It recursively projects every public location using configuration only, including nested target, declaration, resolution, affected-target, evidence, public-surface, and coverage locations. CLI formats the SDK result and never performs independent resolution, grouping, coverage queries, path reconstruction, or risk calculation.

## Error handling & Edge cases

- Invalid/empty batches return empty arrays; they do not contact SQLite worker.
- Unknown IDs are omitted from batch results; they do not create placeholder logical symbols.
- Duplicate physical-to-logical mappings are an indexing invariant violation and fail the indexing transaction with a typed `SpecdCodeGraphError` code `DUPLICATE_DECLARATION_MAPPING`.
- Missing required owner, cyclic owner chains, or conflicting group keys omit logical projection for the affected physical declaration, record deterministic coverage diagnostics, and retain physical evidence. They do not guess an owner.
- Missing group keys never merge. If otherwise identical ungrouped logical candidates collide, record `UNGROUPED_LOGICAL_COLLISION`, retain both physical declarations, and omit both logical mappings; do not select a first declaration.
- Same-line and multiline constructs use line and column on both boundaries. A call at the exclusive end is outside the candidate.
- Nested callables select the innermost eligible container. A local variable, parameter, property name, or type declaration is never eligible unless an adapter explicitly identifies an executable initializer symbol.
- A parser `ERROR` node, missing required named field, dynamic callee, computed runtime target, or text-only lookalike produces no guessed structural fact. The adapter retains existing parse/coverage diagnostics and continues analyzing independent valid nodes.
- An unresolved import, loader, or package specifier produces no dependency relation. A resolved imported hierarchy target produces both its physical hierarchy relation and one matching shared hierarchy fact; disagreement between them is an indexing invariant failure and the relation is omitted.
- Per-file Pass 2 metadata access is pure. Missing session-prepared metadata yields unresolved evidence, not a filesystem read or adapter-cache fallback.
- An auxiliary-manifest regex is confined to the manifest reader. A bounded token regex starts from a parser node's text and maps offsets back inside that node; a match outside the node is discarded as an internal invariant failure.
- A TypeScript anonymous scalar object key has no graph declaration. Removing the false symbol must not remove the real surrounding `uc.execute()` call; that call uses the containing callback when represented and otherwise remains caller-unresolved.
- Stale/incomplete graph health prevents definitive missing claims exactly as existing resolution health rules require.
- Ambiguous/unresolved selectors never start traversal.
- Physical-only target impact remains supported through exact declaration impact, but it has no logical coverage lookup.
- SQLite schema 14 is incompatible with schema 15 because occurrence form is required. Normal read fails with the existing incompatibility error; index mode rotates/rebuilds atomically.
- Worker errors and cancellation retain existing request rejection behavior. SQL chunking is internal and must not expose partial results.
- Incremental failure rolls back the write session; the previous committed graph remains usable.

## Key decisions

- **Three explicit identity layers**: physical declaration, lexical binding, and logical target. This preserves navigation and data-flow evidence without pretending every local is a persistent semantic entity.
- **Physical dependency graph with logical projection at query time**: it retains exact provenance and avoids duplicating or invalidating a second dependency graph. A fully materialized logical-edge table was rejected because it duplicates evidence and complicates incremental correctness.
- **Range containment, never line precedence**: shared helper plus adapter policy prevents the same defect from being copied into future languages. Per-adapter private nearest-symbol helpers were rejected.
- **Parser-authoritative source semantics**: Tree-sitter nodes, fields, ancestry, and ranges decide source structure; regex is limited to auxiliary metadata and bounded leaf tokenization. Whole-source regex extraction was rejected because it duplicates the parser, loses ancestry, and accepts comment/string/multiline lookalikes.
- **Framework policy over AST evidence**: PHP framework registries keep their known API and literal conventions, but consume proven call nodes. Deleting framework support and retaining regex-recognized calls were both rejected.
- **Four-way pre-emission classification**: unsupported syntax is filtered before `SymbolNode` creation; logical, lexical-binding, and physical-only remain graph-bearing branches. Treating every parsed key as physical-only was rejected because it preserves false declarations.
- **Occurrence form outside logical ID**: adding/removing an overload signature does not rename the logical method. Signature-derived IDs and one logical ID per overload declaration were rejected as unstable or semantically duplicative.
- **Positive grouping evidence**: a non-empty language-proven group key is required to combine declarations; absence is never a shared group. Name-only grouping and empty-key grouping were rejected because they collapse unrelated declarations.
- **Resolved imports only**: raw specifiers and candidate ordering remain diagnostics, never persisted targets. First-candidate fallback was rejected because it manufactures dependency and hierarchy edges.
- **Session-prepared metadata**: auxiliary filesystem data is normalized before file analysis and passed immutably. Pass 2 I/O and adapter-instance caches were rejected because they violate purity and leak state across runs.
- **Partial logical mapping**: physical-only and lexical symbols are valid. Forcing a logical identity for every `SymbolNode` was rejected because anonymous/local scopes lack stable language-level identity.
- **Logical `COVERS_SYMBOL` target**: this matches production writes and SQLite integrity. Dual-domain coverage endpoints were rejected because equal-looking strings could silently cross identity domains.
- **Additive public migration**: new discriminants drive behavior while deprecated projections remain temporarily. Silently changing `symbolId` semantics was rejected.
- **Semantic risk unit**: unique logical targets plus unique physical-only targets. Counting declaration occurrences was rejected because overload count would change risk without changing semantic blast radius.

## Trade-offs

- More result data and batch lookups increase memory use → bound SQL chunks, deduplicate early, and retain one worker RPC per logical operation.
- Some calls lose previously guessed edges → expose unresolved diagnostics and prefer conservative absence to false dependency evidence.
- AST migration can expose grammar-version gaps previously hidden by text scans → cover every removed regex family with valid, multiline, lookalike, and unsupported fixtures; keep only bounded, documented compatibility extraction.
- Partial mapping means consumers must handle physical-only symbols → discriminated unions and contract tests make that branch mandatory.
- Schema 15 requires graph rebuild → graph data is derived, normal reads fail safely, and index mode rebuilds atomically.
- Query-time logical projection costs work on impact calls → indexed bidirectional batch mapping avoids N+1 operations; materialization can be reconsidered only with measured evidence.
- Deprecated SDK fields temporarily duplicate data → document one-release migration and test equivalence of projections.

## Spec impact

The modified foundational specs have broad dependents. `symbol-model` flows into the adapter contract, all language adapters, store, resolver, traversal, indexer, composition, SDK, and CLI. `graph-store` flows into traversal, resolver, indexer, SQLite, composition, and SDK. `resolve-symbol-reference` flows into traversal, composition, SDK, and CLI. All 14 directly affected specs are included in this change, so no discovered dependent requirement needs an additional delta.

Existing search, hotspot, file-impact, spec-impact, and physical navigation requirements remain valid because physical symbols and relations remain authoritative. Their implementations may consume the new batch mapping but their public operation kind does not change. Global architecture remains satisfied: domain logic is pure, storage is accessed only through `GraphStore`, SQLite stays infrastructure, composition only wires/delegates, SDK is the host facade, and CLI contains formatting only. Global conventions remain satisfied through strict readonly types, named ESM exports, no `any`, kebab-case files, and explicit public return types. Global testing and documentation requirements are incorporated below.

## Dependency map

```mermaid
graph LR
  P[Tree-sitter AST] --> A[Language adapters]
  A --> B[Physical SymbolNode / bindings]
  A --> C[LogicalSymbol + declarations]
  B --> D[Physical dependency relations]
  C --> E[Resolver discriminated target]
  D --> F[Resolved impact traversal]
  E --> F
  F --> G[Logical aggregation + physical evidence]
  C --> H[Logical COVERS_SYMBOL]
  H --> G
  G --> I[CodeGraphProvider]
  I --> J[@specd/sdk runGraphImpact]
  J --> K[CLI graph impact]
  L[GraphStore port] --> M[SQLite worker/store/database]
  M --> F
```

```text
┌─────────────────────────────────────────────────────────────┐
│ TypeScript · Python · Go · PHP adapters                     │
│ AST facts + classify + prove ranges + owners/groups         │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
     ┌──────────────────┐           ┌──────────────────────┐
     │ Physical symbols │           │ Logical targets      │
     │ bindings + edges │           │ declaration mappings │
     └─────────┬────────┘           └──────────┬───────────┘
               │                               │
               └──────────────┬────────────────┘
                              ▼
                 ┌───────────────────────────┐
                 │ Resolver + impact domain  │
                 │ semantic grouping         │
                 │ physical evidence         │
                 │ logical coverage          │
                 └─────────────┬─────────────┘
                               ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │ GraphStore / │→ │ Provider     │→ │ SDK → CLI    │
          │ SQLite       │  │ [CRITICAL]   │  │ structured   │
          └──────────────┘  └──────────────┘  └──────────────┘
```

## Migration / Rollback

1. Introduce domain unions, classification helpers, batch port methods, and compatibility fields.
2. Update in-memory/SQLite implementations and worker protocol atomically; bump derived graph schema to 15.
3. Update all four adapters and shared conformance tests before enabling resolved logical impact.
4. Update resolver, traversal, provider, SDK, CLI, docs, and ADR in dependency order.
5. Build all packages, then run the focused and full suites. Re-index the project; index mode rebuilds schema-14 graph storage to schema 15.
6. Compare an incremental index with a clean index for the identity-sensitive fixture matrix before release.

Rollback reverts code and schema version together. Because the graph is derived, delete/rotate only the schema-15 graph generation through the existing graph recreation/index path and rebuild schema 14 with the previous binary. No source/spec data migration is required. Do not attempt to open schema 15 with schema-14 read mode or manually drop the new column. JSON consumers can continue using deprecated fields during the compatibility window.

## Verification round 2: corrective contract

A compliance audit of the working tree found defects that the first implementation round did not cover. Decisions already made with the user, and the exact corrections they require, are materialized here. No section outside this one is superseded except where noted.

### Decisions

- **`occurrence_form` lives on `logical_declarations`** (schema 15). `symbols` persists `project_relative_path` only. A physical-only declaration has no `logical_declarations` row and persists no form; it stays retrievable by physical symbol ID and range. No schema change is needed; the specification text is aligned to the existing DDL.
- **The indexer derives file-level `IMPORTS`.** TypeScript, Python and Go adapters return resolved imports through `resolveImports()` (`fileImports`); `index-code-graph.ts` creates the `IMPORTS` relations. An adapter MAY emit `IMPORTS` only for loader-style dependencies it alone can prove (PHP). No adapter code change is required; tests that claim adapter-emitted `IMPORTS` for TypeScript, Python and Go must be renamed or corrected (the Go test named "emits IMPORTS and CALLS relations" asserts `IMPORTS` is undefined and must be renamed to match the new contract).
- **The `@specd/code-graph` barrel exports the semantic impact domain services.** `analyzeImpact`, `analyzeResolvedSymbolImpact`, `analyzePublicBindingImpact`, `collectImpactSpecIds`, `collectLogicalCoveringSpecs` and the result types `PhysicalDependencyEvidence`, `LogicalAffectedTarget`, `PhysicalOnlyAffectedTarget`, `SemanticAffectedTarget`, `SemanticImpactCounts`, `ResolvedSymbolImpactResult` are part of the enumerated closed export list. `packages/code-graph/test/` gains a barrel allow-list test that compares the runtime export names with the enumerated list.
- **Depth-0 coverage for symbol impact.** Specs covering the impact target's own logical symbol are reported in `coveringSpecs` at depth 0, matching file impact. `analyze-impact.ts` currently never adds root declarations to `symbolDepthMap` (around line 288); root declarations must be added at depth 0 before logical coverage lookup. The reverse logical-coverage store operation is skipped only when no declaration in the coverage frontier (the target's own declarations plus every reached declaration) maps to a logical target; a logical target whose dependents are all physical-only still issues exactly one batch query for its own coverage.
- **Selector-level resolution always returns the typed target.** `resolveSymbolSelector` in `packages/code-graph/src/application/services/resolve-graph-selector.ts` (bare name, file-qualified, full-id paths around lines 172-190, 255-263, 271-281, 410-431, and `unifyOverloadSetCandidates` at 367-401) must return the discriminated logical-target result with every contributing declaration for an overload set. A physical `match` may accompany it as a derived projection only. The SDK fallback in `packages/sdk/src/orchestration/run-graph-impact.ts` (around lines 617-648) that builds a physical declaration target from `getSymbol` must be removed for logical selectors.
- **Legacy summary fields are display-only.** `RunGraphImpactResult.symbol` and `impact.target` are derived after traversal. `impact.target` carries the canonical logical identity for a logical target, never a physical declaration ID. The display name comes from the canonical logical symbol, never from splitting a physical ID string (run-graph-impact.ts around lines 665-742).

### Corrections by area

1. **Resolver and SDK/CLI** (`resolve-graph-selector.ts`, `run-graph-impact.ts`, `packages/cli/src/commands/graph/impact.ts`): implement the typed-selector decision above; project every nested location under `resolution`, `binding`, `target`, `path` and file-based covering-spec evidence to `projectRelativePath` (export result near lines 856, 876-934 and symbol/file/multi-file coverage evidence); return the real candidate list for public-binding ambiguity instead of `candidates: []` (line 880) and make the CLI print the candidates, not only a route count.
2. **Traversal** (`packages/code-graph/src/domain/services/analyze-impact.ts`): add depth-0 root declarations to the coverage frontier; make `analyzePublicBindingImpact` (lines 114-140) aggregate canonical-target impact logically with `semanticCounts` while keeping exact-route impact separate; report a reached declaration whose logical id has no stored logical symbol as declaration-only evidence instead of skipping it (around lines 411-430).
3. **Adapters, calls**: `buildRelations` in the TypeScript, Go and Python adapters must stop resolving `CALLS` by bare name against same-file symbols. A call relation requires a proven receiver, binding, import or local declaration; otherwise no relation is emitted. Python must not link `x.save()` on an unknown receiver to the nearest preceding `save`; Go must not link an interface-value call to a concrete method; TypeScript must not link a free `helper()` call to a class method named `helper`.
4. **Adapters, identity**: TypeScript class fields, interface properties and enum members and Go struct fields get the declaring owner in their logical id (Python and PHP already do). TypeScript same-name nested functions and block-local callables in sibling branches must not share a group key (key includes the lexical owner/scope). TypeScript overload signatures and the implementation keep one stable logical id, so adding signatures must not change the method id (occurrence form, not kind, differs); function overload signatures must be extracted.
5. **Adapters, member forms from the AST**: TypeScript `get`/`set` classification uses the parser accessor token, not the method name; Python decorators come from decorator nodes (multiline decorators and interleaved comments included); PHP `static` comes from the method modifier node, never from adjacent text.
6. **Adapter invariants**: remove the line-only nearest-preceding selector in `scoped-binding-environment.ts` (around line 487) in favour of range containment; remove mutable `workspaceCodeRoots` instance state and uncached `package.json` reads in `linkReExports` of `typescript-language-adapter.ts` (around line 452) by moving them to session-prepared metadata; remove the language-name branch in `in-memory-index-session.ts` (around line 221); delete the dead PHP `LOADER_RESOLVERS` regex block.
7. **Go and Python specifics**: a Go struct field is not a package-level public binding; Go import resolution must select a package/file target by module prefix and directory (not by searching for a symbol named after the last path segment); Go `IMPLEMENTS` requires method-set evidence (pointer/value receivers, embedded interfaces); a Python qualified base `other.Foo` must not match a local `Foo`; Python import candidates include `.pyi` and `src/` roots; TypeScript conditional `exports` stay unsupported (no fixed key order selection).
8. **Store, SQLite and indexer**:
   - Relation validation in `sqlite-graph-database.ts` (`relationEndpointsExist`) rejects a physical symbol as a `COVERS_SYMBOL` target; the relation is not persisted. The store has no diagnostic channel, so no diagnostic is emitted, and the indexer never produces such a target.
   - A forced or fingerprint-mismatch rebuild over a subset of workspaces clears only those workspaces: `IndexCodeGraph` passes `replaceCodeGraph` only when the run indexes every stored workspace (`replacesWholeGraph`), and otherwise removes the stored paths of the indexed workspaces.
   - A derivation fingerprint mismatch on a run that replaces the whole graph and owns its provider recreates storage physically and rotates the storage generation. `IndexOptions` gains `derivationMismatch?: 'rebuild' | 'fail'` (default `'rebuild'`, the in-place logical rebuild used by callers that hold an open provider). With `'fail'`, `IndexCodeGraph` throws the new `GraphDerivationMismatchError` (code `GRAPH_DERIVATION_MISMATCH`, field `reason`) before any write. `runIndexProjectGraph` passes `'fail'` when it owns the provider, catches the error, and re-runs inside a new `withOpenGraphProvider` whose `beforeOpen` calls `provider.recreate()` on the closed provider; the second run indexes an empty store and reports `fullRebuildReason` from the error. The error is exported from the public barrel and added to its allow-list test.
   - `LocalBinding` gains a required `range` (`SourceRange`), its id includes scope and range, and `local_bindings` persists `start_line`, `start_column`, `end_line`, `end_column` within schema version 15 (this change introduces version 15, so no bump). Adapters supply the binding's range from the parser node.
9. **Conformance and tests**: the adapter conformance suite covers all eleven mandated areas (lexical-scope distinctness, overload groups, retained occurrences, coverage after impact, imported-hierarchy provenance, no pass-2 I/O, incremental equivalence, plus the five already covered); `boundarySupport` flags drive assertions; the "non-conformant rejection" test fails an adapter that actually violates a rule; `AdapterRegistry` gets unit tests; tests that currently assert name-only CALLS behaviour are rewritten to the corrected contract.
10. **Formatting and docs**: run `pnpm format` on the 28 flagged files; update `docs/code-graph/index.md`, `docs/sdk/index.md` and `docs/cli/graph.md` where the typed selector, depth-0 coverage, candidate output and barrel exports are described.

### New scenario coverage

Each new verification scenario maps to an automated test: subset rebuild preserves other workspaces (indexer integration), barrel exports the enumerated list (code-graph barrel test), physical symbol rejected as coverage target (graph-store contract + SQLite), target's own coverage at depth 0 and public-binding canonical aggregation (traversal), overload selector returns one typed logical target (resolver), legacy summary fields derived after traversal and export/covering-spec locations projected (SDK).

## Verification round 3: corrective contract

A third compliance audit (four parallel batches, after build, lint and all suites were green) found defects that tests did not cover. The decisions below were made with the user. Every correction names the file, the symbol and the required behavior so this section is sufficient to implement it.

### Decisions

- **Self-healing index lock.** `packages/code-graph/src/infrastructure/index-lock.ts` currently stores `{version:1, pid, token}` but `assertGraphIndexUnlockedByStoragePath` only calls `existsSync` and `acquireGraphIndexLockLeaseByStoragePath` fails on `openSync(lockPath,'wx')` whenever the file exists. A process killed by SIGKILL, an out-of-memory kill or power loss leaves the lock forever. The lock record becomes version 2: `{version:2, pid, startedAt, token}` where `startedAt` is the owner's process start time as an opaque string (POSIX: `ps -o lstart= -p <pid>` output, normalised by trimming; Linux may read field 22 of `/proc/<pid>/stat`; where it cannot be obtained, omit it). Classification: **live** if `process.kill(pid, 0)` succeeds (or fails with `EPERM`, which means alive but not signalable) and, when both start times exist, they are equal; **stale** if the kill probe fails with `ESRCH`, or the start times differ (pid reuse), or the file is unreadable/malformed and older than 10 seconds. Version-1 records are judged by the kill probe only. Acquisition of a stale lock renames the file to a unique sibling name (atomic; exactly one contender wins the rename), unlinks the renamed file, then retries the exclusive `wx` creation once; if the retry loses, it throws `GraphBusyError`. `assertGraphIndexUnlockedByStoragePath` never removes a lock and does not throw for a stale lock. Recovery reports through an optional `onStaleLockRecovered(info)` callback supplied by the provider, which forwards it to the host logger as a warning; default is a no-op. `runIsolatedGraphIndex` contains no pid logic. Windows: `process.kill(pid,0)` is supported; `startedAt` is omitted and liveness alone decides.
- **Schema shape check.** `sqlite-graph-database.ts` open order: read persisted version and reject a mismatch before DDL; run DDL; verify required columns per table with `PRAGMA table_info` (a static `REQUIRED_COLUMNS` map generated next to the DDL in `schema.ts`, so DDL and check cannot drift); on any missing column close partial resources and throw `GraphSchemaIncompatibleError` with recovery reason `SCHEMA_INCOMPATIBLE`; then record the version and prepare FTS. `getStorageRecoveryReason` already maps that error, so ordinary reads and `graph index --force` reach the SDK recreate-and-retry path. `recreate()` removes only `code-graph.sqlite`, `-wal` and `-shm`, never `index.lock`, and rotates `storage.epoch`.
- **Exact ambiguity is listed and never traversed.** The code already does this; the spec's older "Multiple symbol matches" scenario and "listed sequentially" sentence are deleted. Candidates and `totalCandidates` count logical targets (overloads collapse), not declarations.
- **No `stale` flag on `COVERS_SYMBOL`.** Nothing writes or reads `metadata.stale`; the `SYMBOL_NOT_FOUND` coverage diagnostic is the only mechanism. The spec requirement "Relation staleness" is deleted. Tests asserting the old flag are updated.
- **Source-content search vs file result category.** Two scenarios said no file search category exists; source-content search exists. Both are reworded: no file _result category_ is added to symbol, spec and document search, and source-content search is served by its own index.
- **Barrel scenario title.** The scenario is retitled to what it asserts (enumerated names present, no forbidden internals). `barrel.spec.ts` keeps its explicit allow-list of pre-existing extras.

### Corrections required by existing specs (no spec change)

These violate requirements already in the merged specs; they are implementation work.

1. **Speculative edges (HIGH).** `scoped-binding-environment.ts` (fallback around lines 518-545, invoked from `index-code-graph.ts` around lines 1201-1237) resolves any unique workspace-wide simple name. Replace it with resolution through import-proven bindings or same-file scope only; an unimported `save()`, `helper()` or `new Thing()` MUST produce no `CALLS`/`CONSTRUCTS` edge.
2. **TypeScript public bindings (HIGH).** In `typescript-language-adapter.ts`, `export { local as alias }` binds the exported name to the declaration of `local`, `export { priv as pub }` produces a binding, and `export default` (named or anonymous) produces a `default` binding with the declaration as target. Star re-exports still skip `default`.
3. **Public-binding impact view (HIGH).** `analyzePublicBindingImpact` MUST resolve the binding to its target logical symbol and its declarations and traverse physical dependents from those declarations (including re-export chain steps recorded as `resolution_steps`); it MUST NOT depend on relations targeting binding ids, which the indexer never writes. Add an indexing-based test that builds a real index and asserts a non-empty public-binding view.
4. **Selector layer (HIGH).** `resolve-graph-selector.ts`: location-id and full-id selectors return a typed logical target; the `parentId`+name heuristic that merges getter/setter, static/instance and property/method pairs is removed (members are merged only when they share a logical id); `ResolvedGraphDeclarationSelector.target` becomes required; `promoteToLogicalTarget` no longer swallows store errors; the SDK drops the `getSymbol` declaration-target fallback and the `declarations[0]` shim.
5. **Local bindings (HIGH).** All four adapters currently advertise `localBindings: true` while emitting only module-scope import bindings with `targetId` undefined. The indexer fills `targetId` for import bindings from resolved imports in pass 2. Python also emits public bindings for its module-level exports, or stops advertising `publicBindings`.
6. **Logical id collisions (HIGH).** When two declarations collide without grouping evidence, only the colliding declarations are demoted to physical-only; their owner is not dropped and members keep a resolvable `ownerId`, so `qualified_name` is computed. Collision diagnostics are included in the index result. Applies to TS interface merges, class+interface merges and same-name classes in different namespaces.
7. **Routine-local and non-exported module state (HIGH).** Adapters emit these as lexical or physical-only declarations per the four-way classification; add adapter tests.
8. **PHP (HIGH).** `php-language-adapter.ts` tolerates array PSR-4 values (`"App\\": ["src/","lib/"]`) in `composer.json`; emits call facts for plain function calls and for `self::`, `static::`, `parent::` and `Class::` calls; hierarchy targets keep their written (possibly fully qualified) spelling.
9. **TypeScript (HIGH/MEDIUM).** Default and namespace imports produce file `IMPORTS`; `extends ns.Base` keeps the qualified spelling; same-name functions in different `namespace` blocks keep distinct logical ids; `.jsx` files get language `jsx`; parameters or locals that shadow a module function produce no `CALLS`.
10. **Go and Python (MEDIUM).** Go interface embedding claims `IMPLEMENTS` only when the struct has the embedded methods; Go blank imports (`_ "pkg"`) produce a dependency; parameter shadowing produces no `CALLS`. Python imports inside `try`, `if` and function bodies are captured; `from . import module` resolves.
11. **Traversal and store (MEDIUM).** `collectCoveringSpecs` in `analyze-file-impact.ts` never treats a physical declaration id as a logical id; symbol impact includes covering specs of the files of reached dependents; file impact under a specs-only filter reports real evidence and depth instead of `minDepth: 1` with empty evidence; the SQLite impact frontier keeps `COVERS_SYMBOL` targets as logical ids.
12. **Resolver (MEDIUM).** Use adapter-emitted hierarchy precedence so Python MRO ties are not ambiguous; do not block `missing` on unrelated global coverage incompleteness; gate unanchored uniqueness on stale health; support multi-dot qualified names.
13. **SDK and CLI (MEDIUM).** `runGraphImpact` reports `ambiguous` and `unresolved` resolutions instead of mapping everything to `not_found`; `from` surfaces containing `:` such as Windows paths are resolved as file selectors; CLI JSON for symbol output includes `kind` and `status`; the `--help` JSON schema is updated; count fields document logical versus physical units.
14. **Subset rebuild without `--force` (HIGH, probe first).** A subset run rewrites the root fingerprint (it hashes the workspace list) and the next whole-graph run then recreates the store. First reproduce with a test; then keep a per-run root fingerprint comparison scoped to the workspaces actually indexed so a subset run neither forces re-extraction nor overwrites the whole-graph fingerprint.
15. **Tests that pass vacuously.** `resolve-symbol-reference.spec.ts` "location-backed symbol id" asserts the opposite of its title; conformance "competing lexical scopes" compares `0 === 0`; the cycle-detection test queries a name that does not exist; `barrel.spec.ts` allow-list is reviewed. Each is rewritten to fail when the behavior is wrong.

### Documentation

Update `docs/code-graph/index.md` (lock recovery, schema shape recovery, symbol impact semantics), `docs/cli/graph.md` (ambiguous output, JSON fields) and `docs/sdk/index.md` (`runGraphImpact` example uses the real result shape, fail-then-recreate-then-retry flow, subset rule).

### Deferred (unchanged)

TS function overload signatures, Go `IMPLEMENTS` method-set beyond embedded interfaces, Python `src/` layout candidates, PHP optional/chained calls, Go generic calls, and the `WHOLE_FILE_START` import binding range remain declared partials.

## Verification round 4: corrective contract

Full verification of round 3 found one failing scenario, one implementation gap, two
spec/code drifts, and 23 scenarios without a test that would fail if the behaviour were
wrong. This section is the complete contract for closing them.

### Decisions

- **Imported hierarchy range is the clause expression range.** The shared hierarchy fact
  and the persisted `EXTENDS`/`IMPLEMENTS`/trait `USES_TYPE` relation carry the
  parser range of the written base expression (Python base in `class C(Base)`, TypeScript
  heritage type expression in `extends ns.Base`, PHP written name in `extends`,
  `implements`, or `use Trait`), not the child declaration range. Rejected: keeping the
  child range and relaxing the spec, because two different bases of one class would then
  share one range and the evidence could not point at the clause that proved the edge.
- **Public export results expose and project covering specs.** Rejected: dropping the
  requirement, because hosts render coverage for every other impact kind.
- **The composition spec follows the published barrel.** The exact runtime value list is
  the barrel test's allow-list; the spec now enumerates it. Rejected: trimming the barrel,
  because `@specd/sdk` imports `SymbolSpace`, `createLogicalSymbol`, and related values
  from `@specd/code-graph`.
- **`files` search is source-content matching that is not a symbol.** The `GraphStore`
  search methods `searchSymbols`, `searchSpecs`, and `searchDocuments` never return a
  persisted-file category; `SearchCodeGraph.searchFiles` builds the `files` category from
  `searchSourceContentCandidates` only. No code change; a test pins the boundary.

### Corrections by area

1. **Shared metadata helper.** `createImportedHierarchyMetadata` in
   `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`:

   ```ts
   // Before
   export function createImportedHierarchyMetadata(input: {
     readonly source: SymbolNode
     readonly precedence: number
     readonly requestedName: string
     readonly resolvedTargetSymbolId: string
   }): Readonly<Record<string, unknown>>
   // After
   export function createImportedHierarchyMetadata(input: {
     readonly clauseRange: SourceRange // from '../../domain/value-objects/symbol-node.js'
     readonly precedence: number
     readonly requestedName: string
     readonly resolvedTargetSymbolId: string
   }): Readonly<Record<string, unknown>>
   ```

   `sourceRange` is `{ startLine, startColumn, endLine, endColumn }` copied from
   `clauseRange` (1-based lines, 0-based columns, the same convention as symbol ranges:
   `node.range().start.line + 1`). Callers: TypeScript (2), Python (1), PHP (3). Risk:
   LOW, internal helper.

2. **TypeScript.** `TsTypeDeclarationInfo` gains `readonly extendsRanges: readonly
SourceRange[]` and `readonly implementsRanges: readonly SourceRange[]`, index-aligned
   with `extendsNames`/`implementsNames`. `parseTypeNames` callers in
   `collectTypeDeclarations` derive each range from the corresponding type node of the
   `extends_clause` / `implements_clause` (one node per comma-separated entry; when the
   clause has a single entry, its value node). `buildRelations` passes
   `declaration.extendsRanges[precedence]` (and the implements equivalent) to the helper.
   Parser state written by older builds is not compatible; a missing range array is treated
   as "no imported metadata" (the relation is still emitted with `{ precedence }`).
3. **Python.** `PythonClassInfo` gains `readonly baseRanges: readonly SourceRange[]`
   aligned with `baseNames`, filled from each argument node of the class `argument_list`
   where `baseNames.push(rawText)` happens today. The imported base relation passes
   `baseRanges[precedence]`.
4. **PHP.** `PhpTypeInfo` and `SerializedPhpTypeInfo` gain `extendsRanges`,
   `implementsRanges`, and `traitRanges` aligned with the written-name arrays, filled from
   the `name`/`qualified_name` node whose text is pushed. The three relation sites pass the
   aligned range.
5. **SDK export covering specs.** In `packages/sdk/src/orchestration/run-graph-impact.ts`:
   `ProjectedPublicImpactDetail` gains `readonly coveringSpecs?: readonly
ProjectedCoveringSpecImpact[] | undefined`; `ResolvedPublicExportImpactResult` gains
   `readonly coveringSpecs: readonly ProjectedCoveringSpecImpact[]`. The export branch
   sets `canonicalImpact.coveringSpecs` and the top-level `coveringSpecs` to
   `projectCoveringSpecs(config, result.canonicalImpact.coveringSpecs)`; the exact-route
   `bindingImpact` keeps `affectedSpecs` only, because `ImpactResult` carries no evidence.
   The CLI export text output appends `formatCoveringSpecs(result.coveringSpecs)`; JSON and
   TOON pass the field through. Risk: LOW, additive fields.
6. **Composition spec.** Text only (already applied to the spec delta).
7. **Graph-store search boundary.** Scenario text only (already applied); test below.

### Documentation

`docs/sdk/index.md` and `docs/cli/graph.md`: state that public export results include
projected `coveringSpecs`. `docs/code-graph/index.md`: state that imported hierarchy
evidence carries the range of the base/heritage clause expression.

### Tests closing round-4 findings

Each test must fail if the behaviour regresses.

- `reference-fact-helpers.spec.ts`: the helper copies `clauseRange` verbatim.
- TypeScript, Python, PHP adapter specs: an imported base on a multi-base or
  multi-heritage class records, for each edge, the range of its own clause expression
  (asserted by line/column of the base text), equal on the relation and the session
  hierarchy fact.
- `sdk/run-graph-impact.spec.ts`: a resolved export returns top-level and canonical
  `coveringSpecs` with `projectRelativePath` on file evidence; CLI JSON passes them and
  text prints them.
- `search-code-graph` use-case test: a query matching only non-symbol source text returns
  it under `files`, never under `symbols`, and the `GraphStore` search methods expose no
  file category.
- Manifest isolation (TypeScript `package.json`, Python `pyproject.toml`, Go `go.mod`, PHP
  `composer.json`): a manifest whose text contains declaration-, call-, and import-like
  strings produces no symbols, call facts, imports, or relations for the manifest path,
  and source analysis of a sibling file is unchanged.
- Erroneous source: a file with a syntax error yields no fact for the broken construct and
  keeps facts for intact constructs (one fixture per adapter).
- TypeScript: `function process(){ const result = Service.run() }` keeps `process` as the
  caller and emits no logical declaration for `result`; multiline imports, type
  references, and heritage clauses resolve, while the same text inside comments and
  template literals yields no import, type, or hierarchy fact.
- PHP: a call inside a method after `$x = foo();` has the method as `callerSymbolId`; two
  classes with methods on one line keep distinct owners and column-correct callers; brace
  and keyword lookalikes in strings and heredocs do not alter class or method ranges.
- Traversal: one logical target reached at depths 1 and 2 is reported once at depth 1;
  the coverage frontier receives one `CoversSymbol` query whose frontier contains each
  logical id once and no physical id.
- Graph store and SQLite: a physical-only declaration id stays retrievable through
  `getSymbol` and has no row in `logical_declarations`.
- Indexer: `FileNode.projectRelativePath` for a workspace under the project root, and
  `../../...` for a code root outside it.
- Index lock: two contenders recovering one stale lock in-process (rename race forced by
  an injected first rename failure) elect exactly one owner; the other raises
  `GraphBusyError`.
- CLI: an exact declaration selector renders `declaration impact`; structured output with
  non-empty `semanticAffectedTargets` keeps projected nested evidence.
- `symbol-reference.spec.ts` identity-layer tests are rewritten to call the real factories
  so they fail on a regression.

## Testing

### Automated tests

- Identity unit tests assert location-independent logical IDs, partial mapping, owner-first construction, occurrence-form independence, overload grouping, missing/empty/different group-key non-grouping, `UNGROUPED_LOGICAL_COLLISION`, group-key conflict handling, and duplicate-mapping rejection.
- Shared adapter conformance tests run every registered built-in adapter through: local binding before call, same-line declarations, nested callable containment, multiline calls, exclusive range end, missing caller, owner isolation, declaration movement, physical-only evidence, and identity stability. Adding an adapter to the registry without this suite entry fails the test.
- TypeScript tests cover block-scoped `const`, function-scoped `var`, parameters, destructuring, nested same-name functions, overload signatures plus implementation, class/interface members, aliases, construction receivers, and exported/module declarations.
- TypeScript structural tests additionally cover optional/computed/generic/chained/multiline calls, dynamic import and `require`, bounded type text, heritage clauses, comment/template lookalikes, named-object property retention, anonymous argument-object omission, unresolved imports producing no relation, and imported hierarchy relation/fact provenance parity. The exact `await expect(uc.execute({ name: 'my-change' })).rejects.toThrow()` fixture asserts no `name` symbol/binding/logical target, a real `ArchiveChange.execute` target, and either a physical callback caller or unresolved caller—never `variable:name`.
- Python tests cover assignments, comprehensions, nested functions, methods, decorators, lambdas, imports, class ownership, multiline annotations/bases/calls, string/comment lookalikes, unresolved imports producing no relation, imported-base provenance parity, and isolation of `pyproject.toml` parsing.
- Go tests cover short declarations, receivers, package functions, interface methods, function literals, rejection of overload-like same-name grouping, grouped/multiline imports, unresolved raw specifiers producing no relation, selector calls, composite literals, braces/call text in strings/comments, and isolation of `go.mod` parsing.
- PHP tests cover local assignments, namespace imports, framework aliases, same-line methods/classes, closures, properties/constants/enum cases, traits, dynamic-container non-resolution, multiline/compact syntax, heredoc/comment lookalikes, AST-backed registered framework loaders, unresolved loaders producing no relation, imported hierarchy provenance parity, Pass 2 with filesystem access instrumented to zero calls, consecutive-session isolation, and Composer metadata prepared only in session setup.
- Scoped environment tests assert that lexical bindings never become callers and unproven callers emit no guessed relation.
- Resolver tests assert logical versus declaration discriminants, complete declaration sets, exact locations, ambiguity at the correct layer, compatibility projection, and all reason codes.
- Traversal tests assert all-declaration seeding, shallowest logical depth, physical evidence retention, exact-impact non-widening, semantic count/risk stability when adding an equivalent declaration, physical-only affected targets, batched logical coverage, and an all-physical-only traversal that never invokes the logical coverage store method.
- Store contract tests run against typed in-memory and SQLite implementations for ordering, duplicate input, unknown IDs, empty no-work behavior, reverse mappings, and strict logical coverage IDs.
- SQLite worker/store tests assert one RPC per mapping/coverage batch, internal SQL chunking, schema-15 occurrence-form round trips, schema 15 opening without rebuild, schema 14 read rejection followed by index-mode rebuild to 15, rejection of versions below 14 and above 15, absence of `ALTER TABLE`, equal-looking physical/logical ID separation, deterministic merge order, and worker responsiveness.
- Incremental integration tests apply body edit, move, signature edit, overload addition/removal, owner change, rename, deletion, addition, and previously unresolved-to-resolved changes; normalized state must equal a clean rebuild and contain no dangling physical relation.
- Provider tests assert lifecycle/freshness handling and delegation of the complete resolved target without recomputation.
- SDK tests use a complete typed provider and assert no traversal for ambiguous/unresolved selectors, no `declarations[0]`/physical fallback for logical targets, recursive projection of every nested location without extra reads, complete logical result shape, exact declaration semantics, public binding separation, and compatibility fields.
- CLI tests assert text labels and declaration summaries, deterministic ambiguity output, JSON/TOON field preservation, no independent graph query, and coverage rendering.
- Documentation coverage tests assert updates to `docs/code-graph/index.md`, `docs/sdk/index.md`, `docs/cli/graph.md`, and ADR 0029.

All behavior test descriptions use `given ..., when ..., then ...`; no snapshots are permitted. Unit tests use complete typed ports and no I/O. SQLite integration tests use portable temporary directories and `node:path`.

### Manual / E2E verification

1. Build: `pnpm build`. Expected: all strict TypeScript packages compile with no `any`, optional-property, or barrel errors.
2. Focused tests: `pnpm --filter @specd/code-graph test`, `pnpm --filter @specd/sdk test`, and `pnpm --filter @specd/cli test`. Expected: all identity, adapter, store, SDK, CLI, and documentation tests pass.
3. Full validation: `pnpm test` and `pnpm lint`. Expected: zero failures.
4. Re-index: `node packages/cli/dist/index.js graph index --format toon`. Expected: schema 15 is current, no parse failures, and the index completes without dangling-relation diagnostics.
5. Query `.specd/config/graph/code-graph.sqlite` for `CALLS` whose source joins a parentless `variable:name` and whose target is `ArchiveChange.execute`. Expected: zero rows. Independently count call facts from the two ArchiveChange test files to that target. Expected: all 63 plus 9 source call sites remain represented when their targets resolve; relation-row counts may be lower only where the existing `(source,target,type)` relation identity deduplicates repeated calls from the same physical caller. No anonymous argument key appears in `symbols`.
6. Logical impact: `node packages/cli/dist/index.js graph impact --symbol "Change.execute" --format json`. Expected: `resolvedTarget.kind` is `logical-target`, all declaration locations are present, logical and physical counts are separately named, and covering symbol evidence uses logical IDs.
7. Exact impact using a fixture’s file-position selector. Expected: output identifies declaration impact and does not widen to sibling overload declarations.
8. Run the same logical command with `--format text` and `--format toon`. Expected: text labels the logical target and declarations; TOON preserves the JSON semantic fields.
9. Apply one identity-sensitive fixture mutation, run incremental index, export normalized reference facts/relations, rebuild clean, and compare. Expected: equality of logical symbols, declarations/forms, bindings, relations, evidence, and coverage.

Failure indicators are a caller ID belonging to a variable/parameter/object key, any anonymous argument key stored as a declaration, a source fact created from comment/string/template/heredoc text, logical ambiguity caused only by overload declarations, differing risk after adding an equivalent signature, `COVERS_SYMBOL` queried with a physical ID, one worker request per symbol, dangling relations after incremental indexing, or CLI/SDK loss of declaration evidence.

### Round 3 tests

- `index-lock.spec.ts`: dead pid is recovered; reused pid with different `startedAt` is recovered; live owner keeps the lock and raises `GraphBusyError`; `assertGraphIndexUnlocked` neither throws nor removes a stale lock; two concurrent recoveries elect exactly one owner; `EPERM` probe counts as live; version-1 record judged by pid; recovery callback invoked once. A real child process killed with SIGKILL leaves a lock that the next acquisition recovers.
- `isolated-index-worker.spec.ts`: a run after a crashed run proceeds and the supervisor contains no pid inspection.
- `sqlite-graph-store` contract: a version-15 database whose `local_bindings` lacks `start_line` fails open with `GraphSchemaIncompatibleError`/`SCHEMA_INCOMPATIBLE`; `graph index` with and without `--force` recreates and completes; `recreate()` leaves `index.lock` and rotates `storage.epoch`.
- `cli graph-impact`: several exact matches list candidates (logical count) and do no traversal; overloads of one symbol are analyzed.
- `graph-store` contract and indexer: an unresolved coverage symbol is rejected with `SYMBOL_NOT_FOUND` and no relation carries `stale`.
- Adapter and indexer tests for every numbered correction above, each asserting the negative case that previously passed vacuously (no edge for an unimported name, a real non-empty public-binding view, a resolvable `ownerId` after a collision, no `CALLS` for a shadowed name).
