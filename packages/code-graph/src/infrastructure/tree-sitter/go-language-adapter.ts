import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type ImportResolutionContext,
  type ResolvedImports,
  type RelationBuildContext,
} from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'
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
 * Finds the innermost Go symbol starting before a source line.
 * @param symbols - Symbols extracted from the current file.
 * @param line - One-based source line.
 * @returns Matching symbol id, or undefined.
 */
function findEnclosingSymbolIdByLine(
  symbols: readonly SymbolNode[],
  line: number,
): string | undefined {
  return [...symbols]
    .filter((symbol) => symbol.line <= line)
    .sort((left, right) => {
      if (left.line !== right.line) return right.line - left.line
      return right.column - left.column
    })[0]?.id
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
}

/**
 * Internal parser state for Go.
 */
interface GoParserState {
  readonly kind: 'go'
  readonly typeInfos: readonly GoTypeInfo[]
  readonly methodReceivers: Record<string, Record<string, string>>
  readonly interfaceMethods: Record<string, string[]>
}

/**
 * Language adapter for Go files using tree-sitter via ast-grep.
 * Extracts functions, methods, structs, interfaces, type aliases, vars, and consts.
 */
export class GoLanguageAdapter implements LanguageAdapter {
  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array containing 'go'.
   */
  languages(): string[] {
    return ['go']
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
      comment: string | undefined,
    ): void => {
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seenSymbol.has(key)) return
      seenSymbol.add(key)
      symbols.push(
        createSymbolNode({
          name,
          kind,
          filePath,
          line,
          column: node.range().start.column,
          comment,
        }),
      )
    }

    for (const child of root.children()) {
      const kind = nodeKind(child)

      switch (kind) {
        case 'function_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Function, child, extractComment(child))
          break
        }
        case 'method_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Method, child, extractComment(child))
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
    const bindingFacts = this.extractBindingFactsFromData(filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(filePath, content, symbols)

    const typeInfos = this.collectTypeInfo(content, filePath, symbols)
    const methodReceivers = this.collectMethodReceivers(content, filePath, symbols)
    const serializedMethodReceivers: Record<string, Record<string, string>> = {}
    for (const [receiver, methods] of methodReceivers.entries()) {
      serializedMethodReceivers[receiver] = {}
      for (const [mName, mId] of methods.entries()) {
        serializedMethodReceivers[receiver][mName] = mId
      }
    }
    const interfaceMethods: Record<string, string[]> = {}
    for (const info of typeInfos) {
      if (info.kind === SymbolKind.Interface) {
        interfaceMethods[info.name] = this.collectInterfaceMethodNames(content, info.line)
      }
    }

    return {
      language: 'go',
      symbols,
      imports,
      bindingFacts,
      callFacts,
      parserState: {
        kind: 'go',
        typeInfos,
        methodReceivers: serializedMethodReceivers,
        interfaceMethods,
      },
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
      if (isFileOnlyImport(imp)) {
        continue
      }

      const qualifiedId = qualifiedNames.get(imp.specifier)
      if (qualifiedId) {
        importMap.set(imp.localName, qualifiedId)
        continue
      }

      const pkgName = this.resolvePackageFromSpecifier(imp.specifier, knownPackages)
      if (pkgName) {
        const wsPrefix = packageToWorkspace.get(pkgName)
        if (wsPrefix !== undefined) {
          const candidates = session.findSymbolsByName(imp.originalName, wsPrefix + ':')
          if (candidates.length > 0) {
            importMap.set(imp.localName, candidates[0]!.id)
          }
        }
      }
    }

    return { importMap, fileImports }
  }

  /**
   * Builds relations between symbols or files from the analyzed facts and resolved imports.
   * @param analysis - The file analysis.
   * @param _context - The relation build context.
   * @returns The build relations.
   */
  buildRelations(
    analysis: FileAnalysis,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: RelationBuildContext,
  ): Relation[] {
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
        for (const embedded of info.interfaceEmbeds) {
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
            }),
          )
        }
      }
    }

    const interfaces = typeInfos.filter((info) => info.kind === SymbolKind.Interface)
    const structs = typeInfos.filter((info) => info.kind === SymbolKind.Class)
    for (const structInfo of structs) {
      const receiverMethods = methodReceivers[structInfo.name] ?? {}
      for (const iface of interfaces) {
        const ifaceMethods = interfaceMethods[iface.name] ?? []
        if (ifaceMethods.length === 0) continue
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
            }),
          )
        }
      }
    }

    return relations
  }

  /**
   * Collects Go type declarations from content.
   * @param content - Source file content.
   * @param filePath - The path of the Go file.
   * @param symbols - Extracted symbol nodes.
   * @returns Array of type info objects.
   */
  private collectTypeInfo(content: string, filePath: string, symbols: SymbolNode[]): GoTypeInfo[] {
    const infos: GoTypeInfo[] = []
    const lines = content.split('\n')
    const typeRegex = /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(interface|struct)\s*\{/gm

    for (const match of content.matchAll(typeRegex)) {
      const name = match[1]
      const typeKind = match[2]
      if (!name || !typeKind) continue
      const line = content.slice(0, match.index ?? 0).split('\n').length
      const kind = typeKind === 'interface' ? SymbolKind.Interface : SymbolKind.Class
      const symbolId = symbols.find(
        (symbol) =>
          symbol.filePath === filePath &&
          symbol.kind === kind &&
          symbol.name === name &&
          symbol.line === line,
      )?.id
      if (!symbolId) continue

      let endLine = lines.length
      let braceDepth = 0
      for (let idx = line - 1; idx < lines.length; idx++) {
        const current = lines[idx] ?? ''
        braceDepth += (current.match(/\{/g) ?? []).length
        braceDepth -= (current.match(/\}/g) ?? []).length
        if (idx >= line && braceDepth === 0) {
          endLine = idx + 1
          break
        }
      }

      const blockLines = lines.slice(line, endLine - 1)
      const interfaceEmbeds =
        kind === SymbolKind.Interface
          ? blockLines
              .map((entry) => entry.trim())
              .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry))
          : []

      infos.push({ name, symbolId, kind, line, interfaceEmbeds })
    }

    return infos
  }

  /**
   * Collects method receiver mappings from content.
   * @param content - Source file content.
   * @param filePath - The path of the Go file.
   * @param symbols - Extracted symbol nodes.
   * @returns Map of receiver to method name to symbol ID.
   */
  private collectMethodReceivers(
    content: string,
    filePath: string,
    symbols: SymbolNode[],
  ): Map<string, Map<string, string>> {
    const methods = new Map<string, Map<string, string>>()
    const methodRegex =
      /^func\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s+\*?([A-Za-z_][A-Za-z0-9_]*)\s*\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm

    for (const match of content.matchAll(methodRegex)) {
      const receiver = match[1]
      const methodName = match[2]
      if (!receiver || !methodName) continue
      const line = content.slice(0, match.index ?? 0).split('\n').length
      const methodId = symbols.find(
        (symbol) =>
          symbol.filePath === filePath &&
          symbol.kind === SymbolKind.Method &&
          symbol.name === methodName &&
          symbol.line === line,
      )?.id
      if (!methodId) continue
      const receiverMethods = methods.get(receiver) ?? new Map<string, string>()
      receiverMethods.set(methodName, methodId)
      methods.set(receiver, receiverMethods)
    }

    return methods
  }

  /**
   * Collects interface method names declared in an interface block.
   * @param content - Source file content.
   * @param line - Starting line number.
   * @returns Array of method name strings.
   */
  private collectInterfaceMethodNames(content: string, line: number): string[] {
    const lines = content.split('\n')
    const startIndex = line - 1
    let braceDepth = 0
    const methods: string[] = []

    for (let idx = startIndex; idx < lines.length; idx++) {
      const current = lines[idx] ?? ''
      braceDepth += (current.match(/\{/g) ?? []).length
      braceDepth -= (current.match(/\}/g) ?? []).length
      if (idx > startIndex) {
        const trimmed = current.trim()
        const methodName = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/)?.[1]
        if (methodName) methods.push(methodName)
      }
      if (idx > startIndex && braceDepth === 0) break
    }

    return methods
  }

  /**
   * Extracts imported package names from AST.
   * @param content - Source file content.
   * @param root - AST grep root node.
   * @returns Array of import declarations.
   */
  private extractImportedNamesFromData(content: string, root: SgNode): ImportDeclaration[] {
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

    const textImports = this.extractGoImportsFromText(content)
    return textImports.length > 0 ? textImports : results
  }

  /**
   * Extracts Go imports directly from text via regexp matching.
   * @param content - Source file content.
   * @returns Array of import declarations.
   */
  private extractGoImportsFromText(content: string): ImportDeclaration[] {
    const declarations: ImportDeclaration[] = []
    const addImport = (alias: string | undefined, specifier: string): void => {
      const lastSegment = specifier.split('/').pop() ?? specifier
      const isBlank = alias === '_'
      const isDot = alias === '.'
      declarations.push({
        originalName: lastSegment,
        localName: isBlank ? '' : (alias ?? lastSegment),
        specifier,
        isRelative: false,
        kind: isBlank
          ? ImportDeclarationKind.Blank
          : isDot
            ? ImportDeclarationKind.Namespace
            : ImportDeclarationKind.Named,
      })
    }

    for (const block of content.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
      const body = block[1] ?? ''
      for (const line of body.split('\n')) {
        const match = line.trim().match(/^(?:(\.|_|\w+)\s+)?["`]([^"`]+)["`]$/)
        if (match?.[2] !== undefined) {
          addImport(match[1], match[2])
        }
      }
    }

    const singleImportPattern = /^\s*import\s+(?:(\.|_|\w+)\s+)?["`]([^"`]+)["`]/gm
    for (const match of content.matchAll(singleImportPattern)) {
      if (match[2] !== undefined) {
        addImport(match[1], match[2])
      }
    }

    return declarations
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
      } else if (specChildKind === 'interpreted_string_literal') {
        pathLiteral = specChild.text().replace(/"/g, '')
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
   * Extracts binding facts from Go content.
   * @param filePath - The path of the Go file.
   * @param content - Source file content.
   * @param _symbols - Extracted symbol nodes.
   * @param imports - Extracted import declarations.
   * @returns Array of binding facts.
   */
  private extractBindingFactsFromData(
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

    const typeReferencePattern =
      /\b(?:func\s+\w+\s*\([^)]*|type\s+\w+\s+struct\s*\{[^}]*|interface\s*\{[^}]*)\b([A-Z][A-Za-z0-9_]*)\b/gms
    for (const match of content.matchAll(typeReferencePattern)) {
      const targetName = match[1]
      if (targetName === undefined) continue
      addFact(targetName, BindingSourceKind.Parameter, targetName, match.index ?? 0)
    }

    const fieldPattern = /^\s*[A-Za-z_][A-Za-z0-9_]*\s+([A-Z][A-Za-z0-9_]*)\b/gm
    for (const match of content.matchAll(fieldPattern)) {
      const targetName = match[1]
      if (targetName === undefined) continue
      addFact(targetName, BindingSourceKind.Property, targetName, match.index ?? 0)
    }

    const typeAliasPattern = /\btype\s+([A-Z][A-Za-z0-9_]*)\s*(?:=\s*|=)\s*([^\n{]+)/g
    for (const match of content.matchAll(typeAliasPattern)) {
      const aliasName = match[1]
      const rhsText = match[2]
      if (aliasName === undefined || rhsText === undefined) continue
      const identPattern = /[A-Z][A-Za-z0-9_]*/g
      for (const refMatch of rhsText.matchAll(identPattern)) {
        const targetName = refMatch[0]
        if (targetName === undefined || targetName === aliasName) continue
        addFact(aliasName, BindingSourceKind.ImportedType, targetName, match.index ?? 0)
      }
    }

    return facts
  }

  /**
   * Extracts call facts from Go content.
   * @param filePath - The path of the Go file.
   * @param content - Source file content.
   * @param symbols - Extracted symbol nodes.
   * @returns Array of call facts.
   */
  private extractCallFactsFromData(
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
      facts.push({
        filePath,
        scopeId: filePath,
        callerSymbolId: findEnclosingSymbolIdByLine(symbols, location.line),
        form,
        name,
        receiverName,
        targetName: name,
        arity: undefined,
        location,
        metadata: undefined,
      })
    }

    const selectorPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    for (const match of content.matchAll(selectorPattern)) {
      const receiver = match[1]
      const name = match[2]
      if (receiver === undefined || name === undefined) continue
      addFact(CallForm.Static, name, receiver, match.index ?? 0)
    }

    const compositePattern = /(?:^|[^\w])&?\s*([A-Z][A-Za-z0-9_]*)\s*\{/g
    for (const match of content.matchAll(compositePattern)) {
      const name = match[1]
      if (name === undefined) continue
      addFact(CallForm.Constructor, name, undefined, match.index ?? 0)
    }

    return facts
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
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      const childKind = nodeKind(child)

      if (childKind === 'type_spec') {
        const name = child.field('name')?.text()
        if (!name) continue
        const typeNode = child.field('type')
        if (!typeNode) continue
        const typeKind = nodeKind(typeNode)

        if (typeKind === 'struct_type') {
          addSymbol(name, SymbolKind.Class, child, extractComment(node))
        } else if (typeKind === 'interface_type') {
          addSymbol(name, SymbolKind.Interface, child, extractComment(node))
        } else {
          addSymbol(name, SymbolKind.Type, child, extractComment(node))
        }
      } else if (childKind === 'type_alias') {
        const name = child.field('name')?.text()
        if (name) addSymbol(name, SymbolKind.Type, child, extractComment(node))
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
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      const childKind = nodeKind(child)
      if (childKind === 'var_spec' || childKind === 'const_spec') {
        const name = child.field('name')?.text()
        if (name) addSymbol(name, kind, child, extractComment(node))
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
