import { Spec } from '../entities/spec.js'

/**
 * Configuration for one delta section, sourced from the active schema.
 * An artifact can have multiple delta configs (e.g. Requirements + Scenarios).
 */
export interface DeltaConfig {
  /** Section name in the base spec, e.g. "Requirements" */
  readonly section: string
  /** Block header pattern, e.g. "### Requirement: {name}" */
  readonly pattern: string
}

/**
 * Merges a delta spec into a base spec using the schema's delta configuration.
 *
 * Delta spec format — for each DeltaConfig with section "Requirements":
 *
 *   ## ADDED Requirements
 *   ### Requirement: New requirement name
 *   Content of new requirement...
 *
 *   ## MODIFIED Requirements
 *   ### Requirement: Existing requirement name
 *   Replacement content...
 *
 *   ## REMOVED Requirements
 *   ### Requirement: Requirement name to remove
 *
 * ADDED: blocks are appended to the section in base.
 * MODIFIED: blocks replace matching blocks in the section in base.
 * REMOVED: blocks are deleted from the section in base.
 *
 * Sections and blocks in base not mentioned in delta are preserved unchanged.
 * Multiple DeltaConfigs are applied independently (e.g. Requirements and Scenarios).
 */
export function mergeSpecs(base: Spec, delta: Spec, deltaConfigs: readonly DeltaConfig[]): Spec {
  const deltaSections = delta.sections()
  const result = new Map(base.sections())

  for (const config of deltaConfigs) {
    const { section, pattern } = config

    const addedContent = deltaSections.get(`ADDED ${section}`) ?? ''
    const modifiedContent = deltaSections.get(`MODIFIED ${section}`) ?? ''
    const removedContent = deltaSections.get(`REMOVED ${section}`) ?? ''

    const hasDeltas =
      addedContent.trim() !== '' ||
      modifiedContent.trim() !== '' ||
      removedContent.trim() !== ''

    if (!hasDeltas) continue

    const baseBlocks = parseBlocks(result.get(section) ?? '', pattern)

    for (const [name, content] of parseBlocks(modifiedContent, pattern)) {
      baseBlocks.set(name, content)
    }

    for (const name of parseBlocks(removedContent, pattern).keys()) {
      baseBlocks.delete(name)
    }

    for (const [name, content] of parseBlocks(addedContent, pattern)) {
      baseBlocks.set(name, content)
    }

    if (baseBlocks.size === 0) {
      result.delete(section)
    } else {
      result.set(section, blocksToContent(baseBlocks, pattern))
    }
  }

  return new Spec(base.path, sectionsToContent(result))
}

function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split('{name}')
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${escaped.join('(.+)')}$`)
}

function parseBlocks(content: string, pattern: string): Map<string, string> {
  const result = new Map<string, string>()
  const regex = patternToRegex(pattern)
  const lines = content.split('\n')

  let currentName: string | null = null
  let currentLines: string[] = []

  for (const line of lines) {
    const match = regex.exec(line)
    if (match?.[1] !== undefined) {
      if (currentName !== null) {
        result.set(currentName, currentLines.join('\n').trim())
      }
      currentName = match[1]
      currentLines = []
    } else if (currentName !== null) {
      currentLines.push(line)
    }
  }

  if (currentName !== null) {
    result.set(currentName, currentLines.join('\n').trim())
  }

  return result
}

function blocksToContent(blocks: Map<string, string>, pattern: string): string {
  const parts: string[] = []
  for (const [name, content] of blocks) {
    parts.push(pattern.replace('{name}', name))
    if (content) parts.push(content)
  }
  return parts.join('\n\n')
}

function sectionsToContent(sections: Map<string, string>): string {
  const parts: string[] = []
  for (const [name, content] of sections) {
    parts.push(`## ${name}`)
    if (content) parts.push(content)
  }
  return parts.join('\n\n')
}
