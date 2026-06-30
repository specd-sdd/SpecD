import figlet from 'figlet'
import chalk from 'chalk'

/**
 * Optional version strings shown to the right of the ASCII art.
 */
export interface BannerVersions {
  /** Version of the `@specd/cli` package. */
  cliVersion?: string
  /** Version of the `@specd/sdk` package. */
  sdkVersion?: string
  /** Installed `@specd/core` version (re-exported via `@specd/sdk`). */
  coreVersion?: string
  /** Installed `@specd/code-graph` version (re-exported via `@specd/sdk`). */
  codeGraphVersion?: string
}

/**
 * Renders the SpecD ASCII art banner.
 *
 * "spec" is rendered in blue and "d" in green using the Calvin S figlet font
 * (box-drawing characters, 3 lines tall). The colour split is detected by
 * comparing a "spec"-only render with the full "specd" render so character
 * widths never need to be hard-coded.
 *
 * When `versions` is provided, `cliVersion` appears beside line 2 of the ASCII art
 * and the remaining platform package versions appear together beside line 3.
 *
 * @param versions - Optional version strings to display alongside the logo.
 * @returns The coloured multi-line banner string.
 */
export function renderBanner(versions?: BannerVersions): string {
  const font: figlet.Fonts = 'Calvin S'
  const specLines = figlet.textSync('spec', { font }).split('\n')
  const specdLines = figlet.textSync('specd', { font }).split('\n')

  const maxWidth = Math.max(...specdLines.map((l) => l.length))
  const trailingVersions = [
    versions?.sdkVersion !== undefined ? `sdk   v${versions.sdkVersion}` : undefined,
    versions?.coreVersion !== undefined ? `core  v${versions.coreVersion}` : undefined,
    versions?.codeGraphVersion !== undefined ? `graph v${versions.codeGraphVersion}` : undefined,
  ]
    .filter((label): label is string => label !== undefined)
    .join('  ')
  const versionLabels = [
    versions?.cliVersion !== undefined ? chalk.dim(`cli  v${versions.cliVersion}`) : undefined,
    trailingVersions.length > 0 ? chalk.dim(trailingVersions) : undefined,
  ]

  const logo = specdLines
    .map((line, i) => {
      const splitAt = specLines[i]?.length ?? 0
      const colored = chalk.blue(line.slice(0, splitAt)) + chalk.green(line.slice(splitAt))
      const versionLabel = i >= 1 ? versionLabels[i - 1] : undefined
      if (versionLabel !== undefined) {
        const pad = ' '.repeat(Math.max(0, maxWidth - line.length) + 3)
        return colored + pad + versionLabel
      }
      return colored
    })
    .join('\n')

  const tagline = chalk.bgGreen.black.bold('  The spec-driven platform      ')

  return logo + '\n' + tagline
}
