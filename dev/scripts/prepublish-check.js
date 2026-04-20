#!/usr/bin/env node
import { execSync } from 'node:child_process'

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

const status = run('git status --porcelain')

if (status) {
  console.error('Working tree is not clean')
  process.exit(1)
}

const branch = run('git rev-parse --abbrev-ref HEAD')

if (branch !== 'main') {
  console.error(`Not on main branch (current: ${branch})`)
  process.exit(1)
}

console.log('✔ Prepublish checks passed')
