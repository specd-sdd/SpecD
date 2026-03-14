import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
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
 * Language adapter for PHP files using tree-sitter via ast-grep.
 * Extracts functions, classes, methods, interfaces, enums, traits, and constants.
 */
export class PhpLanguageAdapter implements LanguageAdapter {
  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array containing 'php'.
   */
  languages(): string[] {
    return ['php']
  }

  /**
   * Extracts symbol nodes from PHP source code.
   * @param filePath - The file path.
   * @param content - The source content.
   * @returns An array of extracted symbol nodes.
   */
  extractSymbols(filePath: string, content: string): SymbolNode[] {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
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

    this.walk(root, addSymbol)
    return symbols
  }

  /**
   * Extracts relations from PHP source code.
   * @param filePath - The file path.
   * @param content - The source content.
   * @param symbols - Previously extracted symbols.
   * @param _importMap - Reserved for future use.
   * @returns An array of extracted relations.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    _importMap: Map<string, string>,
  ): Relation[] {
    const relations: Relation[] = []

    for (const symbol of symbols) {
      relations.push(
        createRelation({ source: filePath, target: symbol.id, type: RelationType.Defines }),
      )
    }

    // PHP `use` statements reference namespace-based classes, not file paths.
    // Resolving them requires knowledge of the autoloader (PSR-4) mapping,
    // which is deferred to a future version.

    return relations
  }

  /**
   * Recursively walks the AST to extract symbols.
   * @param node - The current AST node.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private walk(
    node: SgNode,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      const kind = nodeKind(child)

      switch (kind) {
        case 'function_definition': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Function, child, extractComment(child))
          break
        }
        case 'class_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Class, child, extractComment(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'interface_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Interface, child, extractComment(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'enum_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Enum, child, extractComment(child))
          break
        }
        case 'trait_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Type, child, extractComment(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'const_declaration': {
          for (const constChild of child.children()) {
            if (nodeKind(constChild) === 'const_element') {
              const nameNode = constChild.child(0)
              if (nameNode && nodeKind(nameNode) === 'name') {
                addSymbol(nameNode.text(), SymbolKind.Variable, constChild, extractComment(child))
              }
            }
          }
          break
        }
        default:
          break
      }
    }
  }

  /**
   * Walks a class/interface/trait body to extract methods.
   * @param classNode - The class/interface/trait AST node.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private walkClassBody(
    classNode: SgNode,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of classNode.children()) {
      if (nodeKind(child) !== 'declaration_list') continue
      for (const member of child.children()) {
        if (nodeKind(member) === 'method_declaration') {
          const name = member.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Method, member, extractComment(member))
        }
      }
    }
  }
}
