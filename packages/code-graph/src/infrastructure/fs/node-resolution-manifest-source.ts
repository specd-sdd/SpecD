import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { type ResolutionManifestSource } from '../../application/ports/resolution-manifest-source.js'

/**
 * Filesystem adapter for resolution-manifest discovery.
 */
export class NodeResolutionManifestSource implements ResolutionManifestSource {
  /**
   * Reports whether a directory exists.
   * @param path - Absolute directory path.
   * @returns True when the path is an existing directory.
   */
  directoryExists(path: string): boolean {
    try {
      return existsSync(path) && lstatSync(path).isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Reports whether a path is a regular file.
   * @param path - Absolute file path.
   * @returns True when the path is a regular file.
   */
  isRegularFile(path: string): boolean {
    try {
      return lstatSync(path).isFile()
    } catch {
      return false
    }
  }

  /**
   * Reads a manifest as UTF-8 text.
   * @param path - Absolute file path.
   * @returns File text, or undefined when the file cannot be read.
   */
  readText(path: string): string | undefined {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return undefined
    }
  }
}
