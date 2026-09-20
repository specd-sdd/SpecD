import { HookFailedError } from '../../domain/errors/hook-failed-error.js'
import { type CheckResult } from '../../domain/services/transition-checks.js'

/**
 * Throws {@link HookFailedError} from a failed hook check result when aborting.
 *
 * @param result - Failed effect result
 * @returns Never
 * @throws {HookFailedError} Always throws from the failed effect details
 */
export function throwHookFailed(result: CheckResult): never {
  const command = typeof result.details?.command === 'string' ? result.details.command : 'hook'
  const exitCode = typeof result.details?.exitCode === 'number' ? result.details.exitCode : 1
  const stderr =
    typeof result.details?.stderr === 'string' ? result.details.stderr : (result.message ?? '')
  throw new HookFailedError(command, exitCode, stderr)
}
