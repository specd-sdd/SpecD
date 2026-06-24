/**
 * Portable rebuild cache metadata for the vendored Electron sqlite addon.
 *
 * @typedef {object} PortableElectronBuildMetadata
 * @property {string} electronVersion
 * @property {string} platform
 * @property {string} arch
 */

/**
 * @param {unknown} metadata
 * @returns {metadata is PortableElectronBuildMetadata}
 */
export function isPortableElectronBuildMetadata(metadata) {
  if (metadata === null || typeof metadata !== 'object') {
    return false
  }

  const record = /** @type {Record<string, unknown>} */ (metadata)

  return (
    typeof record.electronVersion === 'string'
    && typeof record.platform === 'string'
    && typeof record.arch === 'string'
    && !('binaryPath' in record)
  )
}

/**
 * @param {PortableElectronBuildMetadata} metadata
 * @param {{ electronVersion: string, platform: string, arch: string }} current
 * @returns {boolean}
 */
export function electronBuildMatchesCurrent(metadata, current) {
  return (
    metadata.electronVersion === current.electronVersion
    && metadata.platform === current.platform
    && metadata.arch === current.arch
  )
}

/**
 * @param {{ electronVersion: string, platform: string, arch: string }} current
 * @returns {PortableElectronBuildMetadata}
 */
export function createPortableElectronBuildMetadata(current) {
  return {
    electronVersion: current.electronVersion,
    platform: current.platform,
    arch: current.arch,
  }
}

/**
 * @param {string} raw
 * @returns {PortableElectronBuildMetadata | undefined}
 */
export function parsePortableElectronBuildMetadata(raw) {
  try {
    const metadata = JSON.parse(raw)
    return isPortableElectronBuildMetadata(metadata) ? metadata : undefined
  } catch {
    return undefined
  }
}
