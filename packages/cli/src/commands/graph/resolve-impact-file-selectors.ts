import { type CodeGraphProvider } from '@specd/sdk'
import { CliValidationError } from '../../errors/index.js'

/** A file resolved from a selector with its canonical path and workspace. */
export interface ResolvedFile {
  readonly path: string
  readonly workspace: string
}

/**
 * Resolves multiple file selectors to canonical file paths.
 * @param provider - The code graph provider.
 * @param selectors - The raw selector strings to resolve.
 * @returns The resolved files.
 */
export async function resolveImpactFileSelectors(
  provider: CodeGraphProvider,
  selectors: readonly string[],
): Promise<ResolvedFile[]> {
  const results: ResolvedFile[] = []

  for (const raw of selectors) {
    const resolved = await resolveOne(provider, raw)
    results.push(resolved)
  }

  return results
}

/**
 * Resolves a single file selector to a canonical file path.
 * @param provider - The code graph provider.
 * @param raw - The raw selector string.
 * @returns The resolved file with path and workspace.
 */
async function resolveOne(provider: CodeGraphProvider, raw: string): Promise<ResolvedFile> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new CliValidationError(`empty file selector`)
  }

  const matches = (await provider.resolveFileSelector(trimmed)).filter(
    (candidate) => candidate.kind === 'file',
  )
  if (matches.length === 0) {
    throw new CliValidationError(`no indexed file matches "${trimmed}"`)
  }
  if (matches.length === 1) {
    return { path: matches[0]!.canonicalPath, workspace: matches[0]!.workspace }
  }
  throw new CliValidationError(
    `ambiguous selector "${trimmed}": matches ${String(matches.length)} files across workspaces`,
  )
}

/**
 * Resolves a canonical graph resource path to its config-relative display path.
 * @param provider - Open Code Graph provider.
 * @param canonicalPath - Canonical file or document path.
 * @returns Config-relative path when indexed, otherwise the canonical input.
 */
export async function toGraphDisplayPath(
  provider: CodeGraphProvider,
  canonicalPath: string,
): Promise<string> {
  const file = await provider.getFile(canonicalPath)
  if (file !== undefined) return file.configRelativePath
  const document = await provider.getDocument(canonicalPath)
  return document?.configRelativePath ?? canonicalPath
}
