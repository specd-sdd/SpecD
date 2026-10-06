import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildIndexMap,
  collectMarkdownFiles,
  compileCollections,
  compileGuide,
  extractSections,
  parseFrontmatter,
  sortTopics,
  type CollectionConfig,
} from './guide-bundler.js'
import { generateSdkApiTopics, loadApiEntryPoints } from './sdk-api-generator.js'

export {
  buildIndexMap,
  collectMarkdownFiles,
  compileCollections,
  compileGuide,
  extractSections,
  parseFrontmatter,
  sortTopics,
  type CollectionConfig,
}

/**
 * Repository root, resolved from this script's location.
 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Hand-written documentation collections compiled into the guide catalog.
 *
 * The user guide is its own collection, and the SDK/extension development guide is
 * assembled from the curated documentation roots that document extension points.
 */
export const COLLECTIONS: readonly CollectionConfig[] = [
  { collection: 'guide', root: path.join(REPO_ROOT, 'docs/guide') },
  { collection: 'sdk', root: path.join(REPO_ROOT, 'docs/sdk') },
  { collection: 'core', root: path.join(REPO_ROOT, 'docs/core') },
  { collection: 'code-graph', root: path.join(REPO_ROOT, 'docs/code-graph') },
  { collection: 'skills', root: path.join(REPO_ROOT, 'docs/skills') },
  { collection: 'schemas', root: path.join(REPO_ROOT, 'docs/schemas') },
]

/**
 * Collection served by the main `@specd/guide` entry.
 */
export const USER_COLLECTION = 'guide'

/** Directory containing the JSON assets consumed and published by `@specd/guide`. */
export const CATALOG_OUTPUT_DIR = path.join(REPO_ROOT, 'packages/guide/generated')

/**
 * Bundles the user guide collection into `generated/guides.json` and the SDK
 * collection into `generated/guides-sdk.json`.
 *
 * Each catalog is emitted independently so that the user catalog file is unaffected
 * by the SDK collection's content.
 */
export async function bundleAllCollections(): Promise<void> {
  await fsp.mkdir(CATALOG_OUTPUT_DIR, { recursive: true })

  const userTopics = compileCollections([COLLECTIONS[0]!]).get(USER_COLLECTION) ?? []
  await fsp.writeFile(
    path.join(CATALOG_OUTPUT_DIR, 'guides.json'),
    JSON.stringify({ catalog: userTopics, index: buildIndexMap(userTopics) }),
  )

  const sdkCollections = COLLECTIONS.filter((c) => c.collection !== USER_COLLECTION)
  const handWritten = compileCollections(sdkCollections)
  const generated = await generateSdkApiTopics(REPO_ROOT)
  const sdkTopics = sortTopics([...handWritten.values()].flat().concat(generated))

  await fsp.writeFile(
    path.join(CATALOG_OUTPUT_DIR, 'guides-sdk.json'),
    JSON.stringify({ catalog: sdkTopics, index: buildIndexMap(sdkTopics) }),
  )
}

/**
 * Direct execution entrypoint.
 */
async function main(): Promise<void> {
  try {
    const entryPoints = loadApiEntryPoints(REPO_ROOT)
    console.log(
      `Bundling guide collections: ${COLLECTIONS.map((c) => c.collection).join(', ')} ` +
        `(+ API: ${entryPoints.map((e) => e.id).join(', ')})`,
    )
    await bundleAllCollections()
    console.log('Successfully bundled guide catalogs.')
  } catch (err) {
    console.error((err as Error).stack ?? (err as Error).message)
    process.exit(1)
  }
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  void main()
}
