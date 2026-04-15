#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const CHANGESET_DIR = path.join(ROOT, '.changeset')

async function getSpecdChangesets() {
  const files = await fs.readdir(CHANGESET_DIR)
  return files
    .filter((f) => f.endsWith('-specd.md'))
    .map((f) => path.join(CHANGESET_DIR, f))
    .sort()
}

async function parseChangeset(filepath) {
  const content = await fs.readFile(filepath, 'utf-8')
  const lines = content.split('\n')

  let inFrontmatter = false
  let inFrontmatterEnd = false
  const bodyLines = []
  let afterFrontmatter = false

  for (const line of lines) {
    if (line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true
      } else if (!inFrontmatterEnd) {
        inFrontmatterEnd = true
        afterFrontmatter = true
        continue
      }
    }
    if (afterFrontmatter) {
      bodyLines.push(line)
    }
  }

  return bodyLines.join('\n').trim()
}

async function generateRootChangelog() {
  const specdChangesets = await getSpecdChangesets()

  if (specdChangesets.length === 0) {
    console.log('[root-changelog] No specd changesets found')
    return
  }

  const changelogPath = path.join(ROOT, 'CHANGELOG.md')
  let existingContent = ''

  try {
    existingContent = await fs.readFile(changelogPath, 'utf-8')
  } catch {
    existingContent = '# Changelog\n\n'
  }

  const entries = []
  for (const changesetPath of specdChangesets) {
    const body = await parseChangeset(changesetPath)
    if (body) {
      entries.push(body)
    }
  }

  if (entries.length === 0) {
    console.log('[root-changelog] No content to add')
    return
  }

  const newContent = [...entries, '', existingContent].join('\n')

  await fs.writeFile(changelogPath, newContent, 'utf-8')
  console.log(`[root-changelog] Updated ${changelogPath} with ${entries.length} entries`)
}

generateRootChangelog().catch((err) => {
  console.error('[root-changelog] Error:', err)
  process.exit(0)
})
