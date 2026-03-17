import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createSpecNode, type SpecNode } from '../../domain/value-objects/spec-node.js'
import { computeContentHash } from './compute-content-hash.js'

/** Represents a discovered spec with its parsed node and content hash. */
export interface DiscoveredSpec {
  spec: SpecNode
  contentHash: string
}

/**
 * Extracts a top-level scalar field from a YAML metadata file.
 * @param content - The raw YAML content.
 * @param field - The field name to extract (e.g. `title`, `description`).
 * @returns The field value, or undefined if not found.
 */
function extractMetadataField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  if (!match?.[1]) return undefined
  let value = match[1].trim()
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1)
  }
  return value
}

/**
 * Parses the dependsOn list from a .specd-metadata.yaml file.
 * @param metadataContent - The raw YAML metadata content.
 * @returns An array of dependency spec identifiers.
 */
function extractDependsOnFromMetadata(metadataContent: string): string[] {
  const deps: string[] = []
  const lines = metadataContent.split('\n')
  let inDependsOn = false

  for (const line of lines) {
    if (line.match(/^dependsOn\s*:/)) {
      inDependsOn = true
      continue
    }
    if (inDependsOn) {
      const match = line.match(/^\s+-\s+(.+)/)
      if (match?.[1]) {
        deps.push(match[1].trim())
      } else if (!line.match(/^\s/)) {
        inDependsOn = false
      }
    }
  }
  return deps
}

/**
 * Builds a canonical spec identifier from the spec directory path.
 * @param specsDir - Absolute path to the root specs directory.
 * @param specDirPath - Absolute path to the individual spec's directory.
 * @returns The constructed spec identifier string.
 */
function buildSpecId(specsDir: string, specDirPath: string): string {
  const relToSpecs = relative(specsDir, specDirPath).replaceAll('\\', '/')
  const parts = relToSpecs.split('/')

  if (parts[0] === '_global') {
    return `_global:_global/${parts.slice(1).join('/')}`
  }

  const pkg = parts[0] ?? ''
  const topic = parts.slice(1).join('/')
  return `${pkg}:${pkg}/${topic}`
}

/**
 * Discovers all spec.md files under the workspace's specs/ directory and parses them into spec nodes.
 * @param workspacePath - Absolute path to the workspace root.
 * @param onProgress - Optional callback invoked with the number of specs found so far.
 * @param workspace - Optional workspace name for the discovered specs. Defaults to empty string.
 * @returns An array of discovered specs with their parsed nodes and content hashes.
 */
export function discoverSpecs(
  workspacePath: string,
  onProgress?: (found: number) => void,
  workspace?: string,
): DiscoveredSpec[] {
  const wsName = workspace ?? ''
  const specsDir = join(workspacePath, 'specs')
  if (!existsSync(specsDir)) return []

  const results: DiscoveredSpec[] = []

  /**
   * Recursively walks directories under specs/ looking for spec.md files.
   * @param dir - Absolute path to the directory to walk.
   */
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    const specMdPath = join(dir, 'spec.md')
    if (existsSync(specMdPath)) {
      let specContent: string
      try {
        specContent = readFileSync(specMdPath, 'utf-8')
      } catch {
        return
      }

      const specId = buildSpecId(specsDir, dir)
      const relPath = relative(workspacePath, dir).replaceAll('\\', '/')

      // Title and dependsOn come from metadata only — no fallback parsing
      let title = specId
      let dependsOn: string[] = []
      const metadataPath = join(dir, '.specd-metadata.yaml')
      if (existsSync(metadataPath)) {
        try {
          const metadataContent = readFileSync(metadataPath, 'utf-8')
          title = extractMetadataField(metadataContent, 'title') ?? specId
          dependsOn = extractDependsOnFromMetadata(metadataContent)
        } catch {
          // skip metadata
        }
      }

      const hash = computeContentHash(specContent)
      results.push({
        spec: createSpecNode({
          specId,
          path: relPath,
          title,
          contentHash: hash,
          dependsOn,
          workspace: wsName,
        }),
        contentHash: hash,
      })
      if (onProgress) onProgress(results.length)
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath, { throwIfNoEntry: false })
        if (stat?.isDirectory()) {
          walk(fullPath)
        }
      } catch {
        continue
      }
    }
  }

  walk(specsDir)
  return results
}

/**
 * Discovers all spec.md files under a given specs directory and parses them into spec nodes.
 * Unlike `discoverSpecs`, this accepts the specs directory path directly.
 * @param specsDir - Absolute path to the specs directory.
 * @param workspace - Workspace name for the discovered specs.
 * @param onProgress - Optional callback invoked with the number of specs found so far.
 * @returns An array of discovered specs with their parsed nodes and content hashes.
 */
export function discoverSpecsFromDir(
  specsDir: string,
  workspace: string,
  onProgress?: (found: number) => void,
): DiscoveredSpec[] {
  if (!existsSync(specsDir)) return []

  const results: DiscoveredSpec[] = []

  /**
   * Recursively walks directories looking for spec.md files.
   * @param dir - Absolute path to the directory to walk.
   */
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    const specMdPath = join(dir, 'spec.md')
    if (existsSync(specMdPath)) {
      let specContent: string
      try {
        specContent = readFileSync(specMdPath, 'utf-8')
      } catch {
        return
      }

      const relPath = relative(specsDir, dir).replaceAll('\\', '/')
      const specId = `${workspace}:${workspace}/${relPath}`

      // Title and dependsOn come from metadata only — no fallback parsing
      let title = specId
      let dependsOn: string[] = []
      const metadataPath = join(dir, '.specd-metadata.yaml')
      if (existsSync(metadataPath)) {
        try {
          const metadataContent = readFileSync(metadataPath, 'utf-8')
          title = extractMetadataField(metadataContent, 'title') ?? specId
          dependsOn = extractDependsOnFromMetadata(metadataContent)
        } catch {
          // skip metadata
        }
      }

      const hash = computeContentHash(specContent)
      results.push({
        spec: createSpecNode({
          specId,
          path: relPath,
          title,
          contentHash: hash,
          dependsOn,
          workspace,
        }),
        contentHash: hash,
      })
      if (onProgress) onProgress(results.length)
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath, { throwIfNoEntry: false })
        if (stat?.isDirectory()) {
          walk(fullPath)
        }
      } catch {
        continue
      }
    }
  }

  walk(specsDir)
  return results
}
