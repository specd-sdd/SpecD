import { cliError } from '../handle-error.js'

/**
 * Options for {@link confirmOrExit}.
 */
export interface ConfirmOptions {
  /** Prompt shown to the user (also used to derive the non-interactive error phrase). */
  readonly message: string
  /**
   * Exact non-interactive error message. When omitted, derived from {@link message}
   * as `"<message without ?> requires confirmation; pass --force to skip it"`.
   */
  readonly nonInteractiveMessage?: string
  /** When `true`, skip the prompt and treat the action as confirmed. */
  readonly force?: boolean
  /** Output format forwarded to {@link cliError} for structured error payloads. */
  readonly format: string
  /**
   * Whether a TTY prompt is available.
   * Defaults to `process.stdin.isTTY && process.stdout.isTTY`.
   */
  readonly isInteractive?: boolean
  /**
   * Confirmation prompt. Injected in tests; default wraps `@clack/prompts` `confirm`.
   * Return `false` when the user declines or cancels.
   */
  readonly prompt?: (message: string) => Promise<boolean>
}

/**
 * Default interactive prompt backed by `@clack/prompts`.
 *
 * @param message - Confirmation question
 * @returns `true` when confirmed; `false` when declined or cancelled
 */
async function defaultPrompt(message: string): Promise<boolean> {
  const { confirm, isCancel } = await import('@clack/prompts')
  const result = await confirm({ message })
  if (isCancel(result) || result === false) {
    return false
  }
  return true
}

/**
 * Confirms a destructive CLI action, or exits when confirmation cannot be obtained.
 *
 * - `force === true` → confirmed without prompting
 * - non-interactive and not forced → {@link cliError} (never returns)
 * - interactive → ask via `prompt`; cancel/false → `false`
 *
 * @param options - Confirmation options
 * @returns `true` when confirmed; `false` when the user declined (caller should print `cancelled`)
 */
export async function confirmOrExit(options: ConfirmOptions): Promise<boolean> {
  if (options.force === true) {
    return true
  }

  const interactive =
    options.isInteractive ?? (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY))

  if (!interactive) {
    const errorMessage =
      options.nonInteractiveMessage ??
      `${options.message.replace(/\?\s*$/, '').trim()} requires confirmation; pass --force to skip it`
    cliError(errorMessage, options.format)
  }

  const prompt = options.prompt ?? defaultPrompt
  return prompt(options.message)
}
