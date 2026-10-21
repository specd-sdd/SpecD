import { type IndexSession } from './index-session.js'
import {
  type LogicalSymbol,
  type ParsedSymbolReference,
  type PublicBinding,
  type ResolutionStep,
  type SymbolSpace,
} from './symbol-reference.js'

/**
 * One workspace taking part in package resolution.
 */
export interface PackageWorkspace {
  /** Workspace name as configured. */
  readonly name: string
  /** Absolute path of the workspace code root. */
  readonly codeRoot: string
}

/**
 * Input of {@link PackageResolutionFacet.prepare}.
 */
export interface PackagePreparationContext {
  /** Run-scoped session where the facet stores compact manifest facts. */
  readonly session: IndexSession
  /** Every workspace of the run, including workspaces that were only hydrated. */
  readonly workspaces: readonly PackageWorkspace[]
  /** Repository root that bounds manifest searches, when known. */
  readonly repoRoot?: string
}

/**
 * Input of {@link PackageResolutionFacet.entrySurface}.
 */
export interface PackageEntryRequest {
  /** Full specifier as written, including any subpath (for example `@specd/code-graph/internal`). */
  readonly specifier: string
  /** Package identity returned by `matchSpecifier`. */
  readonly packageName: string
  /** Name of the workspace that owns the package. */
  readonly workspace: string
  /** Run-scoped session holding the data stored by `prepare`. */
  readonly session: IndexSession
}

/**
 * One place from which a package publishes names.
 */
export interface PackageEntry {
  /** Workspace-prefixed project path of an indexed source file, for example `code-graph:src/public.ts`. */
  readonly filePath: string
  /** Public surface id under which the exports of this entry are stored. */
  readonly surface: string
}

/**
 * Package identity, specifier matching, and published entry surface of a language.
 *
 * An adapter exposes this facet only when it supports every member. Presence of the
 * facet is the declaration that the adapter supports package resolution.
 */
export interface PackageResolutionFacet {
  /**
   * Derives the package identity for a workspace. May perform I/O.
   * @param codeRoot - Absolute path of the workspace code root.
   * @param repoRoot - Optional repository root that bounds the manifest search.
   * @returns The package identity, or `undefined` when no manifest is found.
   */
  identity(codeRoot: string, repoRoot?: string): string | undefined

  /**
   * Reads manifest facts for all workspaces once per run and stores compact immutable
   * data in the session. May perform I/O. Called once, before any import is resolved.
   * @param context - Session, workspaces, and repository root.
   */
  prepare(context: PackagePreparationContext): void

  /**
   * Returns which known package a non-relative specifier refers to. Depends only on its
   * arguments and on the data `prepare` stored in the session; performs no I/O.
   * @param specifier - Raw import specifier.
   * @param knownPackages - Known package identities.
   * @param session - Session holding the data stored by `prepare`.
   * @returns The matching package identity, or `undefined`.
   */
  matchSpecifier(
    specifier: string,
    knownPackages: readonly string[],
    session: IndexSession,
  ): string | undefined

  /**
   * Returns the ordered entries through which the package publishes the specifier.
   * Reads only data stored by `prepare`; performs no I/O.
   * @param request - Specifier, matched package, owning workspace, and session.
   * @returns Candidate entries, most likely first. Empty when nothing is published.
   */
  entrySurface(request: PackageEntryRequest): readonly PackageEntry[]
}

/**
 * Maps a relative module specifier to candidate files using a language's conventions.
 */
export interface RelativeImportResolutionFacet {
  /**
   * Resolves a relative import specifier to one or more candidate file paths. Pure.
   * Returns several candidates when the specifier is ambiguous (for example a file or a
   * directory with an index file). The caller keeps only candidates that are indexed.
   * @param fromFile - Importing file path (workspace-prefixed).
   * @param specifier - Relative import specifier.
   * @returns Resolved file path(s), most likely candidate first.
   */
  resolve(fromFile: string, specifier: string): string | readonly string[]
}

/**
 * Qualified-name addressing for languages whose imports are namespace-qualified.
 */
export interface QualifiedNameResolutionFacet {
  /**
   * Builds a fully qualified name from a namespace and a symbol name. Pure.
   * @param namespace - Namespace string.
   * @param symbolName - Symbol name.
   * @returns The qualified name.
   */
  build(namespace: string, symbolName: string): string

  /**
   * Maps a fully qualified name to an indexed file id using metadata prepared in the
   * run-scoped session. Does not probe the filesystem and never returns a file that is not indexed.
   * @param qualifiedName - Fully qualified name (for example `App\Models\User`).
   * @param codeRoot - Absolute path of the workspace code root.
   * @param session - Run-scoped session holding the data `packageResolution.prepare` stored.
   * @returns Indexed file id, or `undefined` when unresolvable or not indexed.
   */
  resolveToPath(qualifiedName: string, codeRoot: string, session: IndexSession): string | undefined
}

/**
 * Human symbol-reference syntax of a language.
 */
export interface SymbolReferenceSyntaxFacet {
  /**
   * Parses human reference text the adapter can prove. Pure: no I/O and no canonical-id
   * decoding.
   * @param text - Human reference text.
   * @returns Zero or more structured candidates.
   */
  parse(text: string): ParsedSymbolReference

  /**
   * Renders a logical symbol as generic and, when different, native text. Pure: walks the
   * supplied owner names and does not query a store.
   * @param symbol - Logical symbol to render.
   * @param ownerPath - Owner simple names from the root to the immediate owner.
   * @returns Generic dotted spelling and an optional native spelling.
   */
  render(
    symbol: LogicalSymbol,
    ownerPath: readonly string[],
  ): { readonly generic: string; readonly native?: string }
}

/**
 * Input of {@link ReExportLinkingFacet.link}.
 */
export interface ReExportLinkContext {
  /** Session containing declarations, bindings, and prepared manifest facts. */
  readonly session: IndexSession
  /** Package name to workspace name. */
  readonly packageToWorkspace: ReadonlyMap<string, string>
}

/**
 * Bindings and provenance contributed by re-export linking.
 */
export interface ReExportLinkResult {
  /** Public bindings to merge into the session. */
  readonly publicBindings: readonly PublicBinding[]
  /** Resolution steps explaining the bindings. */
  readonly steps: readonly ResolutionStep[]
}

/**
 * Links re-export routes into public bindings.
 */
export interface ReExportLinkingFacet {
  /**
   * Emits public bindings for re-exports the adapter can prove. Performs no I/O and does
   * not guess a symbol by name order. Runs after Pass 1 and before imports are resolved.
   * @param context - Session and package map.
   * @returns Bindings and provenance to merge into the session.
   */
  link(context: ReExportLinkContext): ReExportLinkResult
}

/**
 * Why a package import stayed unresolved.
 */
export type ImportUnresolvedReason =
  | 'facet-absent'
  | 'package-unknown'
  | 'no-entry-surface'
  | 'not-exported'
  | 'ambiguous'

/**
 * Non-persisted record of an unresolved import.
 */
export interface ImportDiagnostic {
  /** Workspace-prefixed path of the importing file. */
  readonly filePath: string
  /** Import specifier as written. */
  readonly specifier: string
  /** Imported name, when the import names one. */
  readonly exportedName?: string
  /** Why the import stayed unresolved. */
  readonly reason: ImportUnresolvedReason
}

/**
 * Result of {@link ImportResolutionContext.packageEntryFiles}.
 */
export type PackageEntryResolution =
  | {
      readonly status: 'resolved'
      readonly packageName: string
      readonly workspace: string
      readonly entries: readonly PackageEntry[]
    }
  | { readonly status: 'unresolved'; readonly reason: ImportUnresolvedReason }

/**
 * Input of {@link ImportResolutionContext.resolvePackageExport}.
 */
export interface PackageExportRequest {
  /** Import specifier as written. */
  readonly specifier: string
  /** Name exported by the package. */
  readonly exportedName: string
  /**
   * Symbol spaces to consider, for example `['value', 'type']` for a plain named import and
   * `['type']` for a type-only import.
   */
  readonly spaces: readonly SymbolSpace[]
  /** Workspace-prefixed path of the importing file. */
  readonly fromFile: string
  /** Id of the local binding that the import creates, used as the step source. */
  readonly localBindingId: string
}

/**
 * Result of {@link ImportResolutionContext.resolvePackageExport}.
 */
export type PackageExportResolution =
  | {
      readonly status: 'resolved'
      /** Logical id of the target. */
      readonly targetLogicalId: string
      /** Symbol id of the primary declaration, to place in the import map. */
      readonly targetSymbolId: string
      /** Entry file that published the name. */
      readonly entryFile: string
      /** Id of the public binding that was followed. */
      readonly publicBindingId: string
      /** Step to return in `ResolvedImports.steps`: local binding to public binding. */
      readonly step: ResolutionStep
    }
  | { readonly status: 'unresolved'; readonly reason: ImportUnresolvedReason }
