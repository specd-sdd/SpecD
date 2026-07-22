import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { isEnoent } from './is-enoent.js'
import { writeFileAtomic } from './write-atomic.js'

/** Canonical content ensured at `{configPath}/tmp/.gitignore`. */
const TMP_GITIGNORE_CONTENT = '*\n!.gitignore\n'

/**
 * Idempotently ensures `{configPath}/tmp/.gitignore` exists with the
 * canonical content (`*` then `!.gitignore`) so the entire `tmp/` tree —
 * including fs-cache indexes and change locks — is excluded from git while
 * the `.gitignore` file itself stays tracked.
 *
 * Shared by all FS repositories that write under `{configPath}/tmp/`.
 *
 * @param configPath - Absolute path to the config directory
 */
export async function ensureTmpGitignore(configPath: string): Promise<void> {
  const tmpDir = path.join(configPath, 'tmp')
  const gitignorePath = path.join(tmpDir, '.gitignore')

  let existing: string | null = null
  try {
    existing = await fs.readFile(gitignorePath, 'utf8')
  } catch (err) {
    if (!isEnoent(err)) throw err
  }

  if (existing === TMP_GITIGNORE_CONTENT) return

  await fs.mkdir(tmpDir, { recursive: true })
  await writeFileAtomic(gitignorePath, TMP_GITIGNORE_CONTENT)
}
