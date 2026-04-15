#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

async function main() {
  const rootReadmePath = path.join(ROOT, 'README.md')
  const specdReadmePath = path.join(ROOT, 'packages', 'specd', 'README.md')

  try {
    const content = await fs.readFile(rootReadmePath, 'utf-8')
    await fs.writeFile(specdReadmePath, content, 'utf-8')
    console.log('[root-readme] Copied README.md to @specd/specd')
  } catch {
    console.log('[root-readme] No README.md found in root')
  }

  const specdChangelogPath = path.join(ROOT, 'packages', 'specd', 'CHANGELOG.md')
  const rootChangelogPath = path.join(ROOT, 'CHANGELOG.md')

  try {
    await fs.copyFile(specdChangelogPath, rootChangelogPath)
    console.log('[root-changelog] Copied @specd/specd CHANGELOG.md to root')
  } catch {
    console.log('[root-changelog] No CHANGELOG.md found in @specd/specd')
  }
}

main().catch((err) => {
  console.error('[root-changelog] Error:', err)
  process.exit(0)
})
