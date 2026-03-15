import { type SymbolNode } from './symbol-node.js'
import { type Relation } from './relation.js'
import { type ImportDeclaration } from './import-declaration.js'

/**
 * Adapter for extracting symbols, relations, and imports from source files of a specific language.
 * All methods are synchronous and pure — they receive content as a string, not file handles.
 */
export interface LanguageAdapter {
  /**
   * Returns the language identifiers this adapter supports.
   * @returns An array of language identifier strings.
   */
  languages(): string[]

  /**
   * Extracts symbol nodes from a source file's content.
   * @param filePath - The path of the source file.
   * @param content - The source file content.
   * @returns An array of extracted symbol nodes.
   */
  extractSymbols(filePath: string, content: string): SymbolNode[]

  /**
   * Extracts relations between symbols from a source file's content.
   * @param filePath - The path of the source file.
   * @param content - The source file content.
   * @param symbols - The symbols already extracted from this file.
   * @param importMap - A map of locally imported names to their resolved symbol ids.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
  ): Relation[]

  /**
   * Parses import declarations from source code.
   * Returns syntactic import information without any resolution — the indexer
   * is responsible for resolving specifiers to files and symbol ids.
   * @param filePath - The path of the source file.
   * @param content - The source file content.
   * @returns An array of parsed import declarations.
   */
  extractImportedNames(filePath: string, content: string): ImportDeclaration[]

  /**
   * Extracts the namespace declaration from source code, if applicable.
   * Used by languages like PHP where imports are resolved via fully qualified names.
   * Returns undefined for languages without namespace declarations.
   * @param content - The source file content.
   * @returns The namespace string (e.g. 'App\Models'), or undefined.
   */
  extractNamespace?(content: string): string | undefined
}
