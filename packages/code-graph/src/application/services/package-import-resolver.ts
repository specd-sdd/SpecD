import { type IndexSession } from '../../domain/value-objects/index-session.js'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import {
  type PackageEntry,
  type PackageEntryResolution,
  type PackageExportRequest,
  type PackageExportResolution,
} from '../../domain/value-objects/language-adapter-facets.js'

/**
 * Dependencies of {@link PackageImportResolver}.
 */
export interface PackageImportResolverDeps {
  /** Run-scoped session holding files, declarations, and public bindings. */
  readonly session: IndexSession
  /** Package identity to workspace name, built from the `packageResolution` facets. */
  readonly packageToWorkspace: ReadonlyMap<string, string>
  /**
   * Adapters whose `packageResolution` facet failed during the run. They are treated as if they
   * did not provide the facet. The set may grow while the run is in progress.
   */
  readonly disabledPackageResolution?: ReadonlySet<LanguageAdapter>
}

/**
 * The two helpers handed to an adapter through `ImportResolutionContext`.
 */
export interface PackageImportHelpers {
  /** Matches a specifier to a package and returns its indexed, non-test entries. */
  readonly packageEntryFiles: (specifier: string) => PackageEntryResolution
  /** Resolves an exported name through the public bindings of the package entries. */
  readonly resolvePackageExport: (request: PackageExportRequest) => PackageExportResolution
}

/**
 * Resolves package-specifier imports generically.
 *
 * The importing adapter's `packageResolution` facet supplies every language-specific fact
 * (which package a specifier names and which files that package publishes). This service
 * then reads the public bindings of those entries and resolves the imported name. It
 * contains no language rules, performs no I/O, and never searches symbols by name.
 */
export class PackageImportResolver {
  /**
   * Creates a resolver bound to one indexing run.
   * @param deps - Session and package map of the run.
   */
  constructor(private readonly deps: PackageImportResolverDeps) {}

  /**
   * Builds the helpers bound to one importing adapter.
   * @param adapter - Adapter whose `packageResolution` facet is consulted.
   * @returns The two context helpers.
   */
  forAdapter(adapter: LanguageAdapter): PackageImportHelpers {
    const packageEntryFiles = (specifier: string): PackageEntryResolution =>
      this.entryFiles(adapter, specifier)
    return {
      packageEntryFiles,
      resolvePackageExport: (request) => this.resolveExport(packageEntryFiles, request),
    }
  }

  /**
   * Matches the specifier to a known package and keeps the entries that can be used.
   * @param adapter - Importing adapter.
   * @param specifier - Import specifier as written.
   * @returns The usable entries, or the reason there are none.
   */
  private entryFiles(adapter: LanguageAdapter, specifier: string): PackageEntryResolution {
    const facet =
      this.deps.disabledPackageResolution?.has(adapter) === true
        ? undefined
        : adapter.packageResolution
    if (facet === undefined) return { status: 'unresolved', reason: 'facet-absent' }
    const { session, packageToWorkspace } = this.deps
    const packageName = facet.matchSpecifier(specifier, [...packageToWorkspace.keys()], session)
    if (packageName === undefined) return { status: 'unresolved', reason: 'package-unknown' }
    const workspace = packageToWorkspace.get(packageName)
    if (workspace === undefined) return { status: 'unresolved', reason: 'package-unknown' }
    const entries = facet
      .entrySurface({ specifier, packageName, workspace, session })
      .filter(
        (entry: PackageEntry) =>
          session.getFileId(entry.filePath) !== undefined &&
          session.getFileCategory(entry.filePath) !== 'test',
      )
    if (entries.length === 0) return { status: 'unresolved', reason: 'no-entry-surface' }
    return { status: 'resolved', packageName, workspace, entries }
  }

  /**
   * Resolves an exported name through the public bindings of the package entries.
   * @param packageEntryFiles - Entry lookup bound to the importing adapter.
   * @param request - Specifier, exported name, symbol spaces, and step source.
   * @returns The resolved target with its provenance step, or the reason it is unresolved.
   */
  private resolveExport(
    packageEntryFiles: (specifier: string) => PackageEntryResolution,
    request: PackageExportRequest,
  ): PackageExportResolution {
    const resolution = packageEntryFiles(request.specifier)
    if (resolution.status === 'unresolved') return resolution
    const { session } = this.deps
    const hits: {
      readonly entry: PackageEntry
      readonly bindingId: string
      readonly target: string
    }[] = []
    for (const entry of resolution.entries) {
      for (const space of request.spaces) {
        for (const binding of session.findPublicBindings(
          entry.surface,
          request.exportedName,
          space,
        )) {
          if (binding.targetId === undefined) continue
          hits.push({ entry, bindingId: binding.id, target: binding.targetId })
        }
      }
    }
    if (hits.length === 0) return { status: 'unresolved', reason: 'not-exported' }
    const targets = new Set(hits.map((hit) => hit.target))
    if (targets.size > 1) return { status: 'unresolved', reason: 'ambiguous' }
    const [first] = [...hits].sort((left, right) => left.bindingId.localeCompare(right.bindingId))
    if (first === undefined) return { status: 'unresolved', reason: 'not-exported' }
    const targetSymbolId = session.getPrimaryDeclarationSymbolId(first.target)
    if (targetSymbolId === undefined) return { status: 'unresolved', reason: 'not-exported' }
    return {
      status: 'resolved',
      targetLogicalId: first.target,
      targetSymbolId,
      entryFile: first.entry.filePath,
      publicBindingId: first.bindingId,
      step: { fromId: request.localBindingId, toId: first.bindingId, kind: 'import:package' },
    }
  }
}
