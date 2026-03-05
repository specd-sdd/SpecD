/**
 * Commander option accumulator for repeated flags (e.g. `--spec a --spec b`).
 *
 * @param value - The current option value
 * @param previous - Previously accumulated values
 * @returns A new array with the current value appended
 */
export function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}
