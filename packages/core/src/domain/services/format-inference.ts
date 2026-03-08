import { type ArtifactFormat } from '../value-objects/artifact-type.js'

/**
 * Infers the artifact format name from a filename extension.
 *
 * @param filename - The filename (or output path) to inspect
 * @returns The inferred format name, or `undefined` if the extension is unrecognised
 */
export function inferFormat(filename: string): ArtifactFormat | undefined {
  const ext = filename.split('.').pop() ?? ''
  if (ext === 'md') return 'markdown'
  if (ext === 'json') return 'json'
  if (ext === 'yaml' || ext === 'yml') return 'yaml'
  if (ext === 'txt') return 'plaintext'
  return undefined
}
