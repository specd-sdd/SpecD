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
   * Returns the file extension to language ID mapping for this adapter.
   * The registry uses this to resolve files to adapters without a hardcoded map.
   * @returns A record of file extensions (with dot, e.g. `.ts`) to language IDs.
   */
  extensions(): Record<string, string>

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

  /**
   * Returns the package identity for a workspace root by reading the
   * language's package manifest (e.g. `package.json`, `go.mod`).
   * Searches at and above `codeRoot`, bounded by `repoRoot`.
   * Unlike extraction methods, this performs I/O.
   * @param codeRoot - Absolute path to the workspace's code root directory.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The package name, or undefined if no manifest is found.
   */
  getPackageIdentity?(codeRoot: string, repoRoot?: string): string | undefined

  /**
   * Given a non-relative import specifier, returns which of the known
   * packages it refers to. Language-specific matching rules apply.
   * @param specifier - The raw import specifier (e.g. `@specd/core`, `github.com/acme/auth/models`).
   * @param knownPackages - The list of known package identities.
   * @returns The matching package name, or undefined.
   */
  resolvePackageFromSpecifier?(specifier: string, knownPackages: string[]): string | undefined

  /**
   * Resolves a relative import specifier to one or more candidate file paths.
   * Applies language-specific extension mapping and path traversal rules.
   * Returns multiple candidates when the specifier is ambiguous (e.g. could
   * be a file or a directory with an index file). The indexer tries each
   * candidate in order against the symbol index.
   * @param fromFile - The importing file path (workspace-prefixed).
   * @param specifier - The relative import specifier.
   * @returns The resolved file path(s), most likely candidate first.
   */
  resolveRelativeImportPath?(fromFile: string, specifier: string): string | string[]

  /**
   * Builds a fully qualified name from a namespace and symbol name.
   * Used by languages where imports resolve via qualified names (e.g. PHP).
   * @param namespace - The namespace string.
   * @param symbolName - The symbol name.
   * @returns The qualified name string.
   */
  buildQualifiedName?(namespace: string, symbolName: string): string
}
