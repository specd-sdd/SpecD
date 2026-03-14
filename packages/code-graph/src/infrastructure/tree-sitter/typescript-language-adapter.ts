import { parse, Lang } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'

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
      const key = `${kind}:${name}:${line}`
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
   * Extracts relations (defines, exports, imports) from a parsed source file.
   * @param filePath - Path to the source file.
   * @param content - The source file content.
   * @param symbols - Previously extracted symbols for this file.
   * @param _importMap - Reserved for future use; currently unused.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _importMap: Map<string, string>,
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

    return relations
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

      const resolvedPath = this.resolveImportPath(filePath, specifier)
      relations.push(
        createRelation({
          source: filePath,
          target: resolvedPath,
          type: RelationType.Imports,
          metadata: { specifier },
        }),
      )
    }
  }

  /**
   * Resolves a relative import specifier to an absolute-style file path.
   * @param fromFile - The file containing the import statement.
   * @param specifier - The relative import specifier string.
   * @returns The resolved file path.
   */
  private resolveImportPath(fromFile: string, specifier: string): string {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
    const parts = specifier.split('/')
    const segments = fromDir.split('/')

    for (const part of parts) {
      if (part === '.') continue
      if (part === '..') {
        segments.pop()
      } else {
        segments.push(part)
      }
    }

    let resolved = segments.join('/')
    resolved = resolved.replace(/\.js$/, '.ts')

    if (!resolved.includes('.')) {
      resolved += '.ts'
    }

    return resolved
  }
}
