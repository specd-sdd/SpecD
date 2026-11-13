import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { join, dirname, resolve, parse, relative, isAbsolute } from 'node:path'

/**
 * Outcome of inspecting a candidate manifest file.
 */
export type ManifestInspection<T> =
  | { readonly kind: 'match'; readonly value: T }
  | { readonly kind: 'fallback'; readonly value: T }
  | { readonly kind: 'skip' }

/**
 * Matched package manifest information from a directory walk.
 */
export interface PackageManifestMatch<T = unknown> {
  /** Directory that holds the matched manifest (the package root). */
  readonly packageRoot: string
  /** Absolute path of the matched manifest. */
  readonly manifestPath: string
  /** UTF-8 content of the matched manifest. */
  readonly content: string
  /** The inspector result produced by the only parse of this manifest. */
  readonly value: T
  /** Manifests found on the walk that were skipped (kept for backward compatibility). */
  readonly skipped?: readonly string[]
}

/**
 * Result of searching for a package manifest across directories.
 */
export interface PackageManifestSearchResult<T = unknown> {
  /** Selected preferred match, or the nearest fallback when no preferred match exists. */
  readonly match?: PackageManifestMatch<T> | undefined
  /** Manifests skipped because they were unreadable, malformed, lacked identity, or lost to a preferred match. */
  readonly skipped: readonly string[]
}

/**
 * Strips trailing directory separators from a path.
 * @param p - Path to strip.
 * @returns Stripped path.
 */
function stripTrailingSeparator(p: string): string {
  const parsed = parse(p)
  if (p === parsed.root) return p
  return p.replace(/[/\\]+$/, '')
}

/**
 * Resolves a path to its canonical realpath representation.
 * @param p - Path to canonicalize.
 * @returns Canonical path string.
 */
export function canonical(p: string): string {
  const resolved = resolve(p)
  try {
    return stripTrailingSeparator(realpathSync(resolved))
  } catch {
    return stripTrailingSeparator(resolved)
  }
}

/**
 * Searches at and above `codeRoot`, bounded by `repoRoot`, for a package manifest
 * inspected by `inspect`.
 *
 * @param codeRoot - Absolute directory of the workspace code root.
 * @param filename - Name of the manifest file (e.g. `package.json`, `go.mod`).
 * @param inspect - Function that inspects manifest content and returns a `ManifestInspection`.
 * @param repoRoot - Optional repository root bounding the upward search.
 * @returns The search result containing any matched manifest details and all skipped paths.
 */
export function findPackageManifest<T>(
  codeRoot: string,
  filename: string,
  inspect: (content: string, manifestPath: string) => ManifestInspection<T>,
  repoRoot?: string,
): PackageManifestSearchResult<T> {
  const start = canonical(codeRoot)
  let boundary = repoRoot === undefined ? start : canonical(repoRoot)

  if (start !== boundary) {
    const rel = relative(boundary, start)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      boundary = start
    }
  }

  const skipped: string[] = []
  let fallback: PackageManifestMatch<T> | undefined
  let dir = start

  while (true) {
    const candidate = join(dir, filename)
    if (existsSync(candidate)) {
      let content: string | undefined
      try {
        content = readFileSync(candidate, 'utf-8')
      } catch {
        skipped.push(candidate)
      }

      if (content !== undefined) {
        let inspection: ManifestInspection<T> | undefined
        try {
          inspection = inspect(content, candidate)
        } catch {
          skipped.push(candidate)
        }

        if (inspection !== undefined) {
          if (inspection.kind === 'match') {
            if (fallback !== undefined) {
              skipped.push(fallback.manifestPath)
            }
            return {
              match: {
                packageRoot: dir,
                manifestPath: candidate,
                content,
                value: inspection.value,
                skipped,
              },
              skipped,
            }
          } else if (inspection.kind === 'fallback') {
            if (fallback === undefined) {
              fallback = {
                packageRoot: dir,
                manifestPath: candidate,
                content,
                value: inspection.value,
                skipped,
              }
            } else {
              skipped.push(candidate)
            }
          } else {
            skipped.push(candidate)
          }
        }
      }
    }

    if (dir === boundary) {
      return { match: fallback, skipped }
    }

    const parent = dirname(dir)
    if (parent === dir) {
      return { match: fallback, skipped }
    }
    dir = parent
  }
}

/**
 * Walks up from `startDir` looking for a manifest file and extracts a field from it.
 * Bounded by `boundary` — never walks above it. If no boundary is provided,
 * inspects only `startDir`.
 *
 * @param startDir - Absolute path to start searching from.
 * @param filename - The manifest filename to look for (e.g. `package.json`, `go.mod`).
 * @param extract - Function that parses the manifest content and returns the identity, or undefined.
 * @param boundary - Optional absolute path to stop walking at (e.g. repository root).
 * @returns The extracted identity, or undefined if no manifest is found.
 */
export function findManifestField(
  startDir: string,
  filename: string,
  extract: (content: string) => string | undefined,
  boundary?: string,
): string | undefined {
  const result = findPackageManifest(
    startDir,
    filename,
    (content) => {
      const res = extract(content)
      return res !== undefined && res !== '' ? { kind: 'match', value: res } : { kind: 'skip' }
    },
    boundary,
  )
  return result.match?.value
}
