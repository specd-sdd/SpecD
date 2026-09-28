#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const cli = join(repoRoot, 'packages', 'cli', 'dist', 'index.js')

const result = spawnSync(process.execPath, [cli, 'plugins', 'update'], {
  cwd: repoRoot,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
