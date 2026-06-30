import { type CodeGraphProvider } from '@specd/sdk'
import { CliValidationError } from '../../errors/index.js'
import { relative, isAbsolute } from 'node:path'

/** A file resolved from a selector with its canonical path and workspace. */
export interface ResolvedFile {
  readonly path: string
  readonly workspace: string
}

/**
 * Resolves multiple file selectors to canonical file paths.
 * @param provider - The code graph provider.
 * @param selectors - The raw selector strings to resolve.
 * @param projectRoot - The project root directory.
 * @returns The resolved files.
 */
export async function resolveImpactFileSelectors(
  provider: CodeGraphProvider,
  selectors: readonly string[],
  projectRoot: string,
): Promise<ResolvedFile[]> {
  const results: ResolvedFile[] = []

  for (const raw of selectors) {
    const resolved = await resolveOne(provider, raw, projectRoot)
    results.push(resolved)
  }

  return results
}

/**
 * Resolves a single file selector to a canonical file path.
 * @param provider - The code graph provider.
 * @param raw - The raw selector string.
 * @param projectRoot - The project root directory.
 * @returns The resolved file with path and workspace.
 */
async function resolveOne(
  provider: CodeGraphProvider,
  raw: string,
  projectRoot: string,
): Promise<ResolvedFile> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new CliValidationError(`empty file selector`)
  }

  const colonIdx = trimmed.indexOf(':')
  if (colonIdx > 0) {
    const direct = await provider.getFile(trimmed)
    if (direct) {
      return { path: direct.path, workspace: direct.workspace }
    }
  }

  if (isAbsolute(trimmed)) {
    const rel = normalizeRelativePath(relative(projectRoot, trimmed))
    const byCrp = await provider.findFilesByConfigRelativePath(rel)
    if (byCrp.length === 0) {
      throw new CliValidationError(
        `no indexed file matches absolute path "${trimmed}" (resolved to "${rel}")`,
      )
    }
    if (byCrp.length === 1) {
      return { path: byCrp[0]!.path, workspace: byCrp[0]!.workspace }
    }
    throw new CliValidationError(
      `ambiguous absolute path "${trimmed}": matches ${String(byCrp.length)} files across workspaces`,
    )
  }

  const directHit = await provider.getFile(trimmed)
  if (directHit) {
    return { path: directHit.path, workspace: directHit.workspace }
  }

  const byCrp = await provider.findFilesByConfigRelativePath(normalizeRelativePath(trimmed))
  if (byCrp.length === 0) {
    throw new CliValidationError(`no indexed file matches "${trimmed}"`)
  }
  if (byCrp.length === 1) {
    return { path: byCrp[0]!.path, workspace: byCrp[0]!.workspace }
  }
  throw new CliValidationError(
    `ambiguous selector "${trimmed}": matches ${String(byCrp.length)} files across workspaces`,
  )
}

/**
 * Normalizes a relative path for config-relative lookup.
 * @param p - The path to normalize.
 * @returns The normalized path string.
 */
function normalizeRelativePath(p: string): string {
  let n = p.replaceAll('\\', '/')
  if (n.startsWith('./')) n = n.slice(2)
  return n
}
