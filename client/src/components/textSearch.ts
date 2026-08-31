export type TextSearchOptions = Readonly<{
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isRegularExpression: boolean;
}>;

export type TextSearchMatch = Readonly<{
  index: number;
  length: number;
}>;

export type TextSearchResult = Readonly<{
  matches: readonly TextSearchMatch[];
  isPatternValid: boolean;
}>;

export const TEXT_SEARCH_RESULT_LIMIT = 1000;

export function findTextMatches(
  text: string,
  query: string,
  options: TextSearchOptions,
  limit = TEXT_SEARCH_RESULT_LIMIT,
): TextSearchResult {
  if (query.length === 0) return { matches: [], isPatternValid: true };

  const expression = createSearchExpression(query, options);
  if (expression === null) return { matches: [], isPatternValid: false };

  const matches: TextSearchMatch[] = [];
  let result = expression.exec(text);
  while (result !== null && matches.length < limit) {
    const matchedText = result[0];
    if (matchedText.length > 0
      && (!options.isWholeWord || isWholeWordMatch(text, result.index, matchedText.length))) {
      matches.push({ index: result.index, length: matchedText.length });
    }
    expression.lastIndex = result.index + Math.max(1, matchedText.length);
    result = expression.exec(text);
  }
  return { matches, isPatternValid: true };
}

function createSearchExpression(query: string, options: TextSearchOptions): RegExp | null {
  const pattern = options.isRegularExpression ? query : escapeRegularExpression(query);
  try {
    return new RegExp(pattern, options.isCaseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWholeWordMatch(text: string, index: number, length: number): boolean {
  const previousCharacters = Array.from(text.slice(0, index));
  const previousCharacter = previousCharacters[previousCharacters.length - 1] ?? "";
  const nextCharacter = text.slice(index + length)[Symbol.iterator]().next().value ?? "";
  return !isWordCharacter(previousCharacter) && !isWordCharacter(nextCharacter);
}

function isWordCharacter(value: string): boolean {
  return value.length > 0 && /[\p{L}\p{N}_]/u.test(value);
}
