import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
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
   * Extracts symbol nodes from Go source code.
   * @param filePath - The file path.
   * @param content - The source content.
   * @returns An array of extracted symbol nodes.
   */
  extractSymbols(filePath: string, content: string): SymbolNode[] {
    ensureLanguagesRegistered()
    const root = parse('go', content).root()
    const symbols: SymbolNode[] = []
    const seen = new Set<string>()

    const addSymbol = (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      comment: string | undefined,
    ): void => {
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seen.has(key)) return
      seen.add(key)
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

    return symbols
  }

  /**
   * Extracts relations from Go source code.
   * @param filePath - The file path.
   * @param content - The source content.
   * @param symbols - Previously extracted symbols.
   * @param _importMap - Reserved for future use.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _importMap: Map<string, string>,
  ): Relation[] {
    const relations: Relation[] = []

    for (const symbol of symbols) {
      relations.push(
        createRelation({ source: filePath, target: symbol.id, type: RelationType.Defines }),
      )
    }

    this.extractHierarchyRelations(content, filePath, symbols, relations)

    // Go imports are package-level (e.g. "fmt"), not file-level relative imports.
    // Resolving them requires knowledge of the module path and GOPATH,
    // which is deferred to a future version.

    return relations
  }

  /**
   * Extracts deterministic hierarchy relations from local Go declarations.
   * @param content - The source content.
   * @param filePath - The current file path.
   * @param symbols - Previously extracted symbols.
   * @param relations - Array to push relations into.
   */
  private extractHierarchyRelations(
    content: string,
    filePath: string,
    symbols: SymbolNode[],
    relations: Relation[],
  ): void {
    const typeInfos = this.collectTypeInfo(content, filePath, symbols)
    const typeByName = new Map(typeInfos.map((info) => [info.name, info]))
    const methodReceivers = this.collectMethodReceivers(content, filePath, symbols)
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
      const receiverMethods = methodReceivers.get(structInfo.name) ?? new Map<string, string>()
      for (const iface of interfaces) {
        const ifaceMethods = this.collectInterfaceMethodNames(content, iface.line)
        if (ifaceMethods.length === 0) continue
        const implementsAll = ifaceMethods.every((methodName) => receiverMethods.has(methodName))
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
  }

  /**
   * Collects local Go types and embedded interface references.
   * @param content - The source content.
   * @param filePath - The current file path.
   * @param symbols - Previously extracted symbols.
   * @returns Local type declarations.
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
   * Collects method symbols by receiver type name.
   * @param content - The source content.
   * @param filePath - The current file path.
   * @param symbols - Previously extracted symbols.
   * @returns Receiver-name to method-name map.
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
   * Collects named methods declared directly inside an interface block.
   * @param content - The source content.
   * @param line - The 1-based line where the interface begins.
   * @returns Method names declared by the interface.
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
   * Parses Go import declarations from source code.
   * @param filePath - Path to the source file.
   * @param content - The source file content.
   * @returns An array of parsed import declarations.
   */
  extractImportedNames(filePath: string, content: string): ImportDeclaration[] {
    ensureLanguagesRegistered()
    const root = parse('go', content).root()
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
          // Single import without parentheses: import "fmt"
          this.extractGoImportSpec(specListChild, results)
        }
      }
    }

    const textImports = this.extractGoImportsFromText(content)
    return textImports.length > 0 ? textImports : results
  }

  /**
   * Extracts Go import declarations from source text to preserve alias, dot, and blank forms.
   * @param content - Source file content.
   * @returns Parsed import declarations.
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
   * Extracts a single Go import spec into an ImportDeclaration.
   * @param spec - The import_spec AST node.
   * @param results - Array to push declarations into.
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
   * Extracts deterministic Go binding facts for shared scoped resolution.
   * @param filePath - Path to the source file.
   * @param content - Source file content.
   * @param _symbols - Symbols extracted from the file.
   * @param imports - Import declarations extracted from the file.
   * @returns Binding facts for imports and type references.
   */
  extractBindingFacts(
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

    return facts
  }

  /**
   * Extracts normalized Go call facts for shared scoped resolution.
   * @param filePath - Path to the source file.
   * @param content - Source file content.
   * @param symbols - Symbols extracted from the file.
   * @returns Call facts for package selectors, receiver calls, and composite literals.
   */
  extractCallFacts(filePath: string, content: string, symbols: SymbolNode[]): CallFact[] {
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
   * Extracts type declarations (struct, interface, type alias).
   * @param node - The type_declaration AST node.
   * @param filePath - The file path.
   * @param addSymbol - Callback to register a discovered symbol.
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
   * Extracts var or const declarations.
   * @param node - The var_declaration or const_declaration AST node.
   * @param filePath - The file path.
   * @param kind - The symbol kind to assign.
   * @param addSymbol - Callback to register a discovered symbol.
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
