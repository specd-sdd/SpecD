#!/usr/bin/env node
import { execSync } from 'node:child_process'

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

const status = run('git status --porcelain')

if (status) {
  console.error('Working tree is not clean:')
  console.error(status)
  process.exit(1)
}

console.log('✔ Repo clean')
