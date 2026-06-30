import { type Relation } from './relation.js'
import { type IndexSession } from './index-session.js'
import { type FileAnalysisDraft, type FileAnalysis } from './file-analysis.js'

/**
 * Exposes the shared run context available while analyzing a single file.
 */
export interface AdapterAnalyzeContext {
  readonly session: IndexSession
  readonly workspaceName: string
  readonly codeRoot?: string
  readonly repoRoot?: string
}

/**
 * Provides the shared lookup inputs required to resolve extracted imports into symbol IDs or file imports.
 */
export interface ImportResolutionContext {
  readonly session: IndexSession
  readonly qualifiedNames: ReadonlyMap<string, string>
  readonly packageToWorkspace: ReadonlyMap<string, string>
  readonly codeRoot?: string
  readonly repoRoot?: string
}

/**
 * Normalizes import resolution output across all languages.
 */
export interface ResolvedImports {
  readonly importMap: ReadonlyMap<string, string>
  readonly fileImports: readonly string[]
}

/**
 * Provides the resolved import data and shared session lookups required to build relations.
 */
export interface RelationBuildContext {
  readonly session: IndexSession
  readonly resolvedImports: ResolvedImports
  readonly codeRoot?: string
  readonly repoRoot?: string
}

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
   * Analyzes a single file and extracts its symbols, imports, binding/call facts,
   * namespace, and any optional parser-specific state.
   */
  analyzeFile(filePath: string, content: string, context: AdapterAnalyzeContext): FileAnalysisDraft

  /**
   * Resolves raw imports extracted in Pass 1 into symbol mappings and file dependencies.
   */
  resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports

  /**
   * Builds relations between symbols or files from the analyzed facts and resolved imports.
   */
  buildRelations(analysis: FileAnalysis, context: RelationBuildContext): Relation[]

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

  /**
   * Resolves a fully qualified class/type name to an absolute file path
   * by reading the language's autoloader configuration (e.g. composer.json PSR-4).
   * Complements the in-memory qualified name map: handles classes not present
   * in the indexed codebase. Performs I/O. SHOULD cache the parsed map per codeRoot.
   * @param qualifiedName - Fully qualified name (e.g. `App\Models\User`)
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repo root to bound the manifest search.
   * @returns Absolute file path, or undefined if unresolvable.
   */
  resolveQualifiedNameToPath?(
    qualifiedName: string,
    codeRoot: string,
    repoRoot?: string,
  ): string | undefined
}
