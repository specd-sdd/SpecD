#!/usr/bin/env node
/**
 * Confirms implementation links for merge work done outside align-studio-specs-post-merge.
 * Sources: spec-lock.json implementation[] per scoped spec + manual overrides for empty locks.
 * Run: node dev/scripts/add-align-studio-implementation-links.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const CLI = 'node packages/cli/dist/index.js'
const CHANGE = 'align-studio-specs-post-merge'
const MANIFEST = path.join(
  ROOT,
  'specd-sdd/changes/20260630-171934-align-studio-specs-post-merge/manifest.json',
)

/** @type {Record<string, string>} */
const CODE_ROOT = {
  client: 'packages/client',
  api: 'packages/api',
  'studio-desktop': 'apps/specd-studio-desktop',
  'studio-web': 'apps/specd-studio-web',
  'code-graph-electron': 'packages/code-graph-electron',
  sdk: 'packages/sdk',
}

/**
 * spec-lock implementation[] is empty for these; map to on-disk merge code.
 * @type {Record<string, Array<{ file: string, symbols?: string[] }>>}
 */
const MANUAL_OVERRIDES = {
  'studio-desktop:desktop-local-data-adapter': [
    {
      file: 'apps/specd-studio-desktop/src/renderer/desktop-local-data-adapter.ts',
      symbols: ['createDesktopLocalDataAdapter'],
    },
  ],
  'api:dto-graph-file-ref': [
    { file: 'packages/api/src/delivery/http/dto/graph-file-ref.ts', symbols: ['GraphFileRefDto'] },
  ],
  'api:dto-graph-symbol-ref': [
    {
      file: 'packages/api/src/delivery/http/dto/graph-symbol-ref.ts',
      symbols: ['GraphSymbolRefDto'],
    },
  ],
  'api:dto-implementation-review': [
    {
      file: 'packages/api/src/delivery/http/dto/implementation-review.ts',
      symbols: ['ImplementationReviewDto'],
    },
  ],
  'api:dto-validate-batch-result': [
    {
      file: 'packages/api/src/delivery/http/dto/validate-batch-result.ts',
      symbols: ['ValidateBatchResultDto'],
    },
  ],
  'api:routes-changes-mutate-validate-all': [
    { file: 'packages/api/src/delivery/http/handlers/handler-changes-mutate.ts' },
  ],
  'api:routes-project-logs': [
    { file: 'packages/api/src/delivery/http/handlers/handler-project-logs.ts', symbols: ['registerProjectLogsRoutes'] },
  ],
  'client:dto-graph-file-ref': [
    { file: 'packages/client/src/dto/graph-file-ref.ts', symbols: ['GraphFileRefDto'] },
  ],
  'client:dto-graph-symbol-ref': [
    { file: 'packages/client/src/dto/graph-symbol-ref.ts', symbols: ['GraphSymbolRefDto'] },
  ],
  'client:dto-implementation-review': [
    {
      file: 'packages/client/src/dto/implementation-tracking.ts',
      symbols: ['ImplementationReviewDto', 'ImplementationTrackingDto'],
    },
  ],
  'client:dto-validate-batch-result': [
    {
      file: 'packages/client/src/dto/validate-batch-result.ts',
      symbols: ['ValidateBatchResultDto'],
    },
  ],
  'client:port-changes-mutate-validate-all': [
    { file: 'packages/client/src/port-changes-mutate.ts', symbols: ['validateChangeAll'] },
  ],
  'client:port-studio-panel': [
    { file: 'packages/client/src/port-studio-panel.ts', symbols: ['PortStudioPanel'] },
  ],
  'client:user-storage-port': [
    { file: 'packages/client/src/storage/user-storage-port.ts', symbols: ['IUserStorage'] },
    { file: 'packages/client/src/storage/file-user-storage.ts' },
    { file: 'packages/client/src/storage/local-storage-user-storage.ts' },
  ],
  'studio-desktop:recent-connections': [
    { file: 'apps/specd-studio-desktop/src/main/connection-store.ts' },
  ],
  'studio-desktop:welcome-and-file-menu': [
    { file: 'apps/specd-studio-desktop/src/main/index.ts' },
  ],
  'studio-web:vite-host': [{ file: 'apps/specd-studio-web/vite.config.ts' }],
  'studio-web:ui-plugin-dev': [
    { file: 'apps/specd-studio-web/src/plugin.ts' },
    { file: 'apps/specd-studio-web/scripts/sync-plugin-ui-studio.mjs' },
  ],
  // Runtime fixes not yet in spec-lock
  'studio-desktop:main-kernel-lifecycle': [
    { file: 'apps/specd-studio-desktop/package.json' },
    { file: 'apps/specd-studio-desktop/tsup.main.config.ts' },
    { file: 'apps/specd-studio-desktop/test/desktop-graph-runtime.spec.ts' },
  ],
  'code-graph-electron:composition': [
    { file: 'packages/code-graph-electron/package.json' },
    {
      file: 'packages/code-graph/src/application/use-cases/_shared/installed-code-graph-version.ts',
      symbols: ['readInstalledCodeGraphVersion'],
    },
  ],
  'sdk:composition': [{ file: 'packages/sdk/package.json' }],
  'client:specd-data-port': [{ file: 'packages/client/package.json' }],
}

/**
 * @param {string} wsRef e.g. `client:src/dto/change-detail.ts`
 */
function wsRefToRepoPath(wsRef) {
  const colon = wsRef.indexOf(':')
  if (colon === -1) return wsRef
  const ws = wsRef.slice(0, colon)
  const rel = wsRef.slice(colon + 1)
  const root = CODE_ROOT[ws]
  if (!root) throw new Error(`unknown workspace in ${wsRef}`)
  return `${root}/${rel}`
}

/**
 * @param {string} specId
 * @returns {Array<{ spec: string, file: string, symbols?: string[] }>}
 */
function linksForSpec(specId) {
  const [ws, slug] = specId.split(':')
  const lockPath = path.join(ROOT, 'specs', ws, slug, 'spec-lock.json')
  /** @type {Array<{ file: string, symbols?: string[] }>} */
  let entries = []

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    entries = (lock.implementation ?? []).map((item) => ({
      file: wsRefToRepoPath(item.file),
      symbols: item.symbols?.length ? item.symbols : undefined,
    }))
  }

  if (!entries.length && MANUAL_OVERRIDES[specId]) {
    entries = MANUAL_OVERRIDES[specId]
  } else if (MANUAL_OVERRIDES[specId]) {
    const seen = new Set(entries.map((e) => e.file))
    for (const extra of MANUAL_OVERRIDES[specId]) {
      if (!seen.has(extra.file)) entries.push(extra)
    }
  }

  return entries.map((e) => ({ spec: specId, ...e }))
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
/** @type {Array<{ spec: string, file: string, symbols?: string[] }>} */
const allLinks = []
const noLinks = []

for (const specId of manifest.specIds) {
  const links = linksForSpec(specId)
  if (!links.length) noLinks.push(specId)
  else allLinks.push(...links)
}

let added = 0
let skipped = 0

for (const link of allLinks) {
  const abs = path.join(ROOT, link.file)
  if (!fs.existsSync(abs)) {
    console.warn('skip missing', link.spec, link.file)
    skipped++
    continue
  }
  const symbols = link.symbols ?? []
  const symArgs = symbols.flatMap((s) => ['--symbol', s]).join(' ')
  const cmd = `${CLI} changes implementation add ${CHANGE} --spec ${link.spec} --file ${link.file} ${symArgs}`.trim()
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' })
    console.log('linked', link.spec, '->', link.file, symbols.length ? symbols.join(',') : '(file)')
    added++
  } catch (e) {
    const msg = e.stderr?.toString() || e.message
    if (msg.includes('already') || msg.includes('duplicate')) {
      console.log('exists', link.spec, link.file)
      added++
    } else {
      console.warn('failed', link.spec, link.file, msg.slice(0, 160))
      skipped++
    }
  }
}

if (noLinks.length) {
  console.warn('no implementation mapping:', noLinks.join(', '))
}

const list = JSON.parse(
  execSync(`${CLI} changes implementation list ${CHANGE} --format json`, {
    cwd: ROOT,
    encoding: 'utf8',
  }),
)
const files = list.trackedFiles.map((f) => f.file).join(',')
execSync(`${CLI} changes implementation resolve ${CHANGE} --file ${JSON.stringify(files)}`, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
})

console.log(`Done: ${added} links, ${skipped} skipped, ${list.links?.length ?? '?'} total links`)
