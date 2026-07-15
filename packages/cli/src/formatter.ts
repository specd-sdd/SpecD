import { encode as encodeToon } from '@toon-format/toon'
import { InvalidFormatError } from './errors/index.js'

/**
 * Supported output format values.
 *
 * - `text` — human-readable plain text; caller provides pre-formatted string
 * - `json` — machine-readable JSON
 * - `toon` — LLM-friendly Token-Oriented Object Notation
 */
export type OutputFormat = 'text' | 'json' | 'toon'

const VALID_FORMATS: readonly string[] = ['text', 'json', 'toon']

/**
 * Parses and validates a raw format string from the CLI `--format` flag.
 *
 * @param raw - The raw string value provided via `--format`
 * @returns A validated `OutputFormat`
 * @throws {InvalidFormatError} If the value is not a recognised format
 */
export function parseFormat(raw: string): OutputFormat {
  if (!VALID_FORMATS.includes(raw)) {
    throw new InvalidFormatError(`invalid format '${raw}' — must be one of: text, json, toon`)
  }
  return raw as OutputFormat
}

/**
 * Serializes a value into the selected output format without appending a newline.
 *
 * @param data - The data to serialize.
 * @param format - The output format.
 * @returns The serialized representation.
 */
export function serializeOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case 'text':
      return data as string
    case 'json':
      return JSON.stringify(data)
    case 'toon':
      return encodeToon(data)
  }
}

/**
 * Writes formatted output to stdout.
 *
 * For `text`, `data` must be a pre-formatted string.
 * For `json` and `toon`, `data` is serialized.
 *
 * @param data - The data to output; a string for `text`, any value for `json`/`toon`
 * @param format - The output format
 */
export function output(data: unknown, format: OutputFormat): void {
  process.stdout.write(`${serializeOutput(data, format)}\n`)
}
