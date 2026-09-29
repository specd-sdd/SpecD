import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Runs `hg <args>` in the given working directory and returns trimmed stdout.
 *
 * @param cwd - Working directory for the hg command
 * @param args - Arguments to pass to the hg binary
 * @returns Trimmed stdout from the hg process
 * @throws When the hg process exits with a non-zero code
 */
export async function hg(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('hg', args, spawnOptions(cwd))
  return stdout.trim()
}

/**
 * Runs `hg <args>` synchronously in the given working directory and returns
 * trimmed stdout.
 *
 * @param cwd - Working directory for the hg command
 * @param args - Arguments to pass to the hg binary
 * @returns Trimmed stdout from the hg process
 * @throws When the hg process exits with a non-zero code
 */
export function hgSync(cwd: string, ...args: string[]): string {
  return execFileSync('hg', args, { ...spawnOptions(cwd), encoding: 'utf-8' }).trim()
}

/**
 * Hides the console window when Mercurial runs on Windows.
 *
 * @param cwd - Working directory for the hg command
 * @param platform - Host platform used to decide `windowsHide`
 * @returns Spawn options for `execFile`
 */
export function spawnOptions(
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): { cwd: string; windowsHide?: true } {
  return platform === 'win32' ? { cwd, windowsHide: true } : { cwd }
}
