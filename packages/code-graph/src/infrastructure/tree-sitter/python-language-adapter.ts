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
   * Returns the file extension to language ID mapping for Python.
   * @returns Extension-to-language map.
   */
  extensions(): Record<string, string> {
    return { '.py': 'python', '.pyi': 'python' }
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
   * @param importMap - Map of imported name to resolved symbol id.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
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
    this.extractCallRelations(root, filePath, symbols, importMap, relations)
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
   * Finds the enclosing function/method/class symbol for a given AST node.
   * @param node - The AST node to find the enclosing symbol for.
   * @param symbols - The extracted symbols for this file.
   * @param filePath - The current file path.
   * @returns The symbol id of the enclosing scope, or undefined if at module level.
   */
  private findEnclosingSymbolId(
    node: SgNode,
    symbols: SymbolNode[],
    filePath: string,
  ): string | undefined {
    let current = node.parent()
    while (current) {
      const kind = nodeKind(current)
      if (kind === 'function_definition' || kind === 'class_definition') {
        const name = current.field('name')?.text()
        if (name) {
          const line = current.range().start.line + 1
          return symbols.find((s) => s.name === name && s.line === line && s.filePath === filePath)
            ?.id
        }
      }
      current = current.parent()
    }
    return undefined
  }

  /**
   * Extracts CALLS relations from Python function/method call expressions.
   * @param root - The root AST node.
   * @param filePath - The current file path.
   * @param symbols - The extracted symbols for this file.
   * @param importMap - Map of imported name to resolved symbol id.
   * @param relations - Array to push relations into.
   */
  private extractCallRelations(
    root: SgNode,
    filePath: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
    relations: Relation[],
  ): void {
    // Maps symbol name → all candidate ids, grouped for scope-based disambiguation.
    const localSymbolsByName = new Map<string, SymbolNode[]>()
    for (const s of symbols) {
      const existing = localSymbolsByName.get(s.name)
      if (existing) {
        existing.push(s)
      } else {
        localSymbolsByName.set(s.name, [s])
      }
    }

    const seen = new Set<string>()

    const walkCalls = (node: SgNode): void => {
      for (const child of node.children()) {
        if (nodeKind(child) === 'call') {
          const funcNode = child.field('function')
          if (funcNode) {
            const calleeName =
              nodeKind(funcNode) === 'identifier'
                ? funcNode.text()
                : nodeKind(funcNode) === 'attribute'
                  ? funcNode.field('attribute')?.text()
                  : undefined

            if (calleeName) {
              const importedId = importMap.get(calleeName)
              const calleeId =
                importedId ?? this.resolveLocalCallee(child, calleeName, localSymbolsByName)
              if (calleeId) {
                const callerId = this.findEnclosingSymbolId(child, symbols, filePath)
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
        }
        walkCalls(child)
      }
    }

    walkCalls(root)
  }

  /**
   * Resolves a local callee name to the best-matching symbol id by scope proximity.
   * When multiple symbols share a name (e.g. module-level function and a method),
   * prefers the one whose line is closest to and before the call site.
   * @param callNode - The call expression AST node.
   * @param name - The callee name to resolve.
   * @param candidates - Map of name → candidate symbols.
   * @returns The best-matching symbol id, or undefined.
   */
  private resolveLocalCallee(
    callNode: SgNode,
    name: string,
    candidates: Map<string, SymbolNode[]>,
  ): string | undefined {
    const syms = candidates.get(name)
    if (!syms || syms.length === 0) return undefined
    if (syms.length === 1) return syms[0]!.id

    // Find the enclosing scope to prefer same-scope symbols
    const callLine = callNode.range().start.line + 1
    let enclosingClass: string | undefined
    let current = callNode.parent()
    while (current) {
      if (nodeKind(current) === 'class_definition') {
        enclosingClass = current.field('name')?.text()
        break
      }
      current = current.parent()
    }

    // Prefer method in same class over module-level function
    if (enclosingClass) {
      const method = syms.find((s) => s.kind === 'method' && s.line <= callLine)
      if (method) return method.id
    }

    // Fall back to the symbol defined closest before the call site
    let best: SymbolNode | undefined
    for (const s of syms) {
      if (s.line <= callLine) {
        if (!best || s.line > best.line) {
          best = s
        }
      }
    }
    return best?.id ?? syms[0]!.id
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

        const resolved = this.resolveRelativeImportPath(filePath, moduleName)
        const target = Array.isArray(resolved) ? resolved[0]! : resolved
        if (target) {
          relations.push(
            createRelation({
              source: filePath,
              target,
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
   * @param specifier - The dot-prefixed module name.
   * @returns The resolved file path.
   */
  resolveRelativeImportPath(fromFile: string, specifier: string): string | string[] {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
    const segments = fromDir.split('/')

    // Count leading dots: first dot = current dir, each extra dot = go up
    let dots = 0
    while (dots < specifier.length && specifier[dots] === '.') dots++

    // Go up (dots - 1) levels: first dot is the relative marker (current dir)
    for (let i = 1; i < dots; i++) {
      if (segments.length > 1) segments.pop()
    }

    // Remaining part after the dots is the module path
    const modulePart = specifier.substring(dots)
    if (modulePart) {
      for (const part of modulePart.split('.')) {
        segments.push(part)
      }
    }

    // If there's no module part after dots, this is a package-level import (e.g. `from . import X`)
    // which refers to the __init__.py in the resolved directory
    if (!modulePart) {
      return segments.join('/') + '/__init__.py'
    }
    // Without filesystem access we cannot distinguish module files from package
    // directories (e.g. `from .sub import bar` could be `sub.py` or `sub/__init__.py`).
    const base = segments.join('/')
    return [base + '.py', base + '/__init__.py']
  }

  /**
   * Resolves a Python import specifier to a known package.
   * Normalizes hyphens and underscores for matching.
   * @param specifier - The import specifier (e.g. `acme_auth.models`).
   * @param knownPackages - Known package names from `pyproject.toml`.
   * @returns The matching package name, or undefined.
   */
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined {
    if (!specifier) return undefined
    const topLevel = specifier.split('.')[0]
    if (!topLevel) return undefined
    const normalized = topLevel.replaceAll('_', '-')
    return knownPackages.find((pkg) => pkg.replaceAll('_', '-') === normalized)
  }

  /**
   * Reads the package identity by searching for `pyproject.toml` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The project name from the nearest `pyproject.toml`, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'pyproject.toml',
      (content) => {
        const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
        return match?.[1]
      },
      repoRoot,
    )
  }
}
