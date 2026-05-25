import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Walks up from `startDir` until a directory containing `specd.yaml` is found. */
export function findRepoRoot(startDir = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'specd.yaml'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  throw new Error('Monorepo root (specd.yaml) not found')
}
