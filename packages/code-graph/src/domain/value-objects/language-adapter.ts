import { type SymbolNode } from './symbol-node.js'
import { type Relation } from './relation.js'

/**
 * Adapter for extracting symbols and relations from source files of a specific language.
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
   * @param importMap - A map of import specifiers to resolved file paths.
   * @returns An array of extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
  ): Relation[]
}
