/**
 * Expands a symbol name into a search-friendly string by splitting
 * camelCase, PascalCase, snake_case, and kebab-case tokens.
 *
 * The result contains the original name followed by the lowercased
 * constituent parts, so that FTS indexes match both the exact name
 * and any individual word within it.
 *
 * @param name - The symbol's declared name.
 * @returns A space-separated string: original name + lowercased parts.
 *
 * @example
 * expandSymbolName('handleError')     // "handleError handle error"
 * expandSymbolName('parseSpecId')     // "parseSpecId parse spec id"
 * expandSymbolName('XMLParser')       // "XMLParser xml parser"
 * expandSymbolName('is_valid_name')   // "is_valid_name is valid name"
 * expandSymbolName('my-component')    // "my-component my component"
 * expandSymbolName('getHTTPSUrl')     // "getHTTPSUrl get https url"
 */
export function expandSymbolName(name: string): string {
  const parts = name
    // Insert space before uppercase letter preceded by lowercase: handleError → handle Error
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space between uppercase run and uppercase+lowercase: XMLParser → XML Parser
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .trim()

  // If splitting produced the same single token, no expansion needed
  if (parts === name.toLowerCase()) {
    return name
  }

  return `${name} ${parts}`
}
