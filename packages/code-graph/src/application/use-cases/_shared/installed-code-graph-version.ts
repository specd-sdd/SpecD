import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolves the installed `@specd/code-graph` semver from the nearest package.json.
 * Works from source paths and from the bundled `dist/` entry.
 *
 * @returns Installed `@specd/code-graph` semver string.
 * @throws {Error} When no matching package.json is found within the search depth.
 */
export function readInstalledCodeGraphVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, 'package.json')
    try {
      const json = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version: string }
      if (json.name === '@specd/code-graph') {
        return json.version
      }
    } catch {
      // try parent directory
    }
    dir = dirname(dir)
  }
  throw new Error('Unable to resolve @specd/code-graph package version')
}
