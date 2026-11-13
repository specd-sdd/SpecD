import { UnknownContributionError } from '../errors/unknown-contribution-error.js'
import type { SpecdPluginManifest } from '../types/plugin-manifest.js'

/**
 * Lists declared contribution ids in manifest order: kinds, then ids.
 *
 * @param manifest - Parsed plugin manifest
 * @returns Declared ids
 */
export function declaredContributionIds(manifest: SpecdPluginManifest): readonly string[] {
  const ids: string[] = []
  for (const blocks of Object.values(manifest.contributes)) {
    for (const id of Object.keys(blocks)) ids.push(id)
  }
  return ids
}

/**
 * Resolves the contribution ids selected for one plugin.
 *
 * @param pluginName - Plugin being selected
 * @param manifest - Parsed plugin manifest
 * @param allowlist - Ids from config; every declared id when omitted
 * @returns Selected ids
 * @throws {UnknownContributionError} When an allowlist id is not declared
 */
export function resolveContributions(
  pluginName: string,
  manifest: SpecdPluginManifest,
  allowlist: readonly string[] | undefined,
): readonly string[] {
  const declared = declaredContributionIds(manifest)
  if (allowlist === undefined) return declared
  const known = new Set(declared)
  for (const id of allowlist) {
    if (!known.has(id)) throw new UnknownContributionError(pluginName, id)
  }
  return [...allowlist]
}

/**
 * Contribution ids passed to an install context.
 *
 * When the manifest declares `agents`, only selected ids of that kind are
 * included. Otherwise the full selection is returned.
 *
 * @param manifest - Parsed plugin manifest
 * @param selected - Ids chosen for this operation
 * @returns Ids to place on `PluginInstallContext.contributions`
 */
export function installContextContributions(
  manifest: SpecdPluginManifest,
  selected: readonly string[],
): readonly string[] {
  const agents = manifest.contributes['agents']
  if (agents === undefined) return selected
  return selected.filter((id) => Object.prototype.hasOwnProperty.call(agents, id))
}
