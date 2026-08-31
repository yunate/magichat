export interface RegexMatch {
  index: number;
  match: string;
  groups: string[];
}

export interface RegexSuccess {
  ok: true;
  matched: boolean;
  matches: RegexMatch[];
}

export interface RegexFailure {
  ok: false;
  error: string;
}

export type RegexResult = RegexSuccess | RegexFailure;

export function runRegex(pattern: string, flags: string, text: string): RegexResult {
  if (pattern === "") return { ok: true, matched: false, matches: [] };
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid regular expression" };
  }
  const matches: RegexMatch[] = [];
  // matchAll requires the global flag and internally advances past zero-length matches, so it
  // cannot loop forever; without global we take only the first match.
  if (regex.global) {
    for (const found of text.matchAll(regex)) matches.push(_toMatch(found));
  } else {
    const found = regex.exec(text);
    if (found !== null) matches.push(_toMatch(found));
  }
  return { ok: true, matched: matches.length > 0, matches };
}

function _toMatch(found: RegExpMatchArray): RegexMatch {
  return {
    index: found.index ?? 0,
    match: found[0],
    groups: found.slice(1).map((group) => group ?? ""),
  };
}
