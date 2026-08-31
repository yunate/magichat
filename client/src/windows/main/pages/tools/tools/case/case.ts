export interface CaseResult {
  label: string;
  value: string;
}

export function convertCase(input: string): CaseResult[] {
  const words = splitWords(input).map((word) => word.toLowerCase());
  const camel = words.map((word, index) => (index === 0 ? word : _capitalize(word))).join("");
  const pascal = words.map(_capitalize).join("");
  return [
    { label: "camelCase", value: camel },
    { label: "PascalCase", value: pascal },
    { label: "snake_case", value: words.join("_") },
    { label: "kebab-case", value: words.join("-") },
    { label: "CONSTANT_CASE", value: words.map((word) => word.toUpperCase()).join("_") },
    { label: "lowercase", value: words.join(" ") },
    { label: "UPPERCASE", value: words.map((word) => word.toUpperCase()).join(" ") },
  ];
}

// Split on separators (space / underscore / hyphen / dot) and on camelCase and acronym boundaries,
// so mixed inputs like "getHTTPResponse_id" tokenize into get / HTTP / Response / id.
function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

function _capitalize(word: string): string {
  return word === "" ? "" : word.charAt(0).toUpperCase() + word.slice(1);
}
