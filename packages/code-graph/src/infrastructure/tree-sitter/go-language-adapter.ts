import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type AdapterDeclarationPolicy,
  type ImportResolutionContext,
  type ResolvedImports,
  type RelationBuildContext,
} from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'
import { splitWorkspaceIdentity } from '../../domain/services/split-workspace-identity.js'
import {
  parseDottedMemberReference,
  renderDottedMemberReference,
} from '../../domain/services/parse-member-reference.js'
import { type IndexSession } from '../../domain/value-objects/index-session.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../domain/value-objects/import-declaration-kind.js'
import { BindingSourceKind, type BindingFact } from '../../domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../domain/value-objects/call-fact.js'
import { type SourceLocation } from '../../domain/value-objects/source-location.js'
import { ensureLanguagesRegistered } from './register-languages.js'
import {
  type FileAnalysisDraft,
  type FileAnalysis,
} from '../../domain/value-objects/file-analysis.js'
import {
  MemberDispatch,
  MemberKind,
  SymbolSpace,
  createLocalBinding,
  createPublicBinding,
  type AdapterCapabilities,
  type LogicalSymbol,
  type ParsedSymbolReference,
  type ReferenceFacts,
} from '../../domain/value-objects/symbol-reference.js'
import {
  buildHierarchyReferenceFacts,
  buildLogicalDeclarationFacts,
  containsSymbolRange,
  createAdapterDeclarationDescriptor,
  createPhysicalOnlyDeclarationDescriptor,
  findContainingCallableSymbol,
  type AdapterHierarchyDescriptor,
  withOwnerParents,
  withEnclosingTypeParents,
  WHOLE_FILE_START,
} from './reference-fact-helpers.js'

const GO_CALLABLE_KINDS = new Set<SymbolKind>([SymbolKind.Function, SymbolKind.Method])

/**
 * Determines whether an import declaration is file-only/side-effect only.
 * @param declaration - The import declaration to test.
 * @returns True if the import has no bound local name/is side-effect only.
 */
function isFileOnlyImport(declaration: ImportDeclaration): boolean {
  return (
    declaration.kind === ImportDeclarationKind.SideEffect ||
    declaration.kind === ImportDeclarationKind.Dynamic ||
    declaration.kind === ImportDeclarationKind.Require ||
    declaration.kind === ImportDeclarationKind.Blank
  )
}

/**
 * Collects identifiers bound by a Go parameter list or declaration left-hand side.
 * @param node - Parameter list, expression list, or var spec subtree.
 * @param names - Accumulator of bound names.
 */
function collectGoBoundNames(node: SgNode, names: Set<string>): void {
  const kind = nodeKind(node)
  if (kind === 'identifier') {
    names.add(node.text().trim())
    return
  }
  if (kind === 'type_identifier' || kind === 'qualified_type') return
  if (kind === 'parameter_declaration' || kind === 'variadic_parameter_declaration') {
    for (const child of node.children()) {
      if (nodeKind(child) === 'identifier') names.add(child.text().trim())
    }
    return
  }
  for (const child of node.children()) collectGoBoundNames(child, names)
}

/**
 * Returns whether a bare call target is rebound by a parameter or function-local declaration
 * enclosing the call, so it cannot reach a package-level or imported callable.
 * @param node - Call node.
 * @param name - Callee identifier.
 * @returns True when an enclosing parameter, `:=`, or `var` binds the name.
 */
function isGoShadowedByEnclosingScope(node: SgNode, name: string): boolean {
  let current = node.parent()
  while (current !== null) {
    const kind = nodeKind(current)
    if (
      kind === 'function_declaration' ||
      kind === 'method_declaration' ||
      kind === 'func_literal'
    ) {
      const names = new Set<string>()
      const parameters = current.field('parameters')
      if (parameters !== null) collectGoBoundNames(parameters, names)
      const receiver = current.field('receiver')
      if (receiver !== null) collectGoBoundNames(receiver, names)
      if (names.has(name)) return true
    } else if (kind === 'block') {
      const statements = current
        .children()
        .flatMap((child) => (nodeKind(child) === 'statement_list' ? child.children() : [child]))
      for (const statement of statements) {
        const statementKind = nodeKind(statement)
        const names = new Set<string>()
        if (statementKind === 'short_var_declaration') {
          const left = statement.field('left')
          if (left !== null) collectGoBoundNames(left, names)
        } else if (statementKind === 'var_declaration' || statementKind === 'const_declaration') {
          for (const spec of statement.children()) {
            const specKind = nodeKind(spec)
            if (specKind !== 'var_spec' && specKind !== 'const_spec') continue
            for (const child of spec.children()) {
              if (nodeKind(child) === 'identifier') names.add(child.text().trim())
            }
          }
        }
        if (names.has(name)) return true
      }
    }
    current = current.parent()
  }
  return false
}

/**
 * Returns the string kind of an AST node.
 * @param node - The AST node.
 * @returns The node kind string.
 */
function nodeKind(node: SgNode): string {
  return String(node.kind())
}

/**
 * Extracts the preceding comment text for a node, if any.
 * @param node - The AST node.
 * @returns The comment text, or undefined.
 */
function extractComment(node: SgNode): string | undefined {
  const prev = node.prev()
  if (prev && nodeKind(prev) === 'comment') {
    return prev.text()
  }
  return undefined
}

/**
 * Computes a source location from a string offset.
 * @param filePath - Workspace-prefixed file path.
 * @param content - Source content.
 * @param index - Zero-based string offset.
 * @returns Source location for the offset.
 */
function locationFromIndex(filePath: string, content: string, index: number): SourceLocation {
  const prefix = content.slice(0, Math.max(index, 0))
  const lines = prefix.split('\n')
  return {
    filePath,
    line: lines.length,
    column: lines.at(-1)?.length ?? 0,
    endLine: undefined,
    endColumn: undefined,
  }
}

/**
 * Represents a local Go type declaration relevant to hierarchy extraction.
 */
interface GoTypeInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface'
  readonly line: number
  readonly interfaceEmbeds: readonly string[]
  readonly interfaceMethodIds: Readonly<Record<string, string>>
}

/** Session state key for the directory index of indexed Go files. */
const GO_PACKAGE_DIRECTORIES_KEY = 'go:package-directories'

/**
 * Lists the non-test Go files that make up one package directory of a workspace.
 * The directory index is built once per run from the files already registered in the session.
 * @param session - Session that holds every analyzed file of the run.
 * @param workspace - Workspace that owns the module.
 * @param relativeDir - Package directory relative to the workspace root; empty for the root.
 * @returns Workspace-prefixed paths of the package files, in deterministic order.
 */
function goPackageFiles(
  session: IndexSession,
  workspace: string,
  relativeDir: string,
): readonly string[] {
  let directories = session.getAdapterState<Map<string, string[]>>(GO_PACKAGE_DIRECTORIES_KEY)
  if (directories === undefined) {
    directories = new Map<string, string[]>()
    for (const filePath of [...session.getAllFilePaths()].sort()) {
      if (!filePath.endsWith('.go') || filePath.endsWith('_test.go')) continue
      const separator = filePath.lastIndexOf('/')
      const directory =
        separator === -1
          ? filePath.slice(0, filePath.indexOf(':') + 1)
          : filePath.slice(0, separator)
      const files = directories.get(directory) ?? []
      files.push(filePath)
      directories.set(directory, files)
    }
    session.setAdapterState(GO_PACKAGE_DIRECTORIES_KEY, directories)
  }
  const key = relativeDir === '' ? `${workspace}:` : `${workspace}:${relativeDir}`
  return directories.get(key) ?? []
}

/**
 * Internal parser state for Go.
 */
interface GoParserState {
  readonly kind: 'go'
  readonly typeInfos: readonly GoTypeInfo[]
  readonly methodReceivers: Record<string, Record<string, string>>
  readonly pointerReceiverMethodIds: readonly string[]
  readonly interfaceMethods: Record<string, string[]>
}

/** Receiver method mappings with pointer/value evidence retained separately. */
interface GoReceiverFacts {
  readonly methods: ReadonlyMap<string, ReadonlyMap<string, string>>
  readonly pointerMethodIds: ReadonlySet<string>
}

/**
 * Returns the canonical graph directory that owns a Go package declaration.
 * @param filePath - Canonical graph file path.
 * @returns Directory surface, including a workspace-root surface when needed.
 */
function goPackageSurface(filePath: string): string {
  const slash = filePath.lastIndexOf('/')
  if (slash >= 0) return filePath.slice(0, slash)
  const identity = splitWorkspaceIdentity(filePath)
  return identity === null ? '.' : `${identity.workspace}:`
}

/**
 * Language adapter for Go files using tree-sitter via ast-grep.
 * Extracts functions, methods, structs, interfaces, type aliases, vars, and consts.
 */
export class GoLanguageAdapter implements LanguageAdapter {
  /**
   * Declares deterministic Go reference semantics.
   * @returns Supported reference capabilities.
   */
  capabilities(): AdapterCapabilities {
    return {
      declarations: true,
      members: true,
      publicBindings: true,
      localBindings: true,
      hierarchy: true,
      buildContext: false,
    }
  }

  /**
   * Declares deterministic Go declaration and containment semantics.
   * @returns Declaration classification and parser-authoritative policy.
   */
  declarationPolicy(): AdapterDeclarationPolicy {
    return {
      languageIds: ['go'],
      supportsLogicalDeclarationGroups: false,
      supportsPhysicalOnlyDeclarations: true,
      callableContainerKinds: GO_CALLABLE_KINDS,
      structuralFactsAreParserAuthoritative: true,
    }
  }
  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array containing 'go'.
   */
  languages(): string[] {
    return ['go']
  }

  /**
   * Parses one Go dotted member spelling.
   * @param text - Human reference text.
   * @returns One owner-then-member candidate, or none.
   */
  parseSymbolReference(text: string): ParsedSymbolReference {
    return parseDottedMemberReference(text)
  }

  /**
   * Renders a Go member with the generic dotted spelling.
   * @param symbol - Logical symbol.
   * @param ownerPath - Owner simple names.
   * @returns Generic dotted spelling.
   */
  renderSymbolReference(
    symbol: LogicalSymbol,
    ownerPath: readonly string[],
  ): { readonly generic: string } {
    return renderDottedMemberReference(symbol, ownerPath)
  }

  /**
   * Returns the file extension to language ID mapping for Go.
   * @returns Extension-to-language map.
   */
  extensions(): Record<string, string> {
    return { '.go': 'go' }
  }

  /**
   * Analyzes a single file and extracts its symbols, imports, binding/call facts,
   * namespace, and any optional parser-specific state.
   * @param filePath - The path of the file to analyze.
   * @param content - The content of the file.
   * @param context - The adapter analyze context.
   * @returns The extracted file analysis draft.
   */
  analyzeFile(
    filePath: string,
    content: string,
    context: AdapterAnalyzeContext,
  ): FileAnalysisDraft {
    ensureLanguagesRegistered()
    const sgRoot = parse('go', content)
    // Keep the parsed SgRoot instance alive in the session state to prevent
    // V8 garbage collection from running its native Rust finalizer during
    // event loop yields. This avoids a SIGSEGV segmentation fault caused
    // by a native concurrency/double-free bug in @ast-grep/napi.
    let keepAlive = context.session.getAdapterState<unknown[]>('napi-keepalive')
    if (!keepAlive) {
      keepAlive = []
      context.session.setAdapterState('napi-keepalive', keepAlive)
    }
    keepAlive.push(sgRoot)
    const root = sgRoot.root()
    const symbols: SymbolNode[] = []
    const seenSymbol = new Set<string>()

    const addSymbol = (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ): void => {
      if (!selectionNode) return
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seenSymbol.has(key)) return
      try {
        const symbol = createSymbolNode({
          name,
          kind,
          filePath,
          line,
          column: node.range().start.column,
          endLine: node.range().end.line + 1,
          endColumn: node.range().end.column,
          selectionRange: {
            startLine: selectionNode.range().start.line + 1,
            startColumn: selectionNode.range().start.column,
            endLine: selectionNode.range().end.line + 1,
            endColumn: selectionNode.range().end.column,
          },
          comment,
        })
        seenSymbol.add(key)
        symbols.push(symbol)
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
      }
    }

    for (const child of root.children()) {
      const kind = nodeKind(child)

      switch (kind) {
        case 'function_declaration': {
          const name = child.field('name')?.text()
          if (name)
            addSymbol(name, SymbolKind.Function, child, child.field('name'), extractComment(child))
          break
        }
        case 'method_declaration': {
          const name = child.field('name')?.text()
          if (name)
            addSymbol(name, SymbolKind.Method, child, child.field('name'), extractComment(child))
          break
        }
        case 'type_declaration': {
          this.extractTypeDeclaration(child, filePath, addSymbol)
          break
        }
        case 'var_declaration': {
          this.extractVarOrConst(child, filePath, SymbolKind.Variable, addSymbol)
          break
        }
        case 'const_declaration': {
          this.extractVarOrConst(child, filePath, SymbolKind.Variable, addSymbol)
          break
        }
      }
    }

    const imports = this.extractImportedNamesFromData(content, root)
    const bindingFacts = this.extractBindingFactsFromData(root, filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(root, filePath, content, symbols)

    const typeInfos = this.collectTypeInfo(root, filePath, symbols)
    const receiverFacts = this.collectMethodReceivers(root, content, filePath, symbols)
    const methodReceivers = receiverFacts.methods
    const serializedMethodReceivers: Record<string, Record<string, string>> = {}
    for (const [receiver, methods] of methodReceivers.entries()) {
      serializedMethodReceivers[receiver] = {}
      for (const [mName, mId] of methods.entries()) {
        serializedMethodReceivers[receiver][mName] = mId
      }
    }
    const interfaceMethods: Record<string, string[]> = {}
    for (const info of typeInfos) {
      if (info.kind === 'interface') {
        interfaceMethods[info.name] = Object.keys(info.interfaceMethodIds)
      }
    }

    const referenceFacts = this.buildReferenceFacts(
      context.workspaceName,
      filePath,
      symbols,
      imports,
      typeInfos,
      methodReceivers,
      interfaceMethods,
    )
    const ownerByMemberId = new Map<string, string>()
    const typeByName = new Map(typeInfos.map((item) => [item.name, item]))
    for (const [receiver, methods] of methodReceivers) {
      const owner = typeByName.get(receiver)
      if (owner === undefined) continue
      for (const methodId of methods.values()) ownerByMemberId.set(methodId, owner.symbolId)
    }
    for (const info of typeInfos) {
      for (const methodId of Object.values(info.interfaceMethodIds)) {
        ownerByMemberId.set(methodId, info.symbolId)
      }
    }
    return {
      language: 'go',
      symbols: withEnclosingTypeParents(withOwnerParents(symbols, ownerByMemberId)),
      imports,
      bindingFacts,
      callFacts,
      referenceFacts,
      parserState: {
        kind: 'go',
        typeInfos,
        methodReceivers: serializedMethodReceivers,
        pointerReceiverMethodIds: [...receiverFacts.pointerMethodIds].sort(),
        interfaceMethods,
      },
    }
  }

  /**
   * Builds conservative Go package declaration and import facts.
   * @param workspace - Owning workspace.
   * @param filePath - Analyzed source path.
   * @param symbols - Extracted declarations.
   * @param imports - Extracted static imports.
   * @param typeInfos - Syntax-proven local named types and embeddings.
   * @param methodReceivers - Receiver type to declared-method mappings.
   * @param interfaceMethods - Interface names to required method names.
   * @returns Additive reference facts.
   */
  private buildReferenceFacts(
    workspace: string,
    filePath: string,
    symbols: readonly SymbolNode[],
    imports: readonly ImportDeclaration[],
    typeInfos: readonly GoTypeInfo[],
    methodReceivers: ReadonlyMap<string, ReadonlyMap<string, string>>,
    interfaceMethods: Readonly<Record<string, readonly string[]>>,
  ): ReferenceFacts {
    const surface = goPackageSurface(filePath)
    const typeByName = new Map(typeInfos.map((item) => [item.name, item]))
    const ownerByMemberId = new Map<string, string>()
    for (const [receiver, methods] of methodReceivers) {
      const owner = typeByName.get(receiver)
      if (!owner) continue
      for (const methodId of methods.values()) ownerByMemberId.set(methodId, owner.symbolId)
    }
    for (const info of typeInfos) {
      for (const methodId of Object.values(info.interfaceMethodIds)) {
        ownerByMemberId.set(methodId, info.symbolId)
      }
    }

    // Struct fields are identified through their declaring struct, so equal field names in
    // different structs remain distinct logical members.
    for (const symbol of withEnclosingTypeParents(symbols)) {
      if (symbol.kind === SymbolKind.Property && symbol.parentId !== undefined) {
        ownerByMemberId.set(symbol.id, symbol.parentId)
      }
    }

    const symbolCountByKey = new Map<string, number>()
    for (const symbol of symbols) {
      const ownerId = ownerByMemberId.get(symbol.id)
      const space =
        symbol.kind === SymbolKind.Class ||
        symbol.kind === SymbolKind.Interface ||
        symbol.kind === SymbolKind.Type
          ? SymbolSpace.Type
          : SymbolSpace.Value
      const key = `${surface}:${ownerId ?? ''}:${space}:${symbol.name}`
      symbolCountByKey.set(key, (symbolCountByKey.get(key) ?? 0) + 1)
    }

    const logicalFacts = buildLogicalDeclarationFacts({
      workspace,
      declarations: symbols.map((symbol) => {
        const ownerId = ownerByMemberId.get(symbol.id)
        const space =
          symbol.kind === SymbolKind.Class ||
          symbol.kind === SymbolKind.Interface ||
          symbol.kind === SymbolKind.Type
            ? SymbolSpace.Type
            : SymbolSpace.Value
        if (
          symbol.kind === SymbolKind.Variable &&
          ownerId === undefined &&
          !/^\p{Lu}/u.test(symbol.name)
        ) {
          // Unexported package-level state is not part of the package's logical surface.
          return createPhysicalOnlyDeclarationDescriptor({ symbol, reason: 'module-state' })
        }
        const key = `${surface}:${ownerId ?? ''}:${space}:${symbol.name}`
        if ((symbolCountByKey.get(key) ?? 0) > 1) {
          return createPhysicalOnlyDeclarationDescriptor({
            symbol,
            reason: 'conflicting-declaration',
          })
        }
        return createAdapterDeclarationDescriptor({
          symbol,
          surface,
          space,
          ownerSymbolId: ownerId,
          requiresOwner: symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Property,
          groupKey: symbol.id,
          memberSemantics:
            symbol.kind === SymbolKind.Method
              ? typeInfos.some((info) => info.interfaceMethodIds[symbol.name] === symbol.id)
                ? { kind: MemberKind.Signature }
                : { kind: MemberKind.Method, dispatch: MemberDispatch.Instance }
              : symbol.kind === SymbolKind.Property
                ? { kind: MemberKind.Field, dispatch: MemberDispatch.Instance }
                : undefined,
        })
      }),
    })
    const hierarchyDescriptors: AdapterHierarchyDescriptor[] = []
    for (const child of typeInfos) {
      child.interfaceEmbeds.forEach((name, precedence) => {
        const parent = typeByName.get(name)
        if (parent?.kind === SymbolKind.Interface) {
          hierarchyDescriptors.push({
            childSymbolId: child.symbolId,
            parentSymbolId: parent.symbolId,
            kind: 'extends',
            precedence,
          })
        }
      })
      if (child.kind !== SymbolKind.Class) continue
      const methods = methodReceivers.get(child.name)
      if (!methods) continue
      for (const contract of typeInfos) {
        if (contract.kind !== SymbolKind.Interface) continue
        const required = interfaceMethods[contract.name] ?? []
        if (required.length === 0 || !required.every((name) => methods.has(name))) continue
        hierarchyDescriptors.push({
          childSymbolId: child.symbolId,
          parentSymbolId: contract.symbolId,
          kind: 'implements',
          precedence: 0,
        })
      }
    }
    const hierarchyFacts = buildHierarchyReferenceFacts({
      hierarchy: hierarchyDescriptors,
      logicalBySymbolId: logicalFacts.logicalBySymbolId,
    })
    const publicBindings = symbols
      .filter((symbol) => !ownerByMemberId.has(symbol.id) && /^\p{Lu}/u.test(symbol.name))
      .map((symbol) =>
        createPublicBinding({
          surface,
          exportedName: symbol.name,
          space:
            symbol.kind === SymbolKind.Class ||
            symbol.kind === SymbolKind.Interface ||
            symbol.kind === SymbolKind.Type
              ? SymbolSpace.Type
              : SymbolSpace.Value,
          targetId: logicalFacts.logicalBySymbolId.get(symbol.id)?.id,
        }),
      )
    const localBindings = imports
      .filter((item) => item.localName.length > 0 && item.kind !== ImportDeclarationKind.Blank)
      .map((item) =>
        createLocalBinding({
          filePath,
          scopeId: 'file',
          localName: item.localName,
          space: SymbolSpace.Namespace,
          targetId: undefined,
          range: item.range ?? WHOLE_FILE_START,
        }),
      )
    return {
      declarations: logicalFacts.declarations,
      logicalSymbols: logicalFacts.retainedLogicalSymbols,
      diagnostics: logicalFacts.diagnostics,
      publicBindings,
      localBindings,
      hierarchy: hierarchyFacts.hierarchy,
      steps: hierarchyFacts.steps,
      capabilities: this.capabilities(),
    }
  }

  /**
   * Resolves raw imports extracted in Pass 1 into symbol mappings and file dependencies.
   * @param analysis - The file analysis.
   * @param context - The import resolution context.
   * @returns The resolved imports.
   */
  resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const knownPackages = [...context.packageToWorkspace.keys()]
    const { session, qualifiedNames, packageToWorkspace } = context

    for (const imp of analysis.imports) {
      // Blank and side-effect imports bind no name but still depend on the package.
      if (
        imp.kind === ImportDeclarationKind.Dynamic ||
        imp.kind === ImportDeclarationKind.Require
      ) {
        continue
      }

      const qualifiedId = isFileOnlyImport(imp) ? undefined : qualifiedNames.get(imp.specifier)
      if (qualifiedId) {
        importMap.set(imp.localName, qualifiedId)
        continue
      }

      // A Go import names a package directory, not a symbol. It resolves to the non-test files
      // of that directory inside the workspace whose `go.mod` module owns the specifier.
      const pkgName = this.resolvePackageFromSpecifier(imp.specifier, knownPackages)
      if (pkgName) {
        const workspace = packageToWorkspace.get(pkgName)
        if (workspace !== undefined) {
          const relativeDir =
            imp.specifier === pkgName ? '' : imp.specifier.slice(pkgName.length + 1)
          fileImports.push(...goPackageFiles(session, workspace, relativeDir))
        }
      }
    }

    return { importMap, fileImports: [...new Set(fileImports)] }
  }

  /**
   * Builds relations between symbols or files from the analyzed facts and resolved imports.
   * @param analysis - The file analysis.
   * @param context - The relation build context.
   * @returns The build relations.
   */
  buildRelations(analysis: FileAnalysis, context: RelationBuildContext): Relation[] {
    const relations: Relation[] = []

    for (const symbol of analysis.symbols) {
      relations.push(
        createRelation({
          source: analysis.filePath,
          target: symbol.id,
          type: RelationType.Defines,
        }),
      )
    }

    const hierarchy = analysis.parserState as GoParserState | undefined
    if (!hierarchy) return relations

    const typeInfos = hierarchy.typeInfos ?? []
    const typeByName = new Map<string, GoTypeInfo>(typeInfos.map((info) => [info.name, info]))
    const methodReceivers = hierarchy.methodReceivers ?? {}
    const interfaceMethods = hierarchy.interfaceMethods ?? {}

    const seen = new Set<string>()

    for (const info of typeInfos) {
      if (info.kind === SymbolKind.Interface) {
        for (const [precedence, embedded] of info.interfaceEmbeds.entries()) {
          const target = typeByName.get(embedded)
          if (!target || target.kind !== SymbolKind.Interface) continue
          const key = `${info.symbolId}:${RelationType.Extends}:${target.symbolId}`
          if (seen.has(key)) continue
          seen.add(key)
          relations.push(
            createRelation({
              source: info.symbolId,
              target: target.symbolId,
              type: RelationType.Extends,
              metadata: { precedence },
            }),
          )
        }
      }
    }

    const interfaces = typeInfos.filter((info) => info.kind === SymbolKind.Interface)
    const structs = typeInfos.filter((info) => info.kind === SymbolKind.Class)
    // An interface's method set includes the methods of every embedded interface. When an
    // embedded interface cannot be resolved locally the set is unknown and nothing is claimed.
    const completeMethodSet = (
      name: string,
      visiting = new Set<string>(),
    ): string[] | undefined => {
      if (visiting.has(name)) return undefined
      const info = typeByName.get(name)
      if (info === undefined || info.kind !== SymbolKind.Interface) return undefined
      visiting.add(name)
      const methods = new Set(interfaceMethods[name] ?? [])
      for (const embedded of info.interfaceEmbeds) {
        const embeddedMethods = completeMethodSet(embedded, visiting)
        if (embeddedMethods === undefined) {
          visiting.delete(name)
          return undefined
        }
        for (const method of embeddedMethods) methods.add(method)
      }
      visiting.delete(name)
      return [...methods]
    }
    for (const structInfo of structs) {
      const receiverMethods = methodReceivers[structInfo.name] ?? {}
      for (const iface of interfaces) {
        const ifaceMethods = completeMethodSet(iface.name)
        if (ifaceMethods === undefined || ifaceMethods.length === 0) continue
        const implementsAll = ifaceMethods.every((methodName) => methodName in receiverMethods)
        if (!implementsAll) continue

        const implementsKey = `${structInfo.symbolId}:${RelationType.Implements}:${iface.symbolId}`
        if (!seen.has(implementsKey)) {
          seen.add(implementsKey)
          relations.push(
            createRelation({
              source: structInfo.symbolId,
              target: iface.symbolId,
              type: RelationType.Implements,
              metadata: { precedence: 0 },
            }),
          )
        }
      }
    }

    // Only a bare call can reach a package-level callable by name. A selector call
    // (`value.Name()`) has a receiver whose static type is unknown here, so it is never
    // matched to a same-named method or function.
    const packageCallablesByName = new Map<string, string>()
    for (const s of analysis.symbols) {
      if (
        s.parentId === undefined &&
        (s.kind === SymbolKind.Function ||
          s.kind === SymbolKind.Variable ||
          s.kind === SymbolKind.Class)
      ) {
        packageCallablesByName.set(s.name, s.id)
      }
    }

    for (const call of analysis.callFacts) {
      if (call.callerSymbolId) {
        const calleeId =
          context?.resolvedImports?.importMap?.get(call.name) ??
          (call.form === CallForm.Free ? packageCallablesByName.get(call.name) : undefined)
        if (calleeId) {
          const key = `${call.callerSymbolId}:${RelationType.Calls}:${calleeId}`
          if (!seen.has(key)) {
            seen.add(key)
            relations.push(
              createRelation({
                source: call.callerSymbolId,
                target: calleeId,
                type: RelationType.Calls,
              }),
            )
          }
        }
      }
    }

    return relations
  }

  /**
   * Collects Go type declarations from AST.
   * @param root - The root SgNode of the parsed Go AST.
   * @param filePath - The path of the Go file.
   * @param symbols - Extracted symbol nodes.
   * @returns Array of type info objects.
   */
  private collectTypeInfo(
    root: SgNode,
    filePath: string,
    symbols: readonly SymbolNode[],
  ): GoTypeInfo[] {
    const infos: GoTypeInfo[] = []

    for (const child of root.children()) {
      if (nodeKind(child) !== 'type_declaration') continue
      for (const spec of child.children()) {
        if (nodeKind(spec) !== 'type_spec') continue
        const nameNode = spec.field('name')
        const name = nameNode?.text()
        const typeNode = spec.field('type')
        if (!name || !typeNode) continue
        const typeKind = nodeKind(typeNode)
        const line = spec.range().start.line + 1

        if (typeKind === 'struct_type') {
          const ownerSymbol = symbols.find(
            (symbol) =>
              symbol.filePath === filePath &&
              symbol.kind === SymbolKind.Class &&
              symbol.name === name &&
              symbol.line === line,
          )
          if (ownerSymbol) {
            infos.push({
              name,
              symbolId: ownerSymbol.id,
              kind: 'class',
              line,
              interfaceEmbeds: [],
              interfaceMethodIds: {},
            })
          }
        } else if (typeKind === 'interface_type') {
          const ownerSymbol = symbols.find(
            (symbol) =>
              symbol.filePath === filePath &&
              symbol.kind === SymbolKind.Interface &&
              symbol.name === name &&
              symbol.line === line,
          )
          if (ownerSymbol) {
            const interfaceEmbeds: string[] = []
            const interfaceMethodIds: Record<string, string> = {}

            for (const elem of typeNode.children()) {
              const elemKind = nodeKind(elem)
              if (elemKind === 'type_elem') {
                const typeIdent =
                  elem
                    .children()
                    .find((sub) => nodeKind(sub) === 'type_identifier')
                    ?.text() ?? elem.text().trim()
                // A package-qualified embed is kept: its methods are unknown, so it blocks IMPLEMENTS.
                if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(typeIdent)) {
                  interfaceEmbeds.push(typeIdent)
                }
              } else if (elemKind === 'method_elem') {
                const methodName = elem.field('name')?.text()
                if (methodName) {
                  const methodSymbol = symbols.find(
                    (s) =>
                      s.kind === SymbolKind.Method &&
                      s.name === methodName &&
                      containsSymbolRange(ownerSymbol, s),
                  )
                  if (methodSymbol) {
                    interfaceMethodIds[methodName] = methodSymbol.id
                  }
                }
              }
            }

            infos.push({
              name,
              symbolId: ownerSymbol.id,
              kind: 'interface',
              line,
              interfaceEmbeds,
              interfaceMethodIds,
            })
          }
        }
      }
    }

    return infos
  }

  /**
   * Collects method receiver mappings from AST nodes.
   * @param root - The root SgNode of the parsed Go AST.
   * @param content - Source file content.
   * @param filePath - The path of the Go file.
   * @param symbols - Extracted symbol nodes.
   * @returns Receiver mappings and pointer receiver method identities.
   */
  private collectMethodReceivers(
    root: SgNode,
    content: string,
    filePath: string,
    symbols: SymbolNode[],
  ): GoReceiverFacts {
    const methods = new Map<string, Map<string, string>>()
    const pointerMethodIds = new Set<string>()

    for (const child of root.children()) {
      if (nodeKind(child) !== 'method_declaration') continue
      const nameNode = child.field('name')
      const methodName = nameNode?.text()
      const receiverList = child.field('receiver')
      if (!methodName || !receiverList) continue

      let receiverName: string | undefined
      let isPointer = false

      for (const param of receiverList.children()) {
        if (nodeKind(param) === 'parameter_declaration') {
          const typeNode = param.field('type')
          if (typeNode) {
            const rawText = typeNode.text().trim()
            if (rawText.startsWith('*')) {
              isPointer = true
              receiverName = rawText.slice(1).trim()
            } else if (nodeKind(typeNode) === 'pointer_type') {
              isPointer = true
              receiverName = typeNode.text().replace(/^\*/, '').trim()
            } else {
              receiverName = rawText
            }
          }
        }
      }

      if (!receiverName) continue
      const line = child.range().start.line + 1
      const methodId = symbols.find(
        (symbol) =>
          symbol.filePath === filePath &&
          symbol.kind === SymbolKind.Method &&
          symbol.name === methodName &&
          symbol.line === line,
      )?.id
      if (!methodId) continue
      if (isPointer) pointerMethodIds.add(methodId)
      const receiverMethods = methods.get(receiverName) ?? new Map<string, string>()
      receiverMethods.set(methodName, methodId)
      methods.set(receiverName, receiverMethods)
    }

    return { methods, pointerMethodIds }
  }

  /**
   * Extracts imported package names from AST.
   * @param _content - Source file content.
   * @param root - AST grep root node.
   * @returns Array of import declarations.
   */
  private extractImportedNamesFromData(_content: string, root: SgNode): ImportDeclaration[] {
    const results: ImportDeclaration[] = []

    for (const child of root.children()) {
      if (nodeKind(child) !== 'import_declaration') continue

      for (const specListChild of child.children()) {
        if (nodeKind(specListChild) === 'import_spec_list') {
          for (const spec of specListChild.children()) {
            if (nodeKind(spec) === 'import_spec') {
              this.extractGoImportSpec(spec, results)
            }
          }
        } else if (nodeKind(specListChild) === 'import_spec') {
          this.extractGoImportSpec(specListChild, results)
        }
      }
    }

    return results
  }

  /**
   * Extracts details from a single Go import spec node.
   * @param spec - The import spec AST node.
   * @param results - Array to accumulate import declarations.
   */
  private extractGoImportSpec(spec: SgNode, results: ImportDeclaration[]): void {
    let alias: string | undefined
    let pathLiteral: string | undefined

    for (const specChild of spec.children()) {
      const specChildKind = nodeKind(specChild)
      if (specChildKind === 'package_identifier') {
        alias = specChild.text()
      } else if (specChildKind === 'dot') {
        alias = '.'
      } else if (specChildKind === 'blank_identifier') {
        alias = '_'
      } else if (specChildKind === 'interpreted_string_literal') {
        pathLiteral = specChild.text().replace(/^"|"$/g, '')
      } else if (specChildKind === 'raw_string_literal') {
        pathLiteral = specChild.text().replace(/^`|`$/g, '')
      }
    }

    if (!pathLiteral) return

    const lastSegment = pathLiteral.split('/').pop() ?? pathLiteral
    const isBlank = alias === '_'
    const isDot = alias === '.'
    results.push({
      originalName: lastSegment,
      localName: isBlank ? '' : (alias ?? lastSegment),
      specifier: pathLiteral,
      isRelative: false,
      kind: isBlank
        ? ImportDeclarationKind.Blank
        : isDot
          ? ImportDeclarationKind.Namespace
          : ImportDeclarationKind.Named,
    })
  }

  /**
   * Extracts binding facts from Go AST.
   * @param root - The root SgNode of the parsed Go AST.
   * @param filePath - The path of the Go file.
   * @param content - Source file content.
   * @param _symbols - Extracted symbol nodes.
   * @param imports - Extracted import declarations.
   * @returns Array of binding facts.
   */
  private extractBindingFactsFromData(
    root: SgNode,
    filePath: string,
    content: string,
    _symbols: SymbolNode[],
    imports: ImportDeclaration[],
  ): BindingFact[] {
    const facts: BindingFact[] = []
    const seen = new Set<string>()

    const addFact = (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
    ): void => {
      const location = locationFromIndex(filePath, content, index)
      const key = `${name}:${sourceKind}:${targetName ?? ''}:${location.line}:${location.column}`
      if (seen.has(key)) return
      seen.add(key)
      facts.push({
        name,
        filePath,
        scopeId: filePath,
        sourceKind,
        location,
        targetName,
        targetSymbolId: undefined,
        targetFilePath: undefined,
        metadata: undefined,
      })
    }

    for (const declaration of imports) {
      if (declaration.localName.length === 0) continue
      addFact(declaration.localName, BindingSourceKind.ImportedType, declaration.originalName, 0)
    }

    const findTypeIdentifiers = (node: SgNode): SgNode[] => {
      const result: SgNode[] = []
      const walk = (n: SgNode): void => {
        if (nodeKind(n) === 'type_identifier') {
          result.push(n)
        }
        for (const child of n.children()) {
          walk(child)
        }
      }
      walk(node)
      return result
    }

    const walkBindings = (node: SgNode): void => {
      const kind = nodeKind(node)
      if (kind === 'parameter_declaration') {
        const typeNode = node.field('type')
        if (typeNode) {
          for (const typeId of findTypeIdentifiers(typeNode)) {
            const targetName = typeId.text()
            if (/^[A-Z][A-Za-z0-9_]*$/.test(targetName)) {
              addFact(
                targetName,
                BindingSourceKind.Parameter,
                targetName,
                typeId.range().start.index,
              )
            }
          }
        }
      } else if (kind === 'field_declaration') {
        const typeNode = node.field('type')
        if (typeNode) {
          for (const typeId of findTypeIdentifiers(typeNode)) {
            const targetName = typeId.text()
            if (/^[A-Z][A-Za-z0-9_]*$/.test(targetName)) {
              addFact(
                targetName,
                BindingSourceKind.Property,
                targetName,
                typeId.range().start.index,
              )
            }
          }
        }
      } else if (kind === 'type_alias' || kind === 'type_spec') {
        const aliasName = node.field('name')?.text()
        const typeNode = node.field('type')
        if (aliasName && typeNode) {
          const typeNodeKind = nodeKind(typeNode)
          if (typeNodeKind !== 'struct_type' && typeNodeKind !== 'interface_type') {
            for (const typeId of findTypeIdentifiers(typeNode)) {
              const targetName = typeId.text()
              if (targetName !== aliasName && /^[A-Z][A-Za-z0-9_]*$/.test(targetName)) {
                addFact(
                  aliasName,
                  BindingSourceKind.ImportedType,
                  targetName,
                  typeId.range().start.index,
                )
              }
            }
          }
        }
      }

      for (const child of node.children()) {
        walkBindings(child)
      }
    }

    walkBindings(root)
    return facts
  }

  /**
   * Extracts call facts from Go AST.
   * @param root - The root SgNode of the parsed Go AST.
   * @param filePath - The path of the Go file.
   * @param content - Source file content.
   * @param symbols - Extracted symbol nodes.
   * @returns Array of call facts.
   */
  private extractCallFactsFromData(
    root: SgNode,
    filePath: string,
    content: string,
    symbols: SymbolNode[],
  ): CallFact[] {
    const facts: CallFact[] = []
    const seen = new Set<string>()

    const addFact = (
      form: CallForm,
      name: string,
      receiverName: string | undefined,
      index: number,
    ): void => {
      const location = locationFromIndex(filePath, content, index)
      const key = `${form}:${receiverName ?? ''}:${name}:${location.line}:${location.column}`
      if (seen.has(key)) return
      seen.add(key)
      const caller = findContainingCallableSymbol(
        symbols,
        { line: location.line, column: location.column },
        { callableKinds: GO_CALLABLE_KINDS },
      )
      facts.push({
        filePath,
        scopeId: filePath,
        callerSymbolId: caller?.id,
        form,
        name,
        receiverName,
        targetName: name,
        arity: undefined,
        location,
        metadata: undefined,
      })
    }

    const walkCalls = (node: SgNode): void => {
      const kind = nodeKind(node)
      if (kind === 'call_expression') {
        const fn = node.field('function')
        if (fn) {
          const fnKind = nodeKind(fn)
          if (fnKind === 'selector_expression') {
            const receiverNode = fn.field('operand')
            const fieldNode = fn.field('field')
            const receiver = receiverNode?.text()
            const name = fieldNode?.text()
            if (name) {
              addFact(CallForm.Static, name, receiver, node.range().start.index)
            }
          } else if (fnKind === 'identifier') {
            const name = fn.text()
            if (!this.isExcludedFreeCall(name) && !isGoShadowedByEnclosingScope(node, name)) {
              addFact(CallForm.Free, name, undefined, node.range().start.index)
            }
          }
        }
      } else if (kind === 'composite_literal') {
        const typeNode = node.field('type')
        if (typeNode) {
          const rawName = typeNode.text()
          const name = rawName.split('.').pop() ?? rawName
          if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
            addFact(CallForm.Constructor, name, undefined, node.range().start.index)
          }
        }
      }

      for (const child of node.children()) {
        walkCalls(child)
      }
    }

    walkCalls(root)
    return facts
  }

  /**
   * Tests whether a free call candidate is actually a built-in function or keyword.
   * @param name - Call target name.
   * @returns Whether to exclude the candidate.
   */
  private isExcludedFreeCall(name: string): boolean {
    return [
      'func',
      'var',
      'const',
      'type',
      'import',
      'package',
      'if',
      'for',
      'switch',
      'case',
      'select',
      'return',
      'make',
      'new',
      'len',
      'cap',
      'append',
      'copy',
      'delete',
      'panic',
      'recover',
      'close',
      'complex',
      'real',
      'imag',
      'print',
      'println',
      'string',
      'int',
      'int8',
      'int16',
      'int32',
      'int64',
      'uint',
      'uint8',
      'uint16',
      'uint32',
      'uint64',
      'uintptr',
      'float32',
      'float64',
      'complex64',
      'complex128',
      'byte',
      'rune',
      'bool',
      'error',
      'any',
    ].includes(name)
  }

  /**
   * Extracts type declarations from Go AST node.
   * @param node - The AST node to extract from.
   * @param filePath - The path of the Go file.
   * @param addSymbol - Callback to register a symbol.
   */
  private extractTypeDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    for (const child of node.children()) {
      const childKind = nodeKind(child)

      if (childKind === 'type_spec') {
        const nameNode = child.field('name')
        const name = nameNode?.text()
        if (!name) continue
        const typeNode = child.field('type')
        if (!typeNode) continue
        const typeKind = nodeKind(typeNode)

        if (typeKind === 'struct_type') {
          addSymbol(name, SymbolKind.Class, child, nameNode, extractComment(node))
          for (const member of typeNode.children()) {
            if (nodeKind(member) === 'field_declaration_list') {
              for (const field of member.children()) {
                if (nodeKind(field) !== 'field_declaration') continue
                for (const fieldChild of field.children()) {
                  if (nodeKind(fieldChild) === 'field_identifier') {
                    const fieldName = fieldChild.text()
                    if (fieldName) {
                      addSymbol(
                        fieldName,
                        SymbolKind.Property,
                        field,
                        fieldChild,
                        extractComment(field),
                      )
                    }
                  }
                }
              }
            } else if (nodeKind(member) === 'field_declaration') {
              for (const fieldChild of member.children()) {
                if (nodeKind(fieldChild) === 'field_identifier') {
                  const fieldName = fieldChild.text()
                  if (fieldName) {
                    addSymbol(
                      fieldName,
                      SymbolKind.Property,
                      member,
                      fieldChild,
                      extractComment(member),
                    )
                  }
                }
              }
            }
          }
        } else if (typeKind === 'interface_type') {
          addSymbol(name, SymbolKind.Interface, child, nameNode, extractComment(node))
          for (const member of typeNode.children()) {
            if (nodeKind(member) !== 'method_elem') continue
            const memberNameNode = member.field('name')
            const memberName = memberNameNode?.text()
            if (memberName) {
              addSymbol(
                memberName,
                SymbolKind.Method,
                member,
                memberNameNode,
                extractComment(member),
              )
            }
          }
        } else {
          addSymbol(name, SymbolKind.Type, child, nameNode, extractComment(node))
        }
      } else if (childKind === 'type_alias') {
        const nameNode = child.field('name')
        const name = nameNode?.text()
        if (name) addSymbol(name, SymbolKind.Type, child, nameNode, extractComment(node))
      }
    }
  }

  /**
   * Extracts variables or constants from Go AST node.
   * @param node - The AST node to extract from.
   * @param filePath - The path of the Go file.
   * @param kind - The symbol kind (Variable or Constant).
   * @param addSymbol - Callback to register a symbol.
   */
  private extractVarOrConst(
    node: SgNode,
    filePath: string,
    kind: SymbolKind,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    for (const child of node.children()) {
      const childKind = nodeKind(child)
      if (childKind === 'var_spec' || childKind === 'const_spec') {
        const nameNode = child.field('name')
        const name = nameNode?.text()
        if (name) addSymbol(name, kind, child, nameNode, extractComment(node))
      }
    }
  }

  /**
   * Resolves a Go import specifier to a known package by longest prefix match.
   * @param specifier - The Go import path (e.g. `github.com/acme/auth/models`).
   * @param knownPackages - Known module paths from `go.mod`.
   * @returns The matching module path, or undefined.
   */
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined {
    let best: string | undefined
    for (const pkg of knownPackages) {
      if (specifier === pkg || specifier.startsWith(pkg + '/')) {
        if (!best || pkg.length > best.length) {
          best = pkg
        }
      }
    }
    return best
  }

  /**
   * Declares the resolution manifests this adapter reads.
   * @returns Exact basenames used for package identity.
   */
  resolutionManifests(): readonly string[] {
    return ['go.mod']
  }

  /**
   * Reads the module identity by searching for `go.mod` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The module path from the nearest `go.mod`, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'go.mod',
      (content) => {
        const match = content.match(/^module\s+(\S+)/m)
        return match?.[1]
      },
      repoRoot,
    )
  }
}
