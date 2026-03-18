import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
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
   * Returns the file extension to language ID mapping for PHP.
   * @returns Extension-to-language map.
   */
  extensions(): Record<string, string> {
    return { '.php': 'php' }
  }

  /**
   * Extracts the namespace declaration from PHP source code.
   * @param content - The PHP source file content.
   * @returns The namespace string (e.g. 'App\Models'), or undefined if no namespace is declared.
   */
  extractNamespace(content: string): string | undefined {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    return this.findNamespace(root)
  }

  /**
   * Recursively finds the namespace_definition node and returns the namespace string.
   * @param node - The AST node to search.
   * @returns The namespace string, or undefined.
   */
  private findNamespace(node: SgNode): string | undefined {
    for (const child of node.children()) {
      const kind = nodeKind(child)
      if (kind === 'namespace_definition') {
        for (const part of child.children()) {
          if (nodeKind(part) === 'namespace_name') {
            return part.text()
          }
        }
      } else if (kind === 'program') {
        const result = this.findNamespace(child)
        if (result) return result
      }
    }
    return undefined
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

    this.walk(root, addSymbol)
    return symbols
  }

  /**
   * Extracts relations from PHP source code.
   * @param filePath - The file path.
   * @param _content - The source content (unused — relations derived from symbols).
   * @param symbols - Previously extracted symbols.
   * @param _importMap - Reserved for future use.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    _content: string,
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

    // PHP `use` statements reference namespace-based classes, not file paths.
    // Resolving them requires knowledge of the autoloader (PSR-4) mapping,
    // which is deferred to a future version.

    return relations
  }

  /**
   * Parses PHP use declarations from source code.
   * @param _filePath - Path to the source file (unused — PHP uses namespaces, not paths).
   * @param content - The source file content.
   * @returns An array of parsed import declarations.
   */
  extractImportedNames(_filePath: string, content: string): ImportDeclaration[] {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    const results: ImportDeclaration[] = []

    this.walkForUseDeclarations(root, results)

    return results
  }

  /**
   * Recursively walks the AST to find namespace_use_declaration nodes.
   * @param node - The current AST node.
   * @param results - Array to push declarations into.
   */
  private walkForUseDeclarations(node: SgNode, results: ImportDeclaration[]): void {
    for (const child of node.children()) {
      const kind = nodeKind(child)

      if (kind === 'namespace_use_declaration') {
        for (const clauseChild of child.children()) {
          if (nodeKind(clauseChild) === 'namespace_use_clause') {
            let qualifiedName: string | undefined
            let alias: string | undefined

            let seenAs = false
            for (const part of clauseChild.children()) {
              const partKind = nodeKind(part)
              if (partKind === 'qualified_name') {
                qualifiedName = part.text()
              } else if (!part.isNamed() && part.text() === 'as') {
                seenAs = true
              } else if (seenAs && partKind === 'name') {
                alias = part.text()
              } else if (partKind === 'namespace_aliasing_clause') {
                for (const aliasChild of part.children()) {
                  if (nodeKind(aliasChild) === 'name') {
                    alias = aliasChild.text()
                  }
                }
              }
            }

            if (qualifiedName) {
              const segments = qualifiedName.split('\\')
              const originalName = segments[segments.length - 1] ?? qualifiedName
              results.push({
                originalName,
                localName: alias ?? originalName,
                specifier: qualifiedName,
                isRelative: false,
              })
            }
          }
        }
      } else if (kind === 'program') {
        // PHP AST wraps content in a program node; recurse into it
        this.walkForUseDeclarations(child, results)
      } else if (kind === 'namespace_definition') {
        // Block-style namespace: namespace Foo\Bar { ... }
        for (const nsChild of child.children()) {
          if (nodeKind(nsChild) === 'compound_statement') {
            this.walkForUseDeclarations(nsChild, results)
          }
        }
      }
    }
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
        case 'namespace_definition': {
          // Block-style namespace: namespace Foo\Bar { ... }
          for (const nsChild of child.children()) {
            if (nodeKind(nsChild) === 'compound_statement') {
              this.walk(nsChild, addSymbol)
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
   * Walks a class/interface/trait body to extract methods and properties.
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
        const memberKind = nodeKind(member)
        if (memberKind === 'method_declaration') {
          const name = member.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Method, member, extractComment(member))
        } else if (memberKind === 'property_declaration') {
          for (const propChild of member.children()) {
            if (nodeKind(propChild) === 'property_element') {
              const varName = propChild.field('name')
              if (varName) {
                // Strip the leading $ from PHP variable names
                const name = varName.text().replace(/^\$/, '')
                if (name) addSymbol(name, SymbolKind.Variable, member, extractComment(member))
              }
            }
          }
        }
      }
    }
  }

  /**
   * Builds a PHP qualified name from namespace and symbol name.
   * @param namespace - The namespace (e.g. `App\Models`).
   * @param symbolName - The symbol name (e.g. `User`).
   * @returns The qualified name (e.g. `App\Models\User`).
   */
  buildQualifiedName(namespace: string, symbolName: string): string {
    return `${namespace}\\${symbolName}`
  }

  /**
   * Reads the package identity by searching for `composer.json` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The `name` field from the nearest `composer.json`, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'composer.json',
      (content) => {
        const pkg = JSON.parse(content) as { name?: string }
        return pkg.name
      },
      repoRoot,
    )
  }
}
