import { parse, Lang } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'

/**
 * Determines the tree-sitter language enum for a given file path based on its extension.
 * @param filePath - Absolute or relative path to the source file.
 * @returns The corresponding tree-sitter {@link Lang} value.
 */
function langForFile(filePath: string): Lang {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    return Lang.Tsx
  }
  if (filePath.endsWith('.ts')) {
    return Lang.TypeScript
  }
  return Lang.JavaScript
}

/**
 * Extracts the name field text from an AST node.
 * @param node - The AST node to inspect.
 * @returns The name text, or undefined if the node has no name field.
 */
function getName(node: SgNode): string | undefined {
  return node.field('name')?.text()
}

/**
 * Returns the syntactic kind of an AST node as a string.
 * @param node - The AST node to inspect.
 * @returns The node kind string.
 */
function nodeKind(node: SgNode): string {
  return String(node.kind())
}

/**
 * Extracts the raw comment text immediately preceding a declaration node.
 * Handles export statements and variable declarations by walking up to the
 * appropriate parent before checking the previous sibling.
 * @param node - The AST node representing the declaration.
 * @returns The comment text, or undefined if no comment precedes the node.
 */
function extractComment(node: SgNode): string | undefined {
  let target: SgNode = node
  const parentKind = node.parent() ? nodeKind(node.parent()!) : ''

  if (parentKind === 'export_statement') {
    target = node.parent()!
  }

  if (nodeKind(target) === 'variable_declarator' && target.parent()) {
    const grandparent = target.parent()!
    const grandparentKind = nodeKind(grandparent)
    if (grandparentKind === 'lexical_declaration' || grandparentKind === 'variable_declaration') {
      const ggParent = grandparent.parent()
      if (ggParent && nodeKind(ggParent) === 'export_statement') {
        target = ggParent
      } else {
        target = grandparent
      }
    }
  }

  const prev = target.prev()
  if (prev && nodeKind(prev) === 'comment') {
    return prev.text()
  }
  return undefined
}

/**
 * Recursively collects all descendant nodes whose kind is in the given set.
 * @param node - The root node to traverse.
 * @param kinds - Set of node kind strings to collect.
 * @param results - Accumulator array that matching nodes are pushed into.
 */
function collectByKind(node: SgNode, kinds: Set<string>, results: SgNode[]): void {
  if (kinds.has(nodeKind(node))) {
    results.push(node)
  }
  for (const child of node.children()) {
    collectByKind(child, kinds, results)
  }
}

/**
 * Removes generic arguments and namespace qualifiers from a type reference.
 * @param reference - Raw type reference text.
 * @returns The normalized type name.
 */
function normalizeTypeReference(reference: string): string {
  const withoutGenerics = reference.replace(/<[^>]+>/g, '').trim()
  const tail = withoutGenerics.split('.').at(-1) ?? withoutGenerics
  return tail.replace(/\[\]$/g, '').trim()
}

/**
 * Parses a comma-separated list of type references from a heritage clause.
 * @param clauseText - Clause text following `extends` or `implements`.
 * @returns Normalized type names.
 */
function parseTypeNames(clauseText: string | undefined): string[] {
  if (!clauseText) return []
  return clauseText
    .split(',')
    .map((entry) => normalizeTypeReference(entry))
    .filter((entry) => entry.length > 0)
}

/**
 * Represents a local class or interface declaration and the methods it owns.
 */
interface TypeDeclarationInfo {
  readonly name: string
  readonly symbolId: string
  readonly methodsByName: ReadonlyMap<string, string>
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
}

/**
 * Language adapter for TypeScript, TSX, JavaScript, and JSX files.
 * Uses tree-sitter via ast-grep to extract symbols and relations from source code.
 */
export class TypeScriptLanguageAdapter implements LanguageAdapter {
  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array of supported language strings.
   */
  languages(): string[] {
    return ['typescript', 'tsx', 'javascript', 'jsx']
  }

  /**
   * Returns the file extension to language ID mapping for TypeScript/JavaScript.
   * @returns Extension-to-language map.
   */
  extensions(): Record<string, string> {
    return { '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx' }
  }

  /**
   * Parses a source file and extracts all symbol nodes (functions, classes, methods, types, etc.).
   * @param filePath - Path to the source file.
   * @param content - The source file content.
   * @returns An array of extracted symbol nodes.
   */
  extractSymbols(filePath: string, content: string): SymbolNode[] {
    const lang = langForFile(filePath)
    const root = parse(lang, content).root()
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

    const allNodes: SgNode[] = []
    const targetKinds = new Set([
      'function_declaration',
      'class_declaration',
      'abstract_class_declaration',
      'method_definition',
      'type_alias_declaration',
      'interface_declaration',
      'enum_declaration',
      'lexical_declaration',
      'variable_declaration',
      'export_statement',
    ])
    collectByKind(root, targetKinds, allNodes)

    for (const node of allNodes) {
      switch (nodeKind(node)) {
        case 'function_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Function, node, extractComment(node))
          break
        }
        case 'class_declaration':
        case 'abstract_class_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Class, node, extractComment(node))
          break
        }
        case 'method_definition': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Method, node, extractComment(node))
          break
        }
        case 'type_alias_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Type, node, extractComment(node))
          break
        }
        case 'interface_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Interface, node, extractComment(node))
          break
        }
        case 'enum_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Enum, node, extractComment(node))
          break
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          this.processVariableDeclaration(node, filePath, addSymbol)
          break
        }
        case 'export_statement': {
          const decl = node.field('declaration')
          if (
            decl &&
            (nodeKind(decl) === 'lexical_declaration' || nodeKind(decl) === 'variable_declaration')
          ) {
            this.processExportedVariableDeclaration(decl, filePath, addSymbol)
          }
          break
        }
      }
    }

    return symbols
  }

  /**
   * Processes a variable declaration node to extract function-assigned variables as symbols.
   * @param node - The variable declaration AST node.
   * @param filePath - Path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processVariableDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      if (nodeKind(child) !== 'variable_declarator') continue
      const nameNode = child.field('name')
      if (!nameNode) continue
      const name = nameNode.text()

      const valueNode = child.field('value')
      if (
        valueNode &&
        (nodeKind(valueNode) === 'arrow_function' || nodeKind(valueNode) === 'function')
      ) {
        addSymbol(name, SymbolKind.Function, child, extractComment(child))
      }
    }
  }

  /**
   * Processes an exported variable declaration, extracting both function-assigned and plain variable symbols.
   * @param node - The variable declaration AST node inside an export statement.
   * @param filePath - Path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processExportedVariableDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      if (nodeKind(child) !== 'variable_declarator') continue
      const nameNode = child.field('name')
      if (!nameNode) continue
      const name = nameNode.text()

      const valueNode = child.field('value')
      if (
        valueNode &&
        (nodeKind(valueNode) === 'arrow_function' || nodeKind(valueNode) === 'function')
      ) {
        addSymbol(name, SymbolKind.Function, child, extractComment(child))
      } else {
        addSymbol(name, SymbolKind.Variable, child, extractComment(child))
      }
    }
  }

  /**
   * Parses TypeScript/JavaScript import declarations from source code.
   * @param filePath - Path to the source file.
   * @param content - The source file content.
   * @returns An array of parsed import declarations.
   */
  extractImportedNames(filePath: string, content: string): ImportDeclaration[] {
    const lang = langForFile(filePath)
    const root = parse(lang, content).root()
    const results: ImportDeclaration[] = []

    for (const child of root.children()) {
      if (nodeKind(child) !== 'import_statement') continue

      const sourceNode = child.field('source')
      if (!sourceNode) continue
      const specifier = sourceNode.text().replace(/['"]/g, '')
      const isRelative = specifier.startsWith('.')

      for (const importChild of child.children()) {
        if (nodeKind(importChild) === 'import_clause') {
          for (const clauseChild of importChild.children()) {
            const clauseKind = nodeKind(clauseChild)
            if (clauseKind === 'named_imports') {
              for (const spec of clauseChild.children()) {
                if (nodeKind(spec) === 'import_specifier') {
                  const nameNode = spec.field('name')
                  const aliasNode = spec.field('alias')
                  if (nameNode) {
                    results.push({
                      originalName: nameNode.text(),
                      localName: aliasNode ? aliasNode.text() : nameNode.text(),
                      specifier,
                      isRelative,
                    })
                  }
                }
              }
            } else if (clauseKind === 'identifier') {
              // Default import: import Foo from '...'
              results.push({
                originalName: 'default',
                localName: clauseChild.text(),
                specifier,
                isRelative,
              })
            } else if (clauseKind === 'namespace_import') {
              // Namespace import: import * as Foo from '...'
              for (const nsChild of clauseChild.children()) {
                if (nodeKind(nsChild) === 'identifier') {
                  results.push({
                    originalName: '*',
                    localName: nsChild.text(),
                    specifier,
                    isRelative,
                  })
                  break
                }
              }
            }
          }
        }
      }
    }

    return results
  }

  /**
   * Extracts relations (defines, exports, imports, calls) from a parsed source file.
   * @param filePath - Path to the source file.
   * @param content - The source file content.
   * @param symbols - Previously extracted symbols for this file.
   * @param importMap - Map of imported names to their symbol ids for CALLS resolution.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
  ): Relation[] {
    const lang = langForFile(filePath)
    const root = parse(lang, content).root()
    const relations: Relation[] = []

    for (const symbol of symbols) {
      relations.push(
        createRelation({
          source: filePath,
          target: symbol.id,
          type: RelationType.Defines,
        }),
      )
    }

    this.extractExportRelations(root, filePath, symbols, relations)
    this.extractImportRelations(root, filePath, relations)
    this.extractHierarchyRelations(root, symbols, importMap, relations)
    this.extractCallRelations(root, symbols, importMap, relations)

    return relations
  }

  /**
   * Extracts `EXTENDS`, `IMPLEMENTS`, and local `OVERRIDES` relations.
   * @param root - The parsed source root.
   * @param symbols - Symbols declared in the current file.
   * @param importMap - Resolved imported type names.
   * @param relations - Accumulator array for discovered relations.
   */
  private extractHierarchyRelations(
    root: SgNode,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
    relations: Relation[],
  ): void {
    const declarations = this.collectTypeDeclarations(root, symbols)
    const declarationsByName = new Map(
      declarations.map((declaration) => [declaration.name, declaration]),
    )
    const seen = new Set<string>()

    for (const declaration of declarations) {
      for (const parentName of declaration.extendsNames) {
        const targetId = importMap.get(parentName) ?? declarationsByName.get(parentName)?.symbolId
        if (!targetId) continue

        const key = `${declaration.symbolId}:${RelationType.Extends}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: declaration.symbolId,
              target: targetId,
              type: RelationType.Extends,
            }),
          )
        }

        const localTarget = declarationsByName.get(parentName)
        if (localTarget) {
          this.addOverrideRelations(
            declaration,
            localTarget,
            RelationType.Overrides,
            relations,
            seen,
          )
        }
      }

      for (const contractName of declaration.implementsNames) {
        const targetId =
          importMap.get(contractName) ?? declarationsByName.get(contractName)?.symbolId
        if (!targetId) continue

        const key = `${declaration.symbolId}:${RelationType.Implements}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: declaration.symbolId,
              target: targetId,
              type: RelationType.Implements,
            }),
          )
        }

        const localTarget = declarationsByName.get(contractName)
        if (localTarget) {
          this.addOverrideRelations(
            declaration,
            localTarget,
            RelationType.Overrides,
            relations,
            seen,
          )
        }
      }
    }
  }

  /**
   * Builds local class/interface metadata needed for hierarchy extraction.
   * @param root - Parsed source root.
   * @param symbols - Symbols declared in the current file.
   * @returns Local type declarations with method ownership and heritage data.
   */
  private collectTypeDeclarations(root: SgNode, symbols: SymbolNode[]): TypeDeclarationInfo[] {
    const declarations: TypeDeclarationInfo[] = []
    const nodes: SgNode[] = []
    collectByKind(
      root,
      new Set(['class_declaration', 'abstract_class_declaration', 'interface_declaration']),
      nodes,
    )

    for (const node of nodes) {
      const name = getName(node)
      if (!name) continue

      const lineStart = node.range().start.line + 1
      const lineEnd = node.range().end.line + 1
      const symbolId = symbols.find(
        (symbol) =>
          symbol.name === name &&
          symbol.line === lineStart &&
          (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface),
      )?.id
      if (!symbolId) continue

      const header = node.text().split('{')[0] ?? node.text()
      const extendsMatch = header.match(/\bextends\s+([^{]+?)(?:\bimplements\b|$)/)
      const implementsMatch = header.match(/\bimplements\s+([^{]+)$/)
      const methodsByName = new Map<string, string>()

      for (const symbol of symbols) {
        if (symbol.kind !== SymbolKind.Method) continue
        if (symbol.line <= lineStart || symbol.line > lineEnd) continue
        methodsByName.set(symbol.name, symbol.id)
      }

      declarations.push({
        name,
        symbolId,
        methodsByName,
        extendsNames:
          nodeKind(node) === 'interface_declaration'
            ? parseTypeNames(extendsMatch?.[1])
            : parseTypeNames(extendsMatch?.[1]).slice(0, 1),
        implementsNames:
          nodeKind(node) === 'interface_declaration' ? [] : parseTypeNames(implementsMatch?.[1]),
      })
    }

    return declarations
  }

  /**
   * Emits method-level `OVERRIDES` relations for matching local declarations.
   * @param source - Child declaration info.
   * @param target - Base or contract declaration info.
   * @param relationType - The hierarchy relation type to emit.
   * @param relations - Accumulator array for discovered relations.
   * @param seen - Deduplication set.
   */
  private addOverrideRelations(
    source: TypeDeclarationInfo,
    target: TypeDeclarationInfo,
    relationType: RelationType,
    relations: Relation[],
    seen: Set<string>,
  ): void {
    for (const [methodName, methodId] of source.methodsByName.entries()) {
      const targetMethodId = target.methodsByName.get(methodName)
      if (!targetMethodId) continue
      const key = `${methodId}:${relationType}:${targetMethodId}`
      if (seen.has(key)) continue
      seen.add(key)
      relations.push(
        createRelation({
          source: methodId,
          target: targetMethodId,
          type: relationType,
        }),
      )
    }
  }

  /**
   * Extracts export relations by matching exported names to known symbols.
   * @param root - The root AST node of the file.
   * @param filePath - Path to the source file.
   * @param symbols - Known symbols in this file.
   * @param relations - Accumulator array for discovered relations.
   */
  private extractExportRelations(
    root: SgNode,
    filePath: string,
    symbols: SymbolNode[],
    relations: Relation[],
  ): void {
    const exportedNames = new Set<string>()

    for (const child of root.children()) {
      if (nodeKind(child) !== 'export_statement') continue

      const decl = child.field('declaration')
      if (decl) {
        const name = getName(decl)
        if (name) exportedNames.add(name)

        if (nodeKind(decl) === 'lexical_declaration' || nodeKind(decl) === 'variable_declaration') {
          for (const declarator of decl.children()) {
            if (nodeKind(declarator) === 'variable_declarator') {
              const varName = declarator.field('name')?.text()
              if (varName) exportedNames.add(varName)
            }
          }
        }
      }

      for (const specChild of child.children()) {
        if (nodeKind(specChild) === 'export_clause') {
          for (const specifier of specChild.children()) {
            if (nodeKind(specifier) === 'export_specifier') {
              const nameNode = specifier.field('name')
              if (nameNode) exportedNames.add(nameNode.text())
            }
          }
        }
      }
    }

    for (const symbol of symbols) {
      if (exportedNames.has(symbol.name)) {
        relations.push(
          createRelation({
            source: filePath,
            target: symbol.id,
            type: RelationType.Exports,
          }),
        )
      }
    }
  }

  /**
   * Extracts import relations from relative import statements.
   * @param root - The root AST node of the file.
   * @param filePath - Path to the source file.
   * @param relations - Accumulator array for discovered relations.
   */
  private extractImportRelations(root: SgNode, filePath: string, relations: Relation[]): void {
    for (const child of root.children()) {
      if (nodeKind(child) !== 'import_statement') continue

      const sourceNode = child.field('source')
      if (!sourceNode) continue
      const specifier = sourceNode.text().replace(/['"]/g, '')

      if (!specifier.startsWith('.')) continue

      const resolved = this.resolveRelativeImportPath(filePath, specifier)
      const target = Array.isArray(resolved) ? resolved[0]! : resolved
      relations.push(
        createRelation({
          source: filePath,
          target,
          type: RelationType.Imports,
          metadata: { specifier },
        }),
      )
    }
  }

  /**
   * Extracts CALLS relations by walking call_expression nodes in the AST.
   * Resolves callees via local symbols and the import map.
   * @param root - The root AST node.
   * @param symbols - Known symbols in this file.
   * @param importMap - Map of imported names to their symbol ids.
   * @param relations - Accumulator array for discovered relations.
   */
  private extractCallRelations(
    root: SgNode,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
    relations: Relation[],
  ): void {
    const localSymbolsByName = new Map<string, string>()
    for (const s of symbols) {
      localSymbolsByName.set(s.name, s.id)
    }

    const seen = new Set<string>()

    const walkCalls = (node: SgNode): void => {
      if (nodeKind(node) === 'call_expression') {
        const fnNode = node.field('function')
        if (fnNode && nodeKind(fnNode) === 'identifier') {
          const calleeName = fnNode.text()
          const calleeId = importMap.get(calleeName) ?? localSymbolsByName.get(calleeName)

          if (calleeId) {
            const callerId = this.findEnclosingSymbolId(node, symbols)
            if (callerId) {
              const key = `${callerId}->${calleeId}`
              if (!seen.has(key)) {
                seen.add(key)
                relations.push(
                  createRelation({
                    source: callerId,
                    target: calleeId,
                    type: RelationType.Calls,
                  }),
                )
              }
            }
          }
        }
      }

      for (const child of node.children()) {
        walkCalls(child)
      }
    }

    walkCalls(root)
  }

  /**
   * Finds the id of the innermost enclosing function, method, or class for a node.
   * @param node - The AST node to find the enclosing scope for.
   * @param symbols - Known symbols in this file.
   * @returns The symbol id of the enclosing scope, or undefined if at module level.
   */
  private findEnclosingSymbolId(node: SgNode, symbols: SymbolNode[]): string | undefined {
    let current = node.parent()
    while (current) {
      const kind = nodeKind(current)
      if (
        kind === 'function_declaration' ||
        kind === 'method_definition' ||
        kind === 'arrow_function' ||
        kind === 'function'
      ) {
        const name = getName(current)
        if (name) {
          const line = current.range().start.line + 1
          return symbols.find((s) => s.name === name && s.line === line)?.id
        }
        // Arrow/function expression assigned to variable — check parent variable_declarator
        if (kind === 'arrow_function' || kind === 'function') {
          const declarator = current.parent()
          if (declarator && nodeKind(declarator) === 'variable_declarator') {
            const varName = declarator.field('name')?.text()
            if (varName) {
              const line = declarator.range().start.line + 1
              return symbols.find((s) => s.name === varName && s.line === line)?.id
            }
          }
        }
      }
      current = current.parent()
    }
    return undefined
  }

  /**
   * Resolves a relative import specifier to a file path.
   * Maps JS extensions to their TS equivalents (`.js` → `.ts`, `.jsx` → `.tsx`)
   * and appends `.ts` for extensionless specifiers.
   * @param fromFile - The importing file path.
   * @param specifier - The relative import specifier.
   * @returns The resolved file path.
   */
  resolveRelativeImportPath(fromFile: string, specifier: string): string | string[] {
    // Separate workspace prefix (e.g. "core:src/foo.ts" → "core:", "src/foo.ts")
    const colonIdx = fromFile.indexOf(':')
    const wsPrefix = colonIdx === -1 ? '' : fromFile.substring(0, colonIdx + 1)
    const relFile = colonIdx === -1 ? fromFile : fromFile.substring(colonIdx + 1)

    const relDir = relFile.substring(0, relFile.lastIndexOf('/'))
    const parts = specifier.split('/')
    const segments = relDir ? relDir.split('/') : []

    for (const part of parts) {
      if (part === '.') continue
      if (part === '..') {
        if (segments.length > 0) segments.pop()
      } else {
        segments.push(part)
      }
    }

    let resolved = wsPrefix + segments.join('/')

    // Map JS extensions to TS equivalents (ESM convention)
    if (resolved.endsWith('.js')) {
      resolved = resolved.slice(0, -3) + '.ts'
    } else if (resolved.endsWith('.jsx')) {
      resolved = resolved.slice(0, -4) + '.tsx'
    } else if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) {
      // Already a TS extension — keep as-is
    } else if (!resolved.includes('.', resolved.lastIndexOf('/') + 1)) {
      // Extensionless — could be a file or a directory with index.ts
      return [resolved + '.ts', resolved + '/index.ts']
    }

    return resolved
  }

  /**
   * Extracts the package name from a non-relative import specifier.
   * Scoped packages: first two segments (`@scope/name`).
   * Bare packages: first segment.
   * @param specifier - The import specifier.
   * @param knownPackages - Known package identities.
   * @returns The matching package name, or undefined.
   */
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined {
    const pkgName = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]!
    return knownPackages.includes(pkgName) ? pkgName : undefined
  }

  /**
   * Reads the package identity by searching for `package.json` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The `name` field from the nearest `package.json`, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'package.json',
      (content) => {
        const pkg = JSON.parse(content) as { name?: string }
        return pkg.name
      },
      repoRoot,
    )
  }
}
