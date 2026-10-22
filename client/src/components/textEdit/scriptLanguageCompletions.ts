import powershellSnippets from "friendly-snippets/snippets/PowerShell.json";
import javascriptSnippets from "friendly-snippets/snippets/javascript/javascript.json";
import pythonSnippets from "friendly-snippets/snippets/python/python.json";
import type { ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import type { TextEditCompletion, TextEditCompletionContext } from "./textEditTypes";

type FriendlySnippet = Readonly<{
  prefix: string | readonly string[];
  body: string | readonly string[];
  description?: string | readonly string[];
}>;
type BasicSnippet = readonly [label: string, documentation: string, insertText: string];
type ScriptLanguageCompletion = TextEditCompletion & Readonly<{ prefixLength: number }>;

const LANGUAGE_COMPLETIONS: Readonly<Record<ScriptType, readonly TextEditCompletion[]>> = {
  powershell: createCompletions(powershellSnippets, [
    ["echo", "Write a value to the output pipeline.", 'echo "${1:message}"'],
    ["Write-Output", "Write a value to the output pipeline.", 'Write-Output "${1:message}"'],
    ["Write-Host", "Write a message to the terminal.", 'Write-Host "${1:message}"'],
    ["Write-Warning", "Write a warning message.", 'Write-Warning "${1:message}"'],
    ["Write-Error", "Write an error message.", 'Write-Error "${1:message}"'],
    ["Read-Host", "Read a line of terminal input.", 'Read-Host "${1:prompt}"'],
  ], true),
  node: createCompletions(javascriptSnippets, [
    ["console.info", "Write an informational message to standard output.", 'console.info(${1:message});'],
  ]),
  python: createCompletions(pythonSnippets, [
    ["print", "Write values to standard output.", 'print(${1:message})'],
    ["input", "Read a line of terminal input.", 'input("${1:prompt}")'],
  ]),
  cmd: createCompletions({}, [
    ["echo", "Write a message to the terminal.", 'echo ${1:message}'],
    ["set", "Set an environment variable.", 'set "${1:NAME}=${2:value}"'],
    ["if", "Run a block when a condition is true.", 'if ${1:condition} (\n  ${0}\n)'],
    ["for", "Run a block for each item in a batch script.", 'for %%${1:I} in (${2:items}) do (\n  ${0}\n)'],
    ["call", "Call a batch script and return to the caller.", 'call "${1:script.cmd}" ${2:arguments}'],
    ["exit", "Return from the batch script with an exit code.", 'exit /b ${1:0}'],
    ["cd", "Change the current drive and directory.", 'cd /d "${1:path}"'],
    ["pause", "Wait for a key press.", 'pause'],
    ["rem", "Add a batch script comment.", 'rem ${1:comment}'],
  ], true),
};

export function getScriptLanguageCompletions(
  scriptType: ScriptType | undefined,
  context: TextEditCompletionContext,
): readonly ScriptLanguageCompletion[] {
  if (scriptType === undefined) return [];
  const prefix = /[A-Za-z_#][A-Za-z0-9_.#-]*$/u.exec(context.linePrefix)?.[0] ?? "";
  if (prefix.length === 0 && context.linePrefix.trim().length > 0) return [];
  const isCaseInsensitive = scriptType === "powershell" || scriptType === "cmd";
  const matchingPrefix = isCaseInsensitive ? prefix.toLowerCase() : prefix;
  return LANGUAGE_COMPLETIONS[scriptType]
    .filter((completion) => (isCaseInsensitive ? completion.label.toLowerCase() : completion.label).startsWith(matchingPrefix))
    .map((completion) => ({ ...completion, prefixLength: prefix.length }));
}

function createCompletions(
  snippets: Readonly<Record<string, FriendlySnippet>>,
  supplements: readonly BasicSnippet[],
  isCaseInsensitive = false,
): TextEditCompletion[] {
  const completions: TextEditCompletion[] = [];
  const labels = new Set<string>();
  for (const [name, snippet] of Object.entries(snippets)) {
    const prefixes = typeof snippet.prefix === "string" ? [snippet.prefix] : [...snippet.prefix];
    if (/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name)) prefixes.push(name);
    const snippetLabels = new Set<string>();
    for (const prefix of prefixes) {
      const key = isCaseInsensitive ? prefix.toLowerCase() : prefix;
      if (snippetLabels.has(key)) continue;
      snippetLabels.add(key);
      labels.add(key);
      completions.push({
        label: prefix,
        detail: `${name} (friendly-snippets)`,
        documentation: typeof snippet.description === "string" ? snippet.description : snippet.description?.join("\n") ?? name,
        insertText: typeof snippet.body === "string" ? snippet.body : snippet.body.join("\n"),
        isSnippet: true,
      });
    }
  }
  for (const [label, documentation, insertText] of supplements) {
    const key = isCaseInsensitive ? label.toLowerCase() : label;
    if (labels.has(key)) continue;
    labels.add(key);
    completions.push({ label, documentation, insertText, detail: "Basic script snippet", isSnippet: true });
  }
  return completions;
}