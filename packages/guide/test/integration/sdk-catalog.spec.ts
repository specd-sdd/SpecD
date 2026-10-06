import { describe, expect, it } from 'vitest'
import { GuideTopicNotFoundError } from '../../src/domain/errors/guide-topic-not-found-error.js'
import {
  isGeneratedTopic,
  normalizeTopicRef,
  qualifyTopic,
} from '../../src/domain/topic-identity.js'
import { createGuideEngine } from '../../src/composition/guide-engine.js'
import { createGuideSdkEngine } from '../../src/composition/guide-sdk-engine.js'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'

const userEngine = createGuideEngine()
const sdkEngine = createGuideSdkEngine()
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** Extracts regular files from an npm-generated `.tgz` into a temporary directory. */
function extractTarball(tarballPath: string, destination: string): void {
  const archive = gunzipSync(readFileSync(tarballPath))
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) return

    const readField = (start: number, length: number): string =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/u, '')
    const name = readField(0, 100)
    const prefix = readField(345, 155)
    const archivePath = prefix.length > 0 ? `${prefix}/${name}` : name
    const relativePath = archivePath.replace(/^package\//u, '')
    const size = Number.parseInt(readField(124, 12).trim() || '0', 8)
    const type = readField(156, 1)
    offset += 512

    if (relativePath.length > 0 && (type === '' || type === '0')) {
      const outputPath = join(destination, relativePath)
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, archive.subarray(offset, offset + size))
    }
    offset += Math.ceil(size / 512) * 512
  }
}

describe('Published package catalog contract', () => {
  it('ships the package-root JSON assets loaded by both engines', async () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      files?: readonly string[]
    }

    expect(manifest.files).toContain('generated/')
    await expect(userEngine.listGuides()).resolves.toMatchObject({
      topics: expect.any(Array),
    })
    await expect(sdkEngine.listGuides()).resolves.toMatchObject({
      topics: expect.any(Array),
    })
  })

  it('loads both engines from an extracted package without repository docs', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'specd-guide-package-'))
    try {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const packed = spawnSync(npm, ['pack', '--json', '--pack-destination', fixtureRoot], {
        cwd: packageRoot,
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: join(fixtureRoot, 'npm-cache') },
        shell: process.platform === 'win32',
        windowsHide: true,
      })
      expect(packed.status, packed.stderr || packed.stdout).toBe(0)
      const packResult = JSON.parse(packed.stdout) as Array<{ filename: string }>
      const filename = packResult[0]?.filename
      expect(filename).toBeTypeOf('string')

      const extractedRoot = join(fixtureRoot, 'package')
      extractTarball(join(fixtureRoot, filename!), extractedRoot)
      const dependencyRoot = join(extractedRoot, 'node_modules', 'minisearch')
      mkdirSync(dirname(dependencyRoot), { recursive: true })
      cpSync(realpathSync(join(packageRoot, 'node_modules', 'minisearch')), dependencyRoot, {
        recursive: true,
        dereference: true,
      })

      const publicModule = (await import(
        pathToFileURL(join(extractedRoot, 'dist', 'public.js')).href
      )) as { createGuideEngine(): { listGuides(): Promise<{ topics: readonly unknown[] }> } }
      const sdkModule = (await import(
        pathToFileURL(join(extractedRoot, 'dist', 'sdk.js')).href
      )) as {
        createGuideSdkEngine(): {
          listGuides(): Promise<{ topics: readonly unknown[] }>
        }
      }

      const repositoryUserTopics = (await userEngine.listGuides()).pagination.total
      const repositorySdkTopics = (await sdkEngine.listGuides()).pagination.total
      const packedUserTopics = (await publicModule.createGuideEngine().listGuides()).topics.length
      const packedSdkTopics = (await sdkModule.createGuideSdkEngine().listGuides()).topics.length
      expect(packedUserTopics).toBe(repositoryUserTopics)
      expect(packedSdkTopics).toBe(repositorySdkTopics)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  }, 120_000)
})

describe('Topic identity', () => {
  it('splits a collection-qualified reference on the first delimiter', () => {
    expect(normalizeTopicRef('  core:examples/implementing-a-port.md  ')).toEqual({
      collection: 'core',
      topic: 'examples/implementing-a-port',
    })
  })

  it('treats a bare topic as unqualified', () => {
    expect(normalizeTopicRef('Workflow')).toEqual({
      collection: undefined,
      topic: 'workflow',
    })
  })

  it('distinguishes generated topics from nested hand-written documents', () => {
    expect(isGeneratedTopic('classes/ArtifactDag')).toBe(true)
    expect(isGeneratedTopic('variables/CORE_VERSION')).toBe(true)
    expect(isGeneratedTopic('examples/implementing-a-port')).toBe(false)
    expect(isGeneratedTopic('ports')).toBe(false)
  })

  it('qualifies a topic back into its composite identifier', () => {
    expect(qualifyTopic('sdk', 'classes/ArtifactDag')).toBe('sdk:classes/ArtifactDag')
  })
})

describe('SDK collection', () => {
  it('registers every curated collection', async () => {
    const collections = await sdkEngine
      .listGuides({ scope: { collection: 'schemas' } })
      .then((l) => l.topics)
    expect(collections.length).toBeGreaterThan(0)
    expect(collections.every((g) => g.collection === 'schemas')).toBe(true)
  })

  it('excludes generated API topics when the caller scopes them out', async () => {
    // The engine itself is scope-neutral; `specd guide-sdk` supplies this scope by
    // default so its catalog stays comparable in size to `specd guide`.
    const guides = await sdkEngine.listGuides({ scope: { generated: false } })
    expect(guides.pagination.total).toBeGreaterThan(0)
    // The scope still reports what it withholds, so a caller can reveal it.
    expect(guides.withheld?.generatedTopics).toBe(1298)
    expect(guides.topics.every((g) => !isGeneratedTopic(g.topic))).toBe(true)
  })

  it('returns every topic when no scope is supplied', async () => {
    const all = await sdkEngine.listGuides({ pagination: { page: 1, pageSize: 5000 } })
    const documents = await sdkEngine.listGuides({
      scope: { generated: false },
      pagination: { page: 1, pageSize: 5000 },
    })
    expect(all.pagination.total).toBeGreaterThan(documents.pagination.total)
    // The unscoped listing withholds nothing because it already returns everything.
    expect(all.withheld).toBeUndefined()
  })

  it('returns generated API topics when they are explicitly requested', async () => {
    const guides = await sdkEngine.listGuides({ scope: { generated: true } })
    expect(guides.pagination.total).toBeGreaterThan(0)
    expect(guides.topics.every((g) => isGeneratedTopic(g.topic))).toBe(true)
    // The scope selects generated topics across every collection.
    expect(guides.collections.map((c) => c.collection).sort()).toEqual([
      'code-graph',
      'core',
      'sdk',
    ])
  })

  it('orders by order then topic', async () => {
    const guides = await sdkEngine.listGuides({
      scope: { collection: 'schemas' },
      pagination: { page: 1, pageSize: 100 },
    })
    for (let i = 1; i < guides.topics.length; i++) {
      const prev = guides.topics[i - 1]!
      const cur = guides.topics[i]!
      expect(cur.order).toBeGreaterThanOrEqual(prev.order)
      if (cur.order === prev.order) {
        expect(cur.topic.localeCompare(prev.topic)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('paginates while preserving relative order', async () => {
    const all = await sdkEngine.listGuides({
      scope: { collection: 'core' },
      pagination: { page: 1, pageSize: 1000 },
    })
    const paged = await sdkEngine.listGuides({
      scope: { collection: 'core' },
      pagination: { page: 3, pageSize: 10 },
    })
    expect(paged.topics.map((g) => g.topic)).toEqual(all.topics.slice(20, 30).map((g) => g.topic))
    expect(paged.pagination).toMatchObject({ page: 3, pageSize: 10, returned: 10 })
    expect(paged.pagination.total).toBe(all.pagination.total)
  })

  it('resolves a collection-qualified hand-written document', async () => {
    const guide = await sdkEngine.getGuide('core:ports')
    expect(guide.collection).toBe('core')
    expect(guide.sourcePath).toBe('ports.md')
    expect(guide.content).toContain('# Ports')
  })

  it('resolves a nested document without consuming the path separator', async () => {
    const guide = await sdkEngine.getGuide('core:examples/implementing-a-port')
    expect(guide.sourcePath).toBe('examples/implementing-a-port.md')
  })

  it('normalizes whitespace, casing, and a trailing .md', async () => {
    const expected = (await sdkEngine.getGuide('core:ports')).topic
    expect((await sdkEngine.getGuide('  CORE:Ports.md ')).topic).toBe(expected)
  })

  it('addresses a generated API symbol and points at its real declaration', async () => {
    const guide = await sdkEngine.getGuide('sdk:interfaces/Kernel')
    expect(guide.collection).toBe('sdk')
    expect(guide.topic).toBe('interfaces/Kernel')
    expect(guide.sourcePath).toBe('packages/core/src/composition/kernel.ts')
    expect(guide.sourcePath).not.toContain('.md')
  })

  it('leads the available topics with the closest candidates', async () => {
    await expect(sdkEngine.getGuide('core:prot')).rejects.toMatchObject({
      code: 'UNKNOWN_GUIDE_TOPIC',
      availableTopics: expect.arrayContaining(['core:ports']),
    })
    const error = await sdkEngine.getGuide('core:prot').catch((e: unknown) => e)
    const available = (error as { availableTopics: readonly string[] }).availableTopics
    // The list is no longer printed, but it still ships to structured callers, so it leads
    // with what the caller most likely meant rather than with the catalog's first page.
    expect(available[0]).toBe('core:ports')
  })

  it('does not bury an unknown generated topic under the catalog', async () => {
    const error = await sdkEngine.getGuide('core:prot').catch((e: unknown) => e)
    const notFound = error as GuideTopicNotFoundError

    expect(notFound.availableTopics.length).toBeGreaterThan(0)
    expect(notFound.message).toBe("Guide topic 'core:prot' not found.")
    // 1300+ generated topics were truncated to a single line here; the count survives only
    // as structured data.
    expect(notFound.message.length).toBeLessThan(80)
  })

  it('exposes the real source file on an outline', async () => {
    const outline = await sdkEngine.getGuideOutline('core:ports')
    expect(outline.collection).toBe('core')
    expect(outline.file).toBe('ports.md')
    expect(outline.sections.length).toBeGreaterThan(0)
  })

  it('searches within a single collection', async () => {
    const hits = await sdkEngine.searchGuides('dependency tracking', {
      collections: ['code-graph'],
      limit: 5,
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.collection === 'code-graph')).toBe(true)
  })

  it('derives a guide-sdk read command for every collection but the user guide', async () => {
    const hits = await sdkEngine.searchGuides('kernel composition', { limit: 10 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.readCommand.startsWith('specd guide-sdk '))).toBe(true)
  })

  it('derives a bare guide read command for the user collection', async () => {
    const hits = await userEngine.searchGuides('approval gate', { limit: 10 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.collection === 'guide')).toBe(true)
    expect(hits.every((h) => h.readCommand.startsWith('specd guide '))).toBe(true)
    expect(hits.every((h) => !h.readCommand.includes('guide:'))).toBe(true)
  })
})

describe('Catalog isolation', () => {
  it('serves the same user catalog whether or not the SDK catalog is present', async () => {
    const userCatalog = await userEngine.listGuides()
    expect(userCatalog.topics).toHaveLength(22)
    expect(userCatalog.topics.every((g) => g.collection === 'guide')).toBe(true)
  })

  it('never exposes SDK collections through the user engine', async () => {
    const userCatalog = await userEngine.listGuides()
    const collections = new Set(userCatalog.topics.map((g) => g.collection))
    for (const sdkOnly of ['sdk', 'core', 'code-graph', 'skills', 'schemas']) {
      expect(collections.has(sdkOnly)).toBe(false)
    }
  })

  it('keeps the user catalog far smaller than the SDK catalog', async () => {
    const userCount = (await userEngine.listGuides()).pagination.total
    const sdkCount = (await sdkEngine.listGuides({ scope: {} })).pagination.total
    expect(sdkCount).toBeGreaterThan(userCount * 10)
  })
})
