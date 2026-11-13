import * as path from 'node:path'
import * as prettier from 'prettier'

/** Config resolved once per process, because `resolveConfig` touches the filesystem. */
let cached: Promise<prettier.Options | null> | undefined

/**
 * Loads the repository's Prettier config for Markdown output.
 *
 * The config is not hardcoded: a generated topic is documentation for the same repository as
 * every hand-written doc, so it must follow the same print width, quotes and semicolon rules.
 * If the file is missing or unreadable, Prettier's own defaults apply, which keeps the bundle
 * building rather than failing on a cosmetic setting.
 *
 * @param repoRoot - Repository root holding the config.
 * @returns Promise resolving to the resolved options.
 */
async function resolveOptions(repoRoot: string): Promise<prettier.Options> {
  cached ??= prettier.resolveConfig(path.join(repoRoot, '.prettierrc.json'), {
    editorconfig: true,
  })
  const resolved = await cached
  return { ...(resolved ?? {}), parser: 'markdown' }
}

/**
 * Formats a generated topic body.
 *
 * The tables are the reason this exists: a hand-built table row is only as wide as its own
 * cells, so columns land ragged across rows. Prettier pads every cell to the widest one, which
 * makes a table scannable by eye. Formatting is best-effort, though: a body Prettier cannot
 * parse is emitted unchanged rather than failing the bundle, because losing all 1298 topics
 * over one malformed body would be far worse than one unaligned table.
 *
 * @param body - Raw Markdown body.
 * @param repoRoot - Repository root holding the config.
 * @returns Promise resolving to the formatted body.
 */
export async function formatGeneratedBody(body: string, repoRoot: string): Promise<string> {
  try {
    return await prettier.format(body, await resolveOptions(repoRoot))
  } catch {
    return body
  }
}
