import { createHash } from 'node:crypto'
import type { ContextEntry } from '../compile-context.js'

/**
 * Input for fingerprint calculation.
 */
export interface FingerprintInput {
  readonly specIds: readonly string[]
  readonly contextEntries: readonly ContextEntry[]
  readonly contextIncludeSpecs: readonly string[]
  readonly contextExcludeSpecs: readonly string[]
  readonly workspaces: Readonly<
    Record<
      string,
      { contextIncludeSpecs?: readonly string[]; contextExcludeSpecs?: readonly string[] }
    >
  >
  readonly step: string
  readonly schemaVersion: number
  readonly followDeps: boolean
  readonly depth?: number | undefined
  readonly sections?: ReadonlyArray<'rules' | 'constraints' | 'scenarios'> | undefined
  readonly fileHashes: ReadonlyMap<string, string> | Map<string, string>
}

/**
 * Calculates a SHA-256 fingerprint from the context inputs.
 * The fingerprint is deterministic and changes when any relevant input changes.
 *
 * @param input - The fingerprint input containing all context-relevant values
 * @returns SHA-256 hash prefixed with 'sha256:'
 */
export function compileContextFingerprint(input: FingerprintInput): string {
  const parts: string[] = []

  parts.push(`specIds:${[...input.specIds].sort().join(',')}`)

  const contextParts: string[] = []
  for (const entry of input.contextEntries) {
    if ('instruction' in entry) {
      contextParts.push(`instruction:${entry.instruction}`)
    } else {
      const hash = input.fileHashes.get(entry.file) ?? ''
      contextParts.push(`file:${entry.file}:${hash}`)
    }
  }
  parts.push(`context:${contextParts.join('|')}`)

  parts.push(`include:${[...input.contextIncludeSpecs].sort().join(',')}`)
  parts.push(`exclude:${[...input.contextExcludeSpecs].sort().join(',')}`)

  const wsKeys = [...Object.keys(input.workspaces)].sort()
  const wsParts: string[] = []
  for (const ws of wsKeys) {
    const wsConfig = input.workspaces[ws]!
    const include = [...(wsConfig.contextIncludeSpecs ?? [])].sort().join(',')
    const exclude = [...(wsConfig.contextExcludeSpecs ?? [])].sort().join(',')
    wsParts.push(`${ws}:${include};${exclude}`)
  }
  parts.push(`workspaces:${wsParts.join('|')}`)

  parts.push(`step:${input.step}`)
  parts.push(`schemaVersion:${input.schemaVersion}`)
  parts.push(`followDeps:${input.followDeps}`)
  if (input.depth !== undefined) {
    parts.push(`depth:${input.depth}`)
  }
  if (input.sections !== undefined) {
    parts.push(`sections:${[...input.sections].sort().join(',')}`)
  }

  const canonical = parts.join('\n')
  const hash = createHash('sha256').update(canonical).digest('hex')
  return `sha256:${hash}`
}
