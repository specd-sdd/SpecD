import { PackageImportResolver } from '../../src/application/services/package-import-resolver.js'
import {
  type ImportResolutionContext,
  type LanguageAdapter,
} from '../../src/domain/value-objects/language-adapter.js'

/**
 * Builds a complete {@link ImportResolutionContext} for tests that only care about a few members.
 *
 * Members that are not supplied default to an empty workspace list and to package helpers that
 * report `facet-absent`, which is what an adapter without package resolution would see. When an
 * adapter is given, the package helpers are the real {@link PackageImportResolver} bound to it,
 * so a test exercises the same lookup the indexer uses.
 * @param base - Members the test supplies; any member may be overridden.
 * @param adapter - Adapter whose `packageResolution` facet backs the package helpers.
 * @returns A context with every required member present.
 */
export function createImportResolutionContext(
  base: Pick<ImportResolutionContext, 'session'> & Partial<ImportResolutionContext>,
  adapter?: LanguageAdapter,
): ImportResolutionContext {
  const helpers =
    adapter === undefined
      ? {
          packageEntryFiles: (): ReturnType<ImportResolutionContext['packageEntryFiles']> => ({
            status: 'unresolved',
            reason: 'facet-absent',
          }),
          resolvePackageExport: (): ReturnType<
            ImportResolutionContext['resolvePackageExport']
          > => ({
            status: 'unresolved',
            reason: 'facet-absent',
          }),
        }
      : new PackageImportResolver({
          session: base.session,
          packageToWorkspace: base.packageToWorkspace ?? new Map(),
        }).forAdapter(adapter)
  return {
    qualifiedNames: new Map(),
    packageToWorkspace: new Map(),
    workspaces: [],
    ...helpers,
    ...base,
  }
}
