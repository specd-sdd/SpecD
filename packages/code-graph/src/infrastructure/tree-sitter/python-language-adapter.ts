import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
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
 * Checks whether a function_definition node is a method (nested inside a class body).
 * @param node - The function_definition AST node.
 * @returns True if the function is inside a class definition.
 */
function isMethod(node: SgNode): boolean {
  // Hierarchy: class_definition > block > function_definition
  const block = node.parent()
  if (!block || nodeKind(block) !== 'block') return false
  const classDef = block.parent()
  return classDef !== null && nodeKind(classDef) === 'class_definition'
}

/**
 * Language adapter for Python files using tree-sitter via ast-grep.
 * Extracts functions, classes, methods, and module-level assignments.
 */
export class PythonLanguageAdapter implements LanguageAdapter {
  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array containing 'python'.
   */
  languages(): string[] {
    return ['python']
  }

  /**
   * Extracts symbol nodes from Python source code.
   * @param filePath - The file path.
   * @param content - The source content.
   * @returns An array of extracted symbol nodes.
   */
  extractSymbols(filePath: string, content: string): SymbolNode[] {
    ensureLanguagesRegistered()
    const root = parse('python', content).root()
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
   * Extracts relations from Python source code.
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
    ensureLanguagesRegistered()
    const root = parse('python', content).root()
    const relations: Relation[] = []

    for (const symbol of symbols) {
      relations.push(
        createRelation({ source: filePath, target: symbol.id, type: RelationType.Defines }),
      )
    }

    this.extractImportRelations(root, filePath, relations)
    return relations
  }

  /**
   * Parses Python import declarations from source code.
   * @param _filePath - Path to the source file (unused — Python imports are not path-relative).
   * @param content - The source file content.
   * @returns An array of parsed import declarations.
   */
  extractImportedNames(_filePath: string, content: string): ImportDeclaration[] {
    ensureLanguagesRegistered()
    const root = parse('python', content).root()
    const results: ImportDeclaration[] = []

    for (const child of root.children()) {
      const kind = nodeKind(child)

      if (kind === 'import_statement') {
        // import os / import os.path
        for (const nameChild of child.children()) {
          if (nodeKind(nameChild) === 'dotted_name') {
            const name = nameChild.text()
            results.push({
              originalName: name,
              localName: name,
              specifier: name,
              isRelative: false,
            })
          } else if (nodeKind(nameChild) === 'aliased_import') {
            const dottedName = nameChild.child(0)
            const alias = nameChild.field('alias')
            if (dottedName) {
              const name = dottedName.text()
              results.push({
                originalName: name,
                localName: alias ? alias.text() : name,
                specifier: name,
                isRelative: false,
              })
            }
          }
        }
      } else if (kind === 'import_from_statement') {
        // from pathlib import Path / from .utils import helper
        const moduleNode = child.field('module_name')
        const specifier = moduleNode ? moduleNode.text() : ''
        const isRelative = specifier.startsWith('.')
        const moduleNodeId = moduleNode?.id()

        let seenImportKeyword = false
        for (const nameChild of child.children()) {
          // Track the 'import' keyword to distinguish module name from imported names
          if (!nameChild.isNamed() && nameChild.text() === 'import') {
            seenImportKeyword = true
            continue
          }
          if (nodeKind(nameChild) === 'dotted_name') {
            // Skip the module name (before 'import' keyword)
            if (!seenImportKeyword || nameChild.id() === moduleNodeId) continue
            const name = nameChild.text()
            results.push({
              originalName: name,
              localName: name,
              specifier,
              isRelative,
            })
          } else if (nodeKind(nameChild) === 'aliased_import') {
            const dottedName = nameChild.child(0)
            const alias = nameChild.field('alias')
            if (dottedName) {
              const name = dottedName.text()
              results.push({
                originalName: name,
                localName: alias ? alias.text() : name,
                specifier,
                isRelative,
              })
            }
          }
        }
      }
    }

    return results
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
          if (name) {
            const symKind = isMethod(child) ? SymbolKind.Method : SymbolKind.Function
            addSymbol(name, symKind, child, extractComment(child))
          }
          break
        }
        case 'class_definition': {
          const name = child.field('name')?.text()
          if (name) {
            addSymbol(name, SymbolKind.Class, child, extractComment(child))
          }
          // Walk into class body (block) for methods
          this.walk(child, addSymbol)
          break
        }
        case 'block': {
          // Recurse into block to find methods inside class bodies
          this.walk(child, addSymbol)
          break
        }
        case 'expression_statement': {
          // Module-level assignment: NAME = value
          const parent = child.parent()
          if (parent && nodeKind(parent) === 'module') {
            const firstChild = child.child(0)
            if (firstChild && nodeKind(firstChild) === 'assignment') {
              const left = firstChild.field('left')
              if (left && nodeKind(left) === 'identifier') {
                addSymbol(left.text(), SymbolKind.Variable, child, extractComment(child))
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
   * Extracts import relations from Python import statements.
   * @param root - The root AST node.
   * @param filePath - The current file path.
   * @param relations - Array to push relations into.
   */
  private extractImportRelations(root: SgNode, filePath: string, relations: Relation[]): void {
    for (const child of root.children()) {
      const kind = nodeKind(child)
      if (kind === 'import_from_statement') {
        const moduleNode = child.field('module_name')
        if (!moduleNode) continue
        const moduleName = moduleNode.text()
        if (!moduleName.startsWith('.')) continue

        const resolved = this.resolveRelativeImport(filePath, moduleName)
        if (resolved) {
          relations.push(
            createRelation({
              source: filePath,
              target: resolved,
              type: RelationType.Imports,
              metadata: { specifier: moduleName },
            }),
          )
        }
      }
    }
  }

  /**
   * Resolves a relative Python import to a file path.
   * @param fromFile - The importing file path.
   * @param moduleName - The dot-prefixed module name.
   * @returns The resolved file path, or undefined.
   */
  private resolveRelativeImport(fromFile: string, moduleName: string): string | undefined {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
    const parts = moduleName.split('.')
    const segments = fromDir.split('/')

    for (const part of parts) {
      if (part === '') {
        segments.pop()
      } else {
        segments.push(part)
      }
    }

    return segments.join('/') + '.py'
  }
}
