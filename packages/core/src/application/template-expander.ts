/**
 * Template variables available for substitution in hook commands and instruction text.
 *
 * Each top-level key is a namespace name; each value is a flat record of
 * string keys to primitive values. Example:
 *
 * ```typescript
 * {
 *   project: { root: '/Users/dev/my-project' },
 *   change: { name: 'add-auth', path: '/Users/dev/my-project/changes/add-auth' },
 * }
 * ```
 */
export type TemplateVariables = Record<string, Record<string, string | number | boolean>>

/**
 * Callback invoked when a template token cannot be resolved.
 *
 * @param token - Unresolved token path (e.g. `unknown.key`)
 */
export type OnUnknownVariable = (token: string) => void

/**
 * Escapes a value for safe interpolation into a POSIX or cmd command.
 *
 * @param value - The string value to escape
 * @param dialect - `posix` uses single quotes; `cmd` uses doubled quotes and percents
 * @returns The shell-escaped string
 */
function shellEscape(value: string, dialect: 'posix' | 'cmd'): string {
  if (dialect === 'cmd') {
    if (value.length === 0) return '""'
    return `"${value.replaceAll('%', '%%').replaceAll('"', '""')}"`
  }
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

/**
 * Encapsulates `{{namespace.key}}` template expansion logic.
 *
 * Receives built-in variables at construction time (e.g. `project.root`).
 * Each expansion call merges contextual variables with built-ins, where
 * built-in keys take precedence on collision.
 */
export class TemplateExpander {
  private readonly _builtins: TemplateVariables
  private readonly _onUnknown: OnUnknownVariable | undefined

  /**
   * Creates a new `TemplateExpander` with the given built-in variables.
   *
   * @param builtins - Variables always present in every expansion (e.g. `{ project: { root: '...' } }`)
   * @param onUnknown - Optional callback invoked when a token cannot be resolved
   */
  constructor(builtins: TemplateVariables, onUnknown?: OnUnknownVariable) {
    this._builtins = builtins
    this._onUnknown = onUnknown
  }

  /**
   * Expands `{{namespace.key}}` tokens with verbatim substitution.
   *
   * Used for instruction text and for `run:` hook values. Substitution is verbatim.
   *
   * @param template - The template string containing optional `{{namespace.key}}` tokens
   * @param variables - Contextual variables merged with built-ins (built-ins win on collision)
   * @returns The expanded string
   */
  expand(template: string, variables?: TemplateVariables): string {
    return this._replace(template, variables, false)
  }

  /**
   * Expands `{{namespace.key}}` tokens and quotes each substituted value.
   *
   * Used only for commands SpecD itself builds. Developer `run:` hooks use {@link expand}
   * and keep the developer's own quotes.
   *
   * @param template - The command string containing optional `{{namespace.key}}` tokens
   * @param variables - Contextual variables merged with built-ins (built-ins win on collision)
   * @param dialect - Shell dialect used when SpecD quotes a value it substitutes
   * @returns The expanded string with each substituted value quoted for the dialect
   */
  expandForShell(
    template: string,
    variables?: TemplateVariables,
    dialect: 'posix' | 'cmd' = 'posix',
  ): string {
    return this._replace(template, variables, dialect)
  }

  /**
   * Replaces `{{namespace.key}}` tokens in the template with resolved values.
   *
   * @param template - The template string to process
   * @param variables - Optional contextual variables
   * @param shell - `false` leaves instruction text verbatim; `posix` or `cmd` escapes substituted values
   * @returns The processed string with tokens replaced
   */
  private _replace(
    template: string,
    variables: TemplateVariables | undefined,
    shell: false | 'posix' | 'cmd',
  ): string {
    const merged = this._merge(variables)
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
      const keys = path.split('.')
      let current: unknown = merged
      for (const key of keys) {
        if (current == null || typeof current !== 'object') return this._unknown(path)
        current = (current as Record<string, unknown>)[key]
      }
      if (
        typeof current === 'string' ||
        typeof current === 'number' ||
        typeof current === 'boolean'
      ) {
        const value = String(current)
        return shell === false ? value : shellEscape(value, shell)
      }
      return this._unknown(path)
    })
  }

  /**
   * Handles unresolved tokens by invoking the optional callback and preserving the token.
   *
   * @param token - Unresolved token path (without braces)
   * @returns The original token with braces
   */
  private _unknown(token: string): string {
    this._onUnknown?.(token)
    return `{{${token}}}`
  }

  /**
   * Merges contextual variables with built-ins, where built-in keys win on collision.
   *
   * @param variables - Optional contextual variables to merge with built-ins
   * @returns The merged variable map
   */
  private _merge(variables: TemplateVariables | undefined): TemplateVariables {
    if (variables === undefined) return this._builtins
    const merged: Record<string, Record<string, string | number | boolean>> = {}
    // Start with contextual
    for (const [ns, entries] of Object.entries(variables)) {
      merged[ns] = { ...entries }
    }
    // Built-ins override on collision
    for (const [ns, entries] of Object.entries(this._builtins)) {
      if (merged[ns] !== undefined) {
        merged[ns] = { ...merged[ns], ...entries }
      } else {
        merged[ns] = { ...entries }
      }
    }
    return merged
  }
}
