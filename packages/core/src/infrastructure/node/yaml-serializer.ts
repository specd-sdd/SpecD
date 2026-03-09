import { parse, stringify } from 'yaml'
import { YamlSerializer } from '../../application/ports/yaml-serializer.js'

/**
 * Node.js YAML serializer backed by the `yaml` npm package.
 *
 * Uses `lineWidth: 0` for stringify to prevent automatic line wrapping.
 */
export class NodeYamlSerializer extends YamlSerializer {
  /**
   * Parse a YAML string into a JavaScript value.
   *
   * @param content - Raw YAML string to parse
   * @returns The parsed JavaScript value
   */
  parse(content: string): unknown {
    return parse(content)
  }

  /**
   * Serialize a JavaScript value into a YAML string.
   *
   * @param data - The value to serialize
   * @returns A YAML string representation
   */
  stringify(data: unknown): string {
    return stringify(data, { lineWidth: 0 })
  }
}
