#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FLOOR = '>=22'
// `SPECD_REPO_ROOT` lets tests point the check at a fixture repository.
const root = process.env.SPECD_REPO_ROOT ?? fileURLToPath(new URL('../../', import.meta.url))

/**
 * Lists the `package.json` files of the workspace packages under `packages/` and `apps/`.
 *
 * @returns {string[]} Absolute paths of every workspace `package.json`
 */
function workspaceManifests() {
  const manifests = []
  for (const group of ['packages', 'apps']) {
    const dir = join(root, group)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const manifest = join(dir, entry.name, 'package.json')
      if (entry.isDirectory() && existsSync(manifest)) manifests.push(manifest)
    }
  }
  return manifests
}

/**
 * Reads the Node.js major version the CI workflow installs.
 *
 * @returns {number | null} Major version, or `null` when it cannot be found
 */
function ciNodeMajor() {
  const workflow = join(root, '.github', 'workflows', 'ci.yml')
  if (!existsSync(workflow)) return null
  const match = readFileSync(workflow, 'utf8').match(/node-version:\s*['"]?(\d+)/)
  return match ? Number(match[1]) : null
}

const problems = []
const values = new Set()

for (const manifest of workspaceManifests()) {
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  if (pkg.private === true) continue
  const declared = pkg.engines?.node
  values.add(declared)
  if (declared !== FLOOR) {
    problems.push(`${pkg.name}: engines.node is ${JSON.stringify(declared)}, expected ${FLOOR}`)
  }
}

if (values.size > 1) {
  problems.push(`published packages disagree on engines.node: ${[...values].join(', ')}`)
}

const ci = ciNodeMajor()
const floorMajor = Number(FLOOR.replace(/[^\d]/g, ''))
if (ci === null) {
  problems.push('could not read node-version from .github/workflows/ci.yml')
} else if (ci < floorMajor) {
  problems.push(`CI installs Node ${ci}, which does not satisfy the declared floor ${FLOOR}`)
}

if (problems.length > 0) {
  console.error('Node.js engine floor check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✔ Node.js engine floor ${FLOOR} declared by every published package and met by CI`)
