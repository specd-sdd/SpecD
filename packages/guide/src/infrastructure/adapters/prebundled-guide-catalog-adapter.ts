import type { GuideCatalogPort } from '../../application/ports/guide-catalog-port.js'
import type { GuideSummary, GuideTopic } from '../../domain/models/index.js'
import type { GuideCollection } from '../../domain/models/guide-topic.js'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Loads and validates a package-root JSON guide catalog from source or compiled code.
 *
 * @param relativePath - Relative path from `dist/` to the packaged catalog asset.
 * @returns The immutable catalog records and their qualified-topic index.
 * @throws {Error} If the packaged asset does not contain a supported catalog shape.
 */
function loadCatalog(relativePath: string): {
  catalog: readonly GuideTopic[]
  index: Readonly<Record<string, number>>
} {
  const compiledPath = join(__dirname, relativePath)
  const sourcePath = join(__dirname, '../../../generated', basename(relativePath))
  const filePath = existsSync(compiledPath) ? compiledPath : sourcePath
  const json = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(json) as {
    catalog?: readonly GuideTopic[]
    index?: Readonly<Record<string, number>>
    topics?: readonly GuideTopic[]
  }
  // Support both shapes: the bundler writes `{catalog, index}` or just the array.
  if (Array.isArray(data.catalog ?? data.topics)) {
    const catalog = (data.catalog ?? data.topics)!
    const index =
      data.index ??
      Object.fromEntries(catalog.map((topic, idx) => [`${topic.collection}:${topic.topic}`, idx]))
    return { catalog, index }
  }
  throw new Error(`Invalid catalog file: ${filePath}`)
}

/**
 * In-memory catalog adapter backed by pre-bundled static guide records.
 *
 * The adapter serves exactly one catalog. A catalog MAY contain more than one
 * collection, and every record carries its own `collection` and `sourcePath`, so
 * resolution never has to guess which collection a topic came from.
 */
export class PrebundledGuideCatalogAdapter implements GuideCatalogPort {
  private readonly byQualified: ReadonlyMap<string, GuideTopic>
  private readonly catalog: readonly GuideTopic[]
  private readonly index: Readonly<Record<string, number>>

  /**
   * Initializes the adapter with optional catalog and index overrides.
   *
   * @param catalogOrPath - Static array of guide topics or relative path to JSON catalog
   * @param index - Index lookup mapping topic names to positions
   */
  constructor(
    catalogOrPath: readonly GuideTopic[] | string = '../generated/guides.json',
    index?: Readonly<Record<string, number>>,
  ) {
    if (typeof catalogOrPath === 'string') {
      const loaded = loadCatalog(catalogOrPath)
      this.catalog = loaded.catalog
      this.index = loaded.index
    } else {
      this.catalog = catalogOrPath
      this.index =
        index ??
        Object.fromEntries(
          this.catalog.map((topic, idx) => [`${topic.collection}:${topic.topic}`, idx]),
        )
    }
    this.byQualified = new Map(
      this.catalog.map((topic) => [`${topic.collection}:${topic.topic}`.toLowerCase(), topic]),
    )
  }

  /**
   * Returns summary descriptors for all guides in the catalog.
   *
   * @returns Array of guide summary descriptors
   */
  listGuides(): Promise<readonly GuideSummary[]> {
    return Promise.resolve(
      this.catalog.map((g) => ({
        collection: g.collection,
        topic: g.topic,
        title: g.title,
        description: g.description,
        order: g.order,
        lineCount: g.lineCount,
        byteLength: g.byteLength,
      })),
    )
  }

  /**
   * Looks up a single guide by its collection-qualified identifier.
   *
   * The supplied identifier MUST be `collection:topic`, because topic identifiers
   * are only unique within their collection.
   *
   * @param topic - The `collection:topic` identifier to retrieve
   * @returns The matching guide topic or null
   */
  getGuide(topic: string): Promise<GuideTopic | null> {
    return Promise.resolve(this.byQualified.get(topic) ?? null)
  }

  /**
   * Returns all full guide topic entities.
   *
   * @returns Array of full guide topics
   */
  getAllTopics(): Promise<readonly GuideTopic[]> {
    return Promise.resolve(this.catalog)
  }

  /**
   * Returns summary descriptors for every guide in the catalog, unfiltered.
   *
   * @returns Array of guide summary descriptors
   */
  getAllGuides(): Promise<readonly GuideSummary[]> {
    return this.listGuides()
  }

  /**
   * Returns the collection identifiers present in the catalog.
   *
   * @returns Distinct collection identifiers
   */
  getCollections(): Promise<readonly GuideCollection[]> {
    const seen = new Set<GuideCollection>()
    for (const topic of this.catalog) {
      seen.add(topic.collection)
    }
    return Promise.resolve([...seen].sort((a, b) => a.localeCompare(b, 'en')))
  }

  /**
   * Returns the positional index map the adapter was constructed with.
   *
   * @returns Index mapping topic names to catalog positions
   */
  getIndex(): Readonly<Record<string, number>> {
    return this.index
  }
}
