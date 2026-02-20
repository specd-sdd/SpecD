import { Spec } from '../entities/spec.js'
import { DeltaConflictError } from '../errors/delta-conflict-error.js'

export interface DeltaConfig {
  readonly section: string
  readonly pattern: string
}

export interface OperationKeywords {
  readonly added:    string
  readonly modified: string
  readonly removed:  string
  readonly renamed:  string
  readonly from:     string
  readonly to:       string
}

const DEFAULT_OPERATIONS: OperationKeywords = {
  added:    'ADDED',
  modified: 'MODIFIED',
  removed:  'REMOVED',
  renamed:  'RENAMED',
  from:     'FROM',
  to:       'TO',
}

/**
 * Merges a delta spec into a base spec using the schema's delta configuration.
 *
 * Apply order per section: RENAMED → REMOVED → MODIFIED → ADDED
 * Conflict detection runs before any mutations are applied.
 *
 * See specs/core/delta-merger/spec.md and specs/_global/schema-format/spec.md
 * for the full behavioral contract.
 */
export function mergeSpecs(
  base: Spec,
  delta: Spec,
  deltaConfigs: readonly DeltaConfig[],
  deltaOperations?: OperationKeywords,
): Spec {
  const ops = { ...DEFAULT_OPERATIONS, ...deltaOperations }
  const deltaSections = delta.sections()
  const result = new Map(base.sections())

  for (const config of deltaConfigs) {
    const { section, pattern } = config

    const renamedContent  = deltaSections.get(`${ops.renamed} ${section}`)  ?? ''
    const removedContent  = deltaSections.get(`${ops.removed} ${section}`)  ?? ''
    const modifiedContent = deltaSections.get(`${ops.modified} ${section}`) ?? ''
    const addedContent    = deltaSections.get(`${ops.added} ${section}`)    ?? ''

    const hasDeltas =
      renamedContent.trim()  !== '' ||
      removedContent.trim()  !== '' ||
      modifiedContent.trim() !== '' ||
      addedContent.trim()    !== ''

    if (!hasDeltas) continue

    const renamedPairs  = parseRenamedPairs(renamedContent, pattern, ops)
    const removedNames  = [...parseBlocks(removedContent, pattern).keys()]
    const modifiedBlocks = parseBlocks(modifiedContent, pattern)
    const addedBlocks    = parseBlocks(addedContent, pattern)

    detectConflicts(section, renamedPairs, removedNames, modifiedBlocks, addedBlocks)

    const baseBlocks = parseBlocks(result.get(section) ?? '', pattern)

    // 1. RENAMED
    for (const { from, to } of renamedPairs) {
      const content = baseBlocks.get(from)
      if (content !== undefined) {
        baseBlocks.delete(from)
        baseBlocks.set(to, content)
      }
    }

    // 2. REMOVED
    for (const name of removedNames) {
      baseBlocks.delete(name)
    }

    // 3. MODIFIED (upsert)
    for (const [name, content] of modifiedBlocks) {
      baseBlocks.set(name, content)
    }

    // 4. ADDED
    for (const [name, content] of addedBlocks) {
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

// --- Conflict detection ---

interface RenamedPair {
  from: string
  to:   string
}

function detectConflicts(
  section: string,
  renamedPairs: readonly RenamedPair[],
  removedNames: readonly string[],
  modifiedBlocks: ReadonlyMap<string, string>,
  addedBlocks: ReadonlyMap<string, string>,
): void {
  const fromNames = new Set(renamedPairs.map((p) => p.from))
  const toNames   = new Set(renamedPairs.map((p) => p.to))

  // Duplicate FROM or TO within RENAMED
  if (fromNames.size !== renamedPairs.length) {
    throw new DeltaConflictError(`[${section}] Duplicate FROM name in RENAMED`)
  }
  if (toNames.size !== renamedPairs.length) {
    throw new DeltaConflictError(`[${section}] Duplicate TO name in RENAMED`)
  }

  // Duplicate names within each operation
  assertNoDuplicates(section, 'MODIFIED', [...modifiedBlocks.keys()])
  assertNoDuplicates(section, 'REMOVED',  removedNames)
  assertNoDuplicates(section, 'ADDED',    [...addedBlocks.keys()])

  // Cross-operation conflicts
  for (const name of modifiedBlocks.keys()) {
    if (removedNames.includes(name)) {
      throw new DeltaConflictError(`[${section}] '${name}' appears in both MODIFIED and REMOVED`)
    }
    if (addedBlocks.has(name)) {
      throw new DeltaConflictError(`[${section}] '${name}' appears in both MODIFIED and ADDED`)
    }
    if (fromNames.has(name)) {
      throw new DeltaConflictError(
        `[${section}] MODIFIED references '${name}' which is a FROM in RENAMED — use the TO name instead`,
      )
    }
  }

  for (const name of addedBlocks.keys()) {
    if (removedNames.includes(name)) {
      throw new DeltaConflictError(`[${section}] '${name}' appears in both ADDED and REMOVED`)
    }
    if (toNames.has(name)) {
      throw new DeltaConflictError(
        `[${section}] ADDED uses '${name}' which is already taken by a RENAMED TO`,
      )
    }
  }
}

function assertNoDuplicates(section: string, op: string, names: readonly string[]): void {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) {
      throw new DeltaConflictError(`[${section}] Duplicate block '${name}' in ${op}`)
    }
    seen.add(name)
  }
}

// --- Parsing helpers ---

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

function parseRenamedPairs(
  content: string,
  pattern: string,
  ops: OperationKeywords,
): RenamedPair[] {
  const pairs: RenamedPair[] = []
  const regex = patternToRegex(pattern)
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l !== '')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) { i++; continue }

    const fromPrefix = `${ops.from}:`
    const toPrefix   = `${ops.to}:`

    if (line.startsWith(fromPrefix)) {
      const fromHeader = line.slice(fromPrefix.length).trim()
      const fromMatch  = regex.exec(fromHeader)
      const nextLine   = lines[i + 1]

      if (fromMatch?.[1] !== undefined && nextLine !== undefined && nextLine.startsWith(toPrefix)) {
        const toHeader = nextLine.slice(toPrefix.length).trim()
        const toMatch  = regex.exec(toHeader)
        if (toMatch?.[1] !== undefined) {
          pairs.push({ from: fromMatch[1], to: toMatch[1] })
          i += 2
          continue
        }
      }
    }
    i++
  }

  return pairs
}

// --- Serialisation helpers ---

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
