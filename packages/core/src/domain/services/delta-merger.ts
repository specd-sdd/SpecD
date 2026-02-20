import { Spec } from '../entities/spec.js'
import { DeltaConflictError } from '../errors/delta-conflict-error.js'

/**
 * Configuration for merging a single delta section within a spec.
 *
 * Specifies which Markdown section (`section`) to operate on and what
 * pattern the named blocks inside it follow (`pattern`), where `{name}` is
 * the placeholder for the block identifier.
 */
export interface DeltaConfig {
  /**
   * The Markdown section heading (without `## `) this config applies to
   * (e.g. `"Requirements"`).
   */
  readonly section: string
  /**
   * The heading pattern for named blocks within the section.
   * Must contain exactly one `{name}` placeholder (e.g. `"### Requirement: {name}"`).
   */
  readonly pattern: string
}

/**
 * The set of operation keyword strings used in delta section headings.
 *
 * Delta sections are recognised by prefixing the base section name with one of
 * these keywords (e.g. `"## ADDED Requirements"`). All six keywords are configurable
 * to support schemas with localised or custom vocabularies.
 */
export interface OperationKeywords {
  /** Keyword for the ADDED operation (default: `"ADDED"`). */
  readonly added: string
  /** Keyword for the MODIFIED operation (default: `"MODIFIED"`). */
  readonly modified: string
  /** Keyword for the REMOVED operation (default: `"REMOVED"`). */
  readonly removed: string
  /** Keyword for the RENAMED operation (default: `"RENAMED"`). */
  readonly renamed: string
  /** Keyword for the FROM line within a RENAMED block (default: `"FROM"`). */
  readonly from: string
  /** Keyword for the TO line within a RENAMED block (default: `"TO"`). */
  readonly to: string
}

/** Default English operation keywords used when none are provided. */
const DEFAULT_OPERATIONS: OperationKeywords = {
  added: 'ADDED',
  modified: 'MODIFIED',
  removed: 'REMOVED',
  renamed: 'RENAMED',
  from: 'FROM',
  to: 'TO',
}

/**
 * Merges a delta spec into a base spec using the schema's delta configuration.
 *
 * Apply order per section: RENAMED → REMOVED → MODIFIED → ADDED.
 * Conflict detection runs before any mutations are applied.
 *
 * See `specs/core/delta-merger/spec.md` and `specs/_global/schema-format/spec.md`
 * for the full behavioral contract.
 *
 * @param base - The original spec to merge into
 * @param delta - The spec containing the delta operations
 * @param deltaConfigs - Per-section merge configuration from the schema
 * @param deltaOperations - Optional custom operation keywords (defaults to ADDED/MODIFIED/REMOVED/RENAMED/FROM/TO)
 * @returns A new `Spec` with all delta operations applied; the base spec is never mutated
 * @throws {DeltaConflictError} When conflicting operations are detected in the delta
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

    const renamedContent = deltaSections.get(`${ops.renamed} ${section}`) ?? ''
    const removedContent = deltaSections.get(`${ops.removed} ${section}`) ?? ''
    const modifiedContent = deltaSections.get(`${ops.modified} ${section}`) ?? ''
    const addedContent = deltaSections.get(`${ops.added} ${section}`) ?? ''

    const hasDeltas =
      renamedContent.trim() !== '' ||
      removedContent.trim() !== '' ||
      modifiedContent.trim() !== '' ||
      addedContent.trim() !== ''

    if (!hasDeltas) continue

    const renamedPairs = parseRenamedPairs(renamedContent, pattern, ops)
    const removedNames = [...parseBlocks(removedContent, pattern).keys()]
    const modifiedBlocks = parseBlocks(modifiedContent, pattern)
    const addedBlocks = parseBlocks(addedContent, pattern)

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

/**
 * A FROM → TO name pair parsed from a RENAMED section.
 */
interface RenamedPair {
  /** The block name before the rename. */
  from: string
  /** The block name after the rename. */
  to: string
}

/**
 * Validates that the combined delta operations for a section contain no conflicts.
 *
 * Checked conditions:
 * - Duplicate FROM or TO names within RENAMED
 * - Duplicate block names within ADDED, MODIFIED, or REMOVED
 * - Cross-operation conflicts (e.g. same name in both MODIFIED and REMOVED)
 * - MODIFIED referencing a FROM name (should use the TO name instead)
 * - ADDED reusing a TO name already taken by RENAMED
 *
 * @param section - Section name used in error messages
 * @param renamedPairs - Parsed RENAMED FROM/TO pairs
 * @param removedNames - Block names listed in REMOVED
 * @param modifiedBlocks - Block names and content listed in MODIFIED
 * @param addedBlocks - Block names and content listed in ADDED
 * @throws {DeltaConflictError} On the first conflict detected
 */
function detectConflicts(
  section: string,
  renamedPairs: readonly RenamedPair[],
  removedNames: readonly string[],
  modifiedBlocks: ReadonlyMap<string, string>,
  addedBlocks: ReadonlyMap<string, string>,
): void {
  const fromNames = new Set(renamedPairs.map((p) => p.from))
  const toNames = new Set(renamedPairs.map((p) => p.to))

  // Duplicate FROM or TO within RENAMED
  if (fromNames.size !== renamedPairs.length) {
    throw new DeltaConflictError(`[${section}] Duplicate FROM name in RENAMED`)
  }
  if (toNames.size !== renamedPairs.length) {
    throw new DeltaConflictError(`[${section}] Duplicate TO name in RENAMED`)
  }

  // Duplicate names within each operation
  assertNoDuplicates(section, 'MODIFIED', [...modifiedBlocks.keys()])
  assertNoDuplicates(section, 'REMOVED', removedNames)
  assertNoDuplicates(section, 'ADDED', [...addedBlocks.keys()])

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

/**
 * Throws a `DeltaConflictError` if any name appears more than once in the list.
 *
 * @param section - Section name used in error messages
 * @param op - Operation name used in error messages (e.g. `"MODIFIED"`)
 * @param names - The list of block names to check for duplicates
 * @throws {DeltaConflictError} If a duplicate name is found
 */
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

/**
 * Converts a block `pattern` containing `{name}` into a regex that captures the name.
 *
 * @param pattern - The block heading pattern (e.g. `"### Requirement: {name}"`)
 * @returns A `RegExp` that matches a block heading line and captures the name in group 1
 */
function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split('{name}')
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${escaped.join('(.+)')}$`)
}

/**
 * Parses a section's Markdown content into a map of block name → block body.
 *
 * Block boundaries are determined by lines matching `pattern`. Each block's
 * body is trimmed of leading/trailing whitespace.
 *
 * @param content - The raw Markdown content of the section
 * @param pattern - The block heading pattern (e.g. `"### Requirement: {name}"`)
 * @returns A `Map` from block name to trimmed block content, in document order
 */
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

/**
 * Parses a RENAMED section's content into an ordered list of FROM/TO name pairs.
 *
 * Each pair must appear as consecutive non-empty lines:
 * `FROM: <pattern-with-name>` followed immediately by `TO:   <pattern-with-name>`.
 * Unrecognised lines are silently skipped.
 *
 * @param content - The raw Markdown content of the RENAMED section
 * @param pattern - The block heading pattern used to extract names
 * @param ops - The current operation keywords (to read the `from` and `to` prefixes)
 * @returns An array of `RenamedPair` objects in document order
 */
function parseRenamedPairs(
  content: string,
  pattern: string,
  ops: OperationKeywords,
): RenamedPair[] {
  const pairs: RenamedPair[] = []
  const regex = patternToRegex(pattern)
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) {
      i++
      continue
    }

    const fromPrefix = `${ops.from}:`
    const toPrefix = `${ops.to}:`

    if (line.startsWith(fromPrefix)) {
      const fromHeader = line.slice(fromPrefix.length).trim()
      const fromMatch = regex.exec(fromHeader)
      const nextLine = lines[i + 1]

      if (fromMatch?.[1] !== undefined && nextLine !== undefined && nextLine.startsWith(toPrefix)) {
        const toHeader = nextLine.slice(toPrefix.length).trim()
        const toMatch = regex.exec(toHeader)
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

/**
 * Serialises a map of block name → content back into a Markdown section body.
 *
 * @param blocks - Ordered map of block name → trimmed body content
 * @param pattern - The block heading pattern (e.g. `"### Requirement: {name}"`)
 * @returns A Markdown string with blocks separated by blank lines
 */
function blocksToContent(blocks: Map<string, string>, pattern: string): string {
  const parts: string[] = []
  for (const [name, content] of blocks) {
    parts.push(pattern.replace('{name}', name))
    if (content) parts.push(content)
  }
  return parts.join('\n\n')
}

/**
 * Serialises a map of section name → content back into a full Markdown document.
 *
 * @param sections - Ordered map of section name → trimmed section content
 * @returns A Markdown string with `## Section` headings separated by blank lines
 */
function sectionsToContent(sections: Map<string, string>): string {
  const parts: string[] = []
  for (const [name, content] of sections) {
    parts.push(`## ${name}`)
    if (content) parts.push(content)
  }
  return parts.join('\n\n')
}
