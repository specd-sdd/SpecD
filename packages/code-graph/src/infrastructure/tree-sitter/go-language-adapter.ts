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

    // Go imports are package-level (e.g. "fmt"), not file-level relative imports.
    // Resolving them requires knowledge of the module path and GOPATH,
    // which is deferred to a future version.

    return relations
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

    return results
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
    results.push({
      originalName: lastSegment,
      localName: alias ?? lastSegment,
      specifier: pathLiteral,
      isRelative: false,
    })
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
