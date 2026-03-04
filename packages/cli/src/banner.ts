import figlet from 'figlet'
import chalk from 'chalk'

/**
 * Optional version strings shown to the right of the ASCII art.
 */
export interface BannerVersions {
  /** Version of the `@specd/cli` package. */
  cliVersion?: string
  /** Version of the `@specd/core` package. */
  coreVersion?: string
}

/**
 * Renders the SpecD ASCII art banner.
 *
 * "spec" is rendered in blue and "d" in green using the Calvin S figlet font
 * (box-drawing characters, 3 lines tall). The colour split is detected by
 * comparing a "spec"-only render with the full "specd" render so character
 * widths never need to be hard-coded.
 *
 * When `versions` is provided, `cliVersion` appears to the right of line 2
 * and `coreVersion` appears to the right of line 3 of the ASCII art.
 *
 * @param versions - Optional version strings to display alongside the logo.
 * @returns The coloured multi-line banner string.
 */
export function renderBanner(versions?: BannerVersions): string {
  const font: figlet.Fonts = 'Calvin S'
  const specLines = figlet.textSync('spec', { font }).split('\n')
  const specdLines = figlet.textSync('specd', { font }).split('\n')

  const maxWidth = Math.max(...specdLines.map((l) => l.length))
  const versionLabels = [
    versions?.cliVersion !== undefined ? chalk.dim(`cli  v${versions.cliVersion}`) : undefined,
    versions?.coreVersion !== undefined ? chalk.dim(`core v${versions.coreVersion}`) : undefined,
  ]

  const logo = specdLines
    .map((line, i) => {
      const splitAt = specLines[i]?.length ?? 0
      const colored = chalk.blue(line.slice(0, splitAt)) + chalk.green(line.slice(splitAt))
      // Append version label on lines 1 and 2 (cli on line 1, core on line 2)
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
