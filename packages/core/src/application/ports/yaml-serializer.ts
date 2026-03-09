/**
 * Port for YAML parsing and serialization.
 *
 * Keeps the application layer free from direct YAML library dependencies,
 * following the architecture rule that parsing belongs at the infrastructure
 * boundary.
 */
export abstract class YamlSerializer {
  /**
   * Parse a YAML string into a JavaScript value.
   *
   * @param content - Raw YAML string to parse
   * @returns The parsed JavaScript value
   */
  abstract parse(content: string): unknown

  /**
   * Serialize a JavaScript value into a YAML string.
   *
   * @param data - The value to serialize
   * @returns A YAML string representation
   */
  abstract stringify(data: unknown): string
}
