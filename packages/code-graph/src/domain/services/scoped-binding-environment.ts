import {
  type BindingFact,
  type BindingScope,
  BindingSourceKind,
} from '../value-objects/binding-fact.js'
import { CallForm, type CallFact, type ResolvedDependency } from '../value-objects/call-fact.js'
import { type ImportDeclaration } from '../value-objects/import-declaration.js'
import { RelationType } from '../value-objects/relation-type.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'

/**
 * Read-only symbol lookup backed by the indexer's in-memory symbol index.
 */
export interface SymbolLookup {
  /**
   * Finds symbols by exact name, optionally constrained to a file path prefix.
   * @param name - Symbol name to find.
   * @param filePrefix - Optional workspace or file path prefix.
   * @returns Matching symbols in deterministic order.
   */
  findByName(name: string, filePrefix?: string): readonly SymbolNode[]

  /**
   * Finds all symbols declared in one workspace-prefixed file.
   * @param filePath - File path to inspect.
   * @returns Symbols declared in the file.
   */
  findByFile(filePath: string): readonly SymbolNode[]
}

/**
 * Input for building a per-file scoped binding environment.
 */
export interface BuildScopedBindingEnvironmentInput {
  readonly filePath: string
  readonly symbols: readonly SymbolNode[]
  readonly imports: readonly ImportDeclaration[]
  readonly importMap: ReadonlyMap<string, string>
  readonly scopes: readonly BindingScope[]
  readonly facts: readonly BindingFact[]
  readonly symbolLookup: SymbolLookup
}

/**
 * Pure scoped binding lookup environment for one indexed source file.
 */
export interface ScopedBindingEnvironment {
  /**
   * Looks up visible binding facts by name from a lexical scope.
   * @param name - Visible binding name to resolve.
   * @param scopeId - Starting scope id, or undefined for file/global lookup.
   * @returns Deterministic visible facts, or an empty array.
   */
  lookup(name: string, scopeId: string | undefined): readonly BindingFact[]

  /**
   * Resolves a binding fact to a deterministic target symbol.
   * @param fact - Binding fact to resolve.
   * @returns Resolved target symbol, or undefined when unresolved or ambiguous.
   */
  resolveTargetSymbol(fact: BindingFact): SymbolNode | undefined

  /**
   * Resolves a member/static call receiver to deterministic binding facts.
   * @param call - Call fact containing the receiver name.
   * @returns Visible receiver binding facts, or an empty array.
   */
  resolveReceiver(call: CallFact): readonly BindingFact[]
}

/**
 * Input for resolving binding and call facts into persisted dependency edges.
 */
export interface ResolveDependencyFactsInput {
  readonly environment: ScopedBindingEnvironment
  readonly bindingFacts: readonly BindingFact[]
  readonly callFacts: readonly CallFact[]
  readonly symbols: readonly SymbolNode[]
  readonly symbolLookup: SymbolLookup
}

/**
 * Builds a scoped binding environment from adapter facts and in-memory symbols.
 * @param input - Per-file binding environment inputs.
 * @returns A pure lookup environment for the file.
 */
export function buildScopedBindingEnvironment(
  input: BuildScopedBindingEnvironmentInput,
): ScopedBindingEnvironment {
  const rootScopeId = findRootScopeId(input)
  const scopesById = new Map(input.scopes.map((scope) => [scope.id, scope]))
  const factsByScopeAndName = groupFactsByScopeAndName([
    ...input.facts,
    ...buildImportBindingFacts(input, rootScopeId),
  ])
  const symbolsById = new Map(input.symbols.map((symbol) => [symbol.id, symbol]))

  return {
    lookup: (name, scopeId) =>
      lookupBindingFacts(name, scopeId ?? rootScopeId, scopesById, factsByScopeAndName),
    resolveTargetSymbol: (fact) => resolveBindingTarget(fact, input.symbolLookup, symbolsById),
    resolveReceiver: (call) =>
      resolveReceiverFacts(
        call,
        scopeIdOrRoot(call.scopeId, rootScopeId),
        scopesById,
        factsByScopeAndName,
        input.symbolLookup,
        symbolsById,
      ),
  }
}

/**
 * Resolves deterministic binding and call facts into dependency relations.
 * @param input - Facts and lookup dependencies needed for resolution.
 * @returns Resolved dependency edges in deterministic order.
 */
export function resolveDependencyFacts(
  input: ResolveDependencyFactsInput,
): readonly ResolvedDependency[] {
  const dependencies: ResolvedDependency[] = []
  const seen = new Set<string>()

  for (const fact of input.bindingFacts) {
    if (!isTypeUseSource(fact.sourceKind)) continue
    const sourceSymbol = findEnclosingSymbol(fact.filePath, fact.location.line, input.symbols)
    const targetSymbol = input.environment.resolveTargetSymbol(fact)
    if (sourceSymbol === undefined || targetSymbol === undefined) continue
    addDependency(dependencies, seen, {
      sourceSymbolId: sourceSymbol.id,
      targetSymbolId: targetSymbol.id,
      relationType: RelationType.UsesType,
      reason: `type binding:${fact.sourceKind}`,
      location: fact.location,
    })
  }

  for (const call of input.callFacts) {
    const sourceSymbol =
      findSymbolById(call.callerSymbolId, input.symbols) ??
      findEnclosingSymbol(call.filePath, call.location.line, input.symbols)
    const targetSymbol = resolveCallTarget(call, input.environment, input.symbolLookup)
    if (sourceSymbol === undefined || targetSymbol === undefined) continue
    const relationType =
      call.form === CallForm.Constructor ? RelationType.Constructs : RelationType.Calls
    addDependency(dependencies, seen, {
      sourceSymbolId: sourceSymbol.id,
      targetSymbolId: targetSymbol.id,
      relationType,
      reason: `call:${call.form}`,
      location: call.location,
    })
  }

  return dependencies
}

/**
 * Resolves the root scope id for a file, using an explicit file scope when present.
 * @param input - Build input containing scopes and file path.
 * @returns Root scope identifier.
 */
function findRootScopeId(input: BuildScopedBindingEnvironmentInput): string {
  return input.scopes.find((scope) => scope.parentId === undefined)?.id ?? input.filePath
}

/**
 * Builds binding facts from resolved imports so shared lookup can see them.
 * @param input - Build input containing import declarations and import map.
 * @param rootScopeId - File root scope id.
 * @returns Import-derived binding facts.
 */
function buildImportBindingFacts(
  input: BuildScopedBindingEnvironmentInput,
  rootScopeId: string,
): BindingFact[] {
  const facts: BindingFact[] = []

  for (const declaration of input.imports) {
    if (declaration.localName.length === 0) continue
    const targetSymbolId = input.importMap.get(declaration.localName)
    if (targetSymbolId === undefined) continue
    facts.push({
      name: declaration.localName,
      filePath: input.filePath,
      scopeId: rootScopeId,
      sourceKind: BindingSourceKind.ImportedType,
      location: {
        filePath: input.filePath,
        line: 1,
        column: 0,
        endLine: undefined,
        endColumn: undefined,
      },
      targetName: declaration.originalName,
      targetSymbolId,
      targetFilePath: undefined,
      metadata: { specifier: declaration.specifier },
    })
  }

  return facts
}

/**
 * Groups facts by scope and visible name.
 * @param facts - Binding facts to group.
 * @returns Nested lookup map keyed by scope id and binding name.
 */
function groupFactsByScopeAndName(
  facts: readonly BindingFact[],
): ReadonlyMap<string, ReadonlyMap<string, readonly BindingFact[]>> {
  const mutable = new Map<string, Map<string, BindingFact[]>>()

  for (const fact of facts) {
    const byName = mutable.get(fact.scopeId) ?? new Map<string, BindingFact[]>()
    const list = byName.get(fact.name) ?? []
    list.push(fact)
    byName.set(fact.name, list)
    mutable.set(fact.scopeId, byName)
  }

  for (const byName of mutable.values()) {
    for (const [name, factsForName] of byName) {
      byName.set(name, sortFacts(factsForName))
    }
  }

  return mutable
}

/**
 * Sorts binding facts by source location for deterministic output.
 * @param facts - Facts to sort.
 * @returns Sorted facts.
 */
function sortFacts(facts: readonly BindingFact[]): BindingFact[] {
  return [...facts].sort((left, right) => {
    if (left.location.line !== right.location.line) return left.location.line - right.location.line
    if (left.location.column !== right.location.column) {
      return left.location.column - right.location.column
    }
    return left.name.localeCompare(right.name)
  })
}

/**
 * Looks up visible binding facts by walking nearest scope to root scope.
 * @param name - Binding name to resolve.
 * @param scopeId - Starting scope id.
 * @param scopesById - Scope lookup map.
 * @param factsByScopeAndName - Grouped fact lookup map.
 * @returns Deterministic visible facts, or an empty array for ambiguity/unresolved names.
 */
function lookupBindingFacts(
  name: string,
  scopeId: string,
  scopesById: ReadonlyMap<string, BindingScope>,
  factsByScopeAndName: ReadonlyMap<string, ReadonlyMap<string, readonly BindingFact[]>>,
): readonly BindingFact[] {
  let currentScopeId: string | undefined = scopeId

  while (currentScopeId !== undefined) {
    const candidates = factsByScopeAndName.get(currentScopeId)?.get(name) ?? []
    const deterministic = selectDeterministicFacts(candidates)
    if (deterministic !== undefined) return deterministic
    currentScopeId = scopesById.get(currentScopeId)?.parentId
  }

  return []
}

/**
 * Selects facts only when same-scope candidates do not contain conflicting targets.
 * @param candidates - Same-scope binding fact candidates.
 * @returns Deterministic facts, undefined when lookup should continue, or empty array when ambiguous.
 */
function selectDeterministicFacts(
  candidates: readonly BindingFact[],
): readonly BindingFact[] | undefined {
  if (candidates.length === 0) return undefined

  const byTarget = new Map<string, BindingFact>()
  for (const candidate of candidates) {
    const key =
      candidate.targetSymbolId ??
      candidate.targetName ??
      candidate.targetFilePath ??
      `${candidate.sourceKind}:${candidate.name}`
    byTarget.set(key, candidate)
  }

  if (byTarget.size > 1) return []
  return [...byTarget.values()]
}

/**
 * Returns a provided scope id or the root scope id.
 * @param scopeId - Optional starting scope id.
 * @param rootScopeId - File root scope id.
 * @returns Effective scope id.
 */
function scopeIdOrRoot(scopeId: string | undefined, rootScopeId: string): string {
  return scopeId ?? rootScopeId
}

/**
 * Resolves one binding fact to a deterministic target symbol.
 * @param fact - Binding fact to resolve.
 * @param symbolLookup - In-memory symbol lookup.
 * @param localSymbolsById - Local symbols indexed by id.
 * @returns Target symbol, or undefined when unresolved/ambiguous.
 */
function resolveBindingTarget(
  fact: BindingFact,
  symbolLookup: SymbolLookup,
  localSymbolsById: ReadonlyMap<string, SymbolNode>,
): SymbolNode | undefined {
  if (fact.targetSymbolId !== undefined) {
    const local = localSymbolsById.get(fact.targetSymbolId)
    if (local !== undefined) return local
  }

  if (fact.targetName === undefined) return undefined

  const candidates = findTargetCandidates(fact, symbolLookup)
  const matchingId =
    fact.targetSymbolId === undefined
      ? candidates
      : candidates.filter((candidate) => candidate.id === fact.targetSymbolId)
  if (matchingId.length === 1) return matchingId[0]
  return undefined
}

/**
 * Finds target candidates for a binding fact.
 * @param fact - Binding fact to resolve.
 * @param symbolLookup - In-memory symbol lookup.
 * @returns Candidate symbols in deterministic order.
 */
function findTargetCandidates(
  fact: BindingFact,
  symbolLookup: SymbolLookup,
): readonly SymbolNode[] {
  if (fact.targetFilePath !== undefined) {
    return symbolLookup
      .findByFile(fact.targetFilePath)
      .filter((symbol) => symbol.name === fact.targetName)
  }

  const workspacePrefix = extractWorkspacePrefix(fact.filePath)
  return symbolLookup.findByName(fact.targetName ?? fact.name, workspacePrefix)
}

/**
 * Extracts a workspace prefix suitable for symbol lookup.
 * @param filePath - Workspace-prefixed file path.
 * @returns Prefix including `:`, or undefined when no prefix exists.
 */
function extractWorkspacePrefix(filePath: string): string | undefined {
  const index = filePath.indexOf(':')
  return index === -1 ? undefined : filePath.substring(0, index + 1)
}

/**
 * Resolves receiver binding facts for a member/static call.
 * @param call - Call fact with a receiver name.
 * @param scopeId - Effective starting scope id.
 * @param scopesById - Scope lookup map.
 * @param factsByScopeAndName - Grouped binding facts.
 * @param symbolLookup - In-memory symbol lookup.
 * @param localSymbolsById - Local symbols indexed by id.
 * @returns Deterministic receiver facts with resolvable targets.
 */
function resolveReceiverFacts(
  call: CallFact,
  scopeId: string,
  scopesById: ReadonlyMap<string, BindingScope>,
  factsByScopeAndName: ReadonlyMap<string, ReadonlyMap<string, readonly BindingFact[]>>,
  symbolLookup: SymbolLookup,
  localSymbolsById: ReadonlyMap<string, SymbolNode>,
): readonly BindingFact[] {
  if (call.receiverName === undefined) return []
  const facts = lookupBindingFacts(call.receiverName, scopeId, scopesById, factsByScopeAndName)
  if (facts.length === 0) return []
  return facts.filter((fact) => resolveBindingTarget(fact, symbolLookup, localSymbolsById))
}

/**
 * Returns whether a binding source represents a static type-use dependency.
 * @param sourceKind - Binding source kind to inspect.
 * @returns True when the fact should emit USES_TYPE if resolved.
 */
function isTypeUseSource(sourceKind: BindingSourceKind): boolean {
  return (
    sourceKind === BindingSourceKind.Parameter ||
    sourceKind === BindingSourceKind.ReturnType ||
    sourceKind === BindingSourceKind.Property ||
    sourceKind === BindingSourceKind.ImportedType ||
    sourceKind === BindingSourceKind.ClassManaged ||
    sourceKind === BindingSourceKind.Inherited ||
    sourceKind === BindingSourceKind.FrameworkManaged
  )
}

/**
 * Adds a dependency unless an equivalent source/type/target edge already exists.
 * @param dependencies - Dependency accumulator.
 * @param seen - Deduplication key set.
 * @param dependency - Dependency to add.
 */
function addDependency(
  dependencies: ResolvedDependency[],
  seen: Set<string>,
  dependency: ResolvedDependency,
): void {
  if (dependency.sourceSymbolId === dependency.targetSymbolId) return
  const key = `${dependency.sourceSymbolId}:${dependency.relationType}:${dependency.targetSymbolId}`
  if (seen.has(key)) return
  seen.add(key)
  dependencies.push(dependency)
}

/**
 * Finds a local symbol by id when the id is known.
 * @param symbolId - Optional symbol id.
 * @param symbols - Local symbols to inspect.
 * @returns Matching symbol, or undefined.
 */
function findSymbolById(
  symbolId: string | undefined,
  symbols: readonly SymbolNode[],
): SymbolNode | undefined {
  if (symbolId === undefined) return undefined
  return symbols.find((symbol) => symbol.id === symbolId)
}

/**
 * Finds the innermost symbol that starts before a source line in the same file.
 * @param filePath - Workspace-prefixed file path.
 * @param line - One-based source line.
 * @param symbols - Symbols to inspect.
 * @returns Best enclosing symbol candidate.
 */
function findEnclosingSymbol(
  filePath: string,
  line: number,
  symbols: readonly SymbolNode[],
): SymbolNode | undefined {
  return [...symbols]
    .filter((symbol) => symbol.filePath === filePath && symbol.line <= line)
    .sort((left, right) => {
      if (left.line !== right.line) return right.line - left.line
      return right.column - left.column
    })[0]
}

/**
 * Resolves a call fact to a deterministic target symbol.
 * @param call - Call fact to resolve.
 * @param environment - Scoped binding environment.
 * @param symbolLookup - In-memory symbol lookup.
 * @returns Target symbol, or undefined when unresolved/ambiguous.
 */
function resolveCallTarget(
  call: CallFact,
  environment: ScopedBindingEnvironment,
  symbolLookup: SymbolLookup,
): SymbolNode | undefined {
  const targetName = call.targetName ?? call.name

  if (call.form === CallForm.Member || call.form === CallForm.Static) {
    const receiverFacts = environment.resolveReceiver(call)
    const receiverTargets = receiverFacts
      .map((fact) => environment.resolveTargetSymbol(fact))
      .filter((symbol): symbol is SymbolNode => symbol !== undefined)
    const symbols = receiverTargets.flatMap((receiver) =>
      symbolLookup.findByFile(receiver.filePath).filter((symbol) => symbol.name === call.name),
    )
    return selectSingleSymbol(symbols)
  }

  const bindingTargets = environment
    .lookup(targetName, call.scopeId)
    .map((fact) => environment.resolveTargetSymbol(fact))
    .filter((symbol): symbol is SymbolNode => symbol !== undefined)
  const bindingTarget = selectSingleSymbol(bindingTargets)
  if (bindingTarget !== undefined) return bindingTarget

  return selectSingleSymbol(
    symbolLookup.findByName(targetName, extractWorkspacePrefix(call.filePath)),
  )
}

/**
 * Selects one symbol candidate only when resolution is deterministic.
 * @param symbols - Candidate symbols.
 * @returns Single deterministic symbol, or undefined.
 */
function selectSingleSymbol(symbols: readonly SymbolNode[]): SymbolNode | undefined {
  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]))
  return byId.size === 1 ? [...byId.values()][0] : undefined
}
