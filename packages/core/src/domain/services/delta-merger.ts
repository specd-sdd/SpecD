import { Spec } from '../entities/spec.js'

/**
 * Merges a delta spec into a base spec, producing the updated spec.
 *
 * Delta spec format — three ## sections, each containing ### sub-sections
 * that correspond to ## sections in the base spec:
 *
 *   ## ADDED
 *   ### New Section Name
 *   Content of new section...
 *
 *   ## MODIFIED
 *   ### Existing Section Name
 *   Replacement content...
 *
 *   ## REMOVED
 *   ### Section Name To Remove
 *
 * ADDED: sub-sections are appended to the base spec.
 * MODIFIED: sub-sections replace matching sections in the base spec.
 * REMOVED: sub-section names are deleted from the base spec.
 *
 * Sections in base not mentioned in delta are preserved unchanged.
 */
export function mergeSpecs(base: Spec, delta: Spec): Spec {
  const result = new Map(base.sections())

  const added = parseSubsections(delta.section('ADDED') ?? '')
  const modified = parseSubsections(delta.section('MODIFIED') ?? '')
  const removed = parseSubsections(delta.section('REMOVED') ?? '')

  for (const [name, content] of added) {
    result.set(name, content)
  }

  for (const [name, content] of modified) {
    result.set(name, content)
  }

  for (const name of removed.keys()) {
    result.delete(name)
  }

  return new Spec(base.path, sectionsToContent(result))
}

function parseSubsections(content: string): Map<string, string> {
  const result = new Map<string, string>()
  const lines = content.split('\n')

  let currentHeading: string | null = null
  let currentLines: string[] = []

  for (const line of lines) {
    const match = /^###\s+(.+)$/.exec(line)
    if (match?.[1] !== undefined) {
      if (currentHeading !== null) {
        result.set(currentHeading, currentLines.join('\n').trim())
      }
      currentHeading = match[1].trim()
      currentLines = []
    } else if (currentHeading !== null) {
      currentLines.push(line)
    }
  }

  if (currentHeading !== null) {
    result.set(currentHeading, currentLines.join('\n').trim())
  }

  return result
}

function sectionsToContent(sections: Map<string, string>): string {
  const parts: string[] = []
  for (const [name, content] of sections) {
    parts.push(`## ${name}`)
    if (content) parts.push(content)
  }
  return parts.join('\n\n')
}
