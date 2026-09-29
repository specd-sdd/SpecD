import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Runs `git <args>` in the given working directory and returns trimmed stdout.
 *
 * @param cwd - Working directory for the git command
 * @param args - Arguments to pass to the git binary
 * @returns Trimmed stdout from the git process
 * @throws When the git process exits with a non-zero code
 */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, spawnOptions(cwd))
  return stdout.trim()
}

/**
 * Runs `git <args>` synchronously in the given working directory and returns
 * trimmed stdout.
 *
 * @param cwd - Working directory for the git command
 * @param args - Arguments to pass to the git binary
 * @returns Trimmed stdout from the git process
 * @throws When the git process exits with a non-zero code
 */
export function gitSync(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { ...spawnOptions(cwd), encoding: 'utf-8' }).trim()
}

/**
 * Hides the console window when git runs on Windows.
 *
 * @param cwd - Working directory for the git command
 * @param platform - Host platform used to decide `windowsHide`
 * @returns Spawn options for `execFile`
 */
export function spawnOptions(
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): { cwd: string; windowsHide?: true } {
  return platform === 'win32' ? { cwd, windowsHide: true } : { cwd }
}
