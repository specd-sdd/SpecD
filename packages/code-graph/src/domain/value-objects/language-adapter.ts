import { type Relation } from './relation.js'
import { type IndexSession } from './index-session.js'
import { type FileAnalysisDraft, type FileAnalysis } from './file-analysis.js'
import { type SymbolKind } from './symbol-kind.js'
import { type AdapterCapabilities, type ResolutionStep } from './symbol-reference.js'
import {
  type ImportDiagnostic,
  type PackageEntryResolution,
  type PackageExportRequest,
  type PackageExportResolution,
  type PackageResolutionFacet,
  type PackageWorkspace,
  type QualifiedNameResolutionFacet,
  type ReExportLinkingFacet,
  type RelativeImportResolutionFacet,
  type SymbolReferenceSyntaxFacet,
} from './language-adapter-facets.js'

/**
 * Pure declaration classification, caller containment, and parser-authority policy for a language adapter.
 */
export interface AdapterDeclarationPolicy {
  /** Language identifiers governed by this policy. */
  readonly languageIds: readonly string[]
  /** Symbol kinds eligible to be caller containers. */
  readonly callableContainerKinds: ReadonlySet<SymbolKind>
  /** Whether the language supports merging distinct declarations into one logical group (e.g. overloads). */
  readonly supportsLogicalDeclarationGroups: boolean
  /** Whether the adapter can emit physical declarations lacking a logical symbol target. */
  readonly supportsPhysicalOnlyDeclarations: boolean
  /** Whether all source structural facts are derived from typed parser nodes rather than whole-source text scans. */
  readonly structuralFactsAreParserAuthoritative: true
}

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
  /** Every workspace of the run, with its code root. */
  readonly workspaces: readonly PackageWorkspace[]
  readonly codeRoot?: string
  readonly repoRoot?: string
  /**
   * Matches a non-relative specifier to a known package through the importing adapter's
   * `packageResolution` facet and returns the indexed, non-test entries it publishes.
   */
  readonly packageEntryFiles: (specifier: string) => PackageEntryResolution
  /**
   * Resolves an exported name through the public bindings of the package entries. Never
   * searches symbols by name.
   */
  readonly resolvePackageExport: (request: PackageExportRequest) => PackageExportResolution
}

/**
 * Normalizes import resolution output across all languages.
 */
export interface ResolvedImports {
  readonly importMap: ReadonlyMap<string, string>
  readonly fileImports: readonly string[]
  /** Resolution steps that explain each cross-file import (`import:package`). */
  readonly steps: readonly ResolutionStep[]
  /** Non-persisted records of package imports that stayed unresolved. */
  readonly diagnostics: readonly ImportDiagnostic[]
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
 *
 * An adapter is a required core (`languages`, `extensions`, `resolutionManifests`,
 * `analyzeFile`, `resolveImports`, `buildRelations`) plus optional facets. A facet is a
 * cohesive group of resolution services; exposing it is the adapter's declaration that it
 * supports every member of the group. Consumers decide from the presence of the facet and
 * never probe individual methods, language identifiers, extensions, or manifest names.
 */
export interface LanguageAdapter {
  /** Declares the semantic reference features this adapter can prove without guessing. */
  capabilities?(): AdapterCapabilities

  /**
   * Declares the declaration, caller containment, and parser-authority policies for this adapter.
   * Pure: returns metadata without performing I/O or retaining parser nodes.
   */
  declarationPolicy?(): AdapterDeclarationPolicy

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
   * Returns the exact basenames of the manifests this adapter reads for package
   * identity or import resolution. Does not perform I/O. Adapters that read no
   * resolution manifest return an empty array. Values are exact filenames, not
   * globs or directory paths.
   * @returns Exact resolution-manifest basenames.
   */
  resolutionManifests(): readonly string[]

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

  /** Package identity, specifier matching, and published entry surface. */
  readonly packageResolution?: PackageResolutionFacet

  /** Relative module specifier to candidate files. */
  readonly relativeImportResolution?: RelativeImportResolutionFacet

  /** Qualified-name construction and qualified-name to file mapping. */
  readonly qualifiedNameResolution?: QualifiedNameResolutionFacet

  /** Parse and render of human symbol references. */
  readonly symbolReferenceSyntax?: SymbolReferenceSyntaxFacet

  /** Linking of re-export routes into public bindings. */
  readonly reExportLinking?: ReExportLinkingFacet
}
