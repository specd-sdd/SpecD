#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const WORKSPACE_PACKAGE_MAP = {
  'core': '@specd/core',
  'cli': '@specd/cli',
  'code-graph': '@specd/code-graph',
  'skills': '@specd/skills',
  'schema-std': '@specd/schema-std',
  'mcp': '@specd/mcp',
  'plugin-manager': '@specd/plugin-manager',
  'plugin-agent-claude': '@specd/plugin-agent-claude',
  'plugin-agent-copilot': '@specd/plugin-agent-copilot',
  'plugin-agent-codex': '@specd/plugin-agent-codex',
}

async function findIndexFile(archiveDir) {
  const candidates = [
    path.join(archiveDir, '.specd-index.jsonl'),
    path.join(archiveDir, 'index.jsonl'),
  ]

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return null
}

async function getArchivedChangeInfo(changeName) {
  const archiveDir = path.join(ROOT, '.specd', 'archive')
  const indexPath = await findIndexFile(archiveDir)

  if (!indexPath) {
    console.warn(`[changeset-hook] Could not find index file in ${archiveDir}`)
    return null
  }

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const lines = content.trim().split('\n')

    for (const line of lines.reverse()) {
      const manifest = JSON.parse(line)
      if (
        manifest.path === changeName ||
        manifest.path.endsWith('/' + changeName) ||
        manifest.name === changeName
      ) {
        return manifest
      }
    }
  } catch (err) {
    console.warn(`[changeset-hook] Could not read archive index: ${err.message}`)
  }

  return null
}

async function getChangeDescription(archivePath) {
  const manifestPath = path.join(ROOT, '.specd', 'archive', archivePath, 'manifest.json')

  try {
    const content = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(content)
    return manifest.description || null
  } catch {
    return null
  }
}

async function getReleaseInfoFromManifest(archivePath) {
  const manifestPath = path.join(ROOT, '.specd', 'archive', archivePath, 'manifest.json')

  try {
    const content = await fs.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(content)
    const specIds = manifest.specIds || []
    const specBumps = new Map()

    for (const specId of specIds) {
      specBumps.set(specId, 'patch')
    }

    if (specBumps.size > 0) {
      return { specBumps }
    }
  } catch {
    // Ignore errors
  }

  return null
}

async function getReleaseInfoFromYaml(archivePath) {
  const releaseFilePath = path.join(
    ROOT,
    '.specd',
    'archive',
    archivePath,
    '.changeset-release.yaml',
  )

  let content
  try {
    content = await fs.readFile(releaseFilePath, 'utf-8')
  } catch {
    return null
  }

  const specBumps = new Map()
  const lines = content.split('\n')
  let inReleasesBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'releases:') {
      inReleasesBlock = true
      continue
    }
    if (inReleasesBlock && line.match(/^\s+\S+:/)) {
      const colonIndex = line.lastIndexOf(':')
      const rawKey = line.slice(0, colonIndex).trim()
      const key =
        (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
        (rawKey.startsWith("'") && rawKey.endsWith("'"))
          ? rawKey.slice(1, -1)
          : rawKey
      const value = line.slice(colonIndex + 1).trim()
      const bump = ['major', 'minor', 'patch'].includes(value) ? value : 'patch'
      specBumps.set(key, bump)
    } else if (inReleasesBlock && line.match(/^\S/) && trimmed !== '') {
      inReleasesBlock = false
    }
  }

  if (specBumps.size > 0) {
    return { specBumps }
  }

  return null
}

async function analyzeChangeContent(archivePath) {
  const changeDir = path.join(ROOT, '.specd', 'archive', archivePath)
  let hasBreakingChange = false
  let hasFeature = false

  const filesToCheck = ['proposal.md', 'design.md']

  for (const file of filesToCheck) {
    const filePath = path.join(changeDir, file)
    try {
      const content = await fs.readFile(filePath, 'utf-8')

      if (/\bbreaking:\s*\n/i.test(content) || /^breaking:\s*true/im.test(content)) {
        hasBreakingChange = true
      }
      if (/\bfeature:\s*\n/i.test(content) || /^feature:\s*true/im.test(content)) {
        hasFeature = true
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  if (hasBreakingChange) return 'major'
  if (hasFeature) return 'minor'
  return 'patch'
}

function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

async function writeChangeset(filepath, releases, content) {
  const releasesLines = releases.map(([pkg, type]) => `    "${pkg}": ${type}`).join('\n')

  const frontmatter = ['---', releasesLines, '---', ''].join('\n')
  const fullContent = frontmatter + content + '\n'

  try {
    await fs.writeFile(filepath, fullContent, 'utf-8')
  } catch (err) {
    console.warn(`[changeset-hook] Failed to write changeset: ${err.message}`)
  }
}

async function generateChangesets(changeInfo, bumpTypes, description) {
  if (!changeInfo) {
    return
  }

  const { name, specIds = [], archivedAt } = changeInfo

  const packages = new Map()

  for (const specId of specIds) {
    const [workspace] = specId.split(':')
    const packageName = WORKSPACE_PACKAGE_MAP[workspace]

    if (packageName && !packages.has(packageName)) {
      packages.set(packageName, bumpTypes[packageName] || 'patch')
    }
  }

  if (packages.size === 0) {
    console.log('[changeset-hook] No packages to release, skipping changeset creation')
    return
  }

  const bumpOrder = { major: 3, minor: 2, patch: 1 }
  const maxBump = [...packages.values()].reduce(
    (max, bump) => (bumpOrder[bump] > bumpOrder[max] ? bump : max),
    'patch',
  )

  let dateStr = ''
  if (archivedAt) {
    const date = new Date(archivedAt)
    dateStr = date.toISOString().slice(0, 10).replace(/-/g, '') + '-'
  }

  const changesetDir = path.join(ROOT, '.changeset')

  try {
    await fs.mkdir(changesetDir, { recursive: true })
  } catch {
    // Directory may already exist
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-'
  const baseName = toKebabCase(name).slice(0, 100 - today.length)
  const header = `${today.slice(0, -1)} - ${name}: ${description || name}`

  const changesetContent = [
    header,
    '',
    'Specs affected:',
    ...specIds.map((id) => `- \`${id}\``),
    '',
  ].join('\n')

  const pkgChangesetPath = path.join(changesetDir, `${today}${baseName}.md`)
  await writeChangeset(pkgChangesetPath, [...packages.entries()], changesetContent)
  console.log(`[changeset-hook] Created changeset: .changeset/${today}${baseName}.md`)
  console.log(
    `[changeset-hook] Packages: ${[...packages.entries()].map(([p, t]) => `${p}:${t}`).join(', ')}`,
  )

  const specdHeader = `${today} - ${name}: ${description || name}`
  const specdSpecContent = [
    specdHeader,
    '',
    'Modified packages: ',
    ...[...packages.entries()].map(([pkg]) => `- ${pkg}`),
    '',
    'Specs affected:',
    ...specIds.map((id) => `- \`${id}\``),
    '',
  ].join('\n')

  const specdChangesetPath = path.join(changesetDir, `${today}${baseName}-specd.md`)
  await writeChangeset(specdChangesetPath, [['@specd/specd', maxBump]], specdSpecContent)
  console.log(`[changeset-hook] Created changeset: .changeset/${today}${baseName}-specd.md`)
  console.log(`[changeset-hook] Meta: @specd/specd:${maxBump}`)
}

async function main() {
  const changeName = process.argv[2]

  if (!changeName) {
    console.warn(
      '[changeset-hook] Usage: node post-archive-changeset.js <change-name-or-archived-name>',
    )
    return
  }

  console.log(`[changeset-hook] Processing change: ${changeName}`)

  const changeInfo = await getArchivedChangeInfo(changeName)
  if (!changeInfo) {
    throw new Error(`Archived change not found in archive index: ${changeName}`)
  }

  const [description, releaseInfo, manifestInfo] = await Promise.all([
    getChangeDescription(changeInfo.path),
    getReleaseInfoFromYaml(changeInfo.path),
    getReleaseInfoFromManifest(changeInfo.path),
  ])

  const bumpTypes = {}
  const bumpOrder = { major: 3, minor: 2, patch: 1 }

  let baseBumps = releaseInfo?.specBumps || manifestInfo?.specBumps || new Map()

  if (baseBumps.size > 0) {
    const inferredBump = await analyzeChangeContent(changeInfo.path)

    for (const [specId, bump] of baseBumps) {
      const [workspace] = specId.split(':')
      const packageName = WORKSPACE_PACKAGE_MAP[workspace]
      if (packageName) {
        const finalBump = inferredBump === 'major' && bump !== 'major' ? inferredBump : bump
        if (!bumpTypes[packageName] || bumpOrder[finalBump] > bumpOrder[bumpTypes[packageName]]) {
          bumpTypes[packageName] = finalBump
        }
      }
    }

    const source = releaseInfo ? '.changeset-release.yaml' : 'manifest.json'
    console.log(`[changeset-hook] Release info from ${source}: ${JSON.stringify(bumpTypes)}`)
  } else {
    const inferredBump = await analyzeChangeContent(changeInfo.path)
    console.log(`[changeset-hook] No release info found, inferring bump: ${inferredBump}`)
    for (const specId of changeInfo.specIds || []) {
      const [workspace] = specId.split(':')
      const packageName = WORKSPACE_PACKAGE_MAP[workspace]
      if (packageName && !bumpTypes[packageName]) {
        bumpTypes[packageName] = inferredBump
      }
    }
  }

  await generateChangesets(changeInfo, bumpTypes, description)
}

main().catch((err) => {
  console.error('[changeset-hook] Unexpected error:', err)
  process.exit(1)
})
