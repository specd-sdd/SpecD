#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

async function main() {
  const specdChangelogPath = path.join(ROOT, 'packages', 'specd', 'CHANGELOG.md')
  const rootChangelogPath = path.join(ROOT, 'CHANGELOG.md')

  let content = '# Changelog\n\n'

  try {
    content += await fs.readFile(specdChangelogPath, 'utf-8')
  } catch {
    console.log('[root-changelog] No CHANGELOG.md found in @specd/specd')
    return
  }

  await fs.writeFile(rootChangelogPath, content, 'utf-8')
  console.log('[root-changelog] Copied @specd/specd CHANGELOG.md to root')
}

main().catch((err) => {
  console.error('[root-changelog] Error:', err)
  process.exit(0)
})
