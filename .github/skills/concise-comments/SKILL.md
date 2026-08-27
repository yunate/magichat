---
name: concise-comments
description: "Conventions for deciding whether and how to write code comments. Use when writing or reviewing function comments or documentation, or when writing, reviewing, or refactoring code that adds or changes comments. Prefer improving the code over explaining it, and keep necessary comments short. Operationalizes the comment rules in coding-conventions.instructions.md."
---

# Concise Comments

Prefer making the code itself more readable over writing more comments. A comment is
compensation for code that cannot explain itself, not a default action. This skill is
one with the comment section of
[coding-conventions.instructions.md](../../instructions/coding-conventions.instructions.md);
it operationalizes it and must not contradict it.

## First principle: readability over comments

Before writing a comment, ask: **can better naming, a smaller function, an early return,
or a named constant remove the need for this comment?** If yes, change the code instead.

```ts
// BAD: comment compensates for an opaque expression
// check if the user can edit (owner or admin, and not locked)
if (u.r === 0 || u.r === 1) { if (!u.l) { /* ... */ } }

// GOOD: the code reads itself, no comment needed
const canEdit = (user.isOwner || user.isAdmin) && !user.isLocked;
if (canEdit) { /* ... */ }
```

## When to comment (only these)

- **Explain "why", not "what"**: non-obvious intent, trade-offs, constraints, or pitfalls
  (working around a platform bug, a security consideration, a protocol requirement, a
  performance trade-off, historical reasons).
- **Special / counter-intuitive logic**: subtle algorithms, edge conditions, concurrency
  or ordering, the reason behind seemingly magic behavior.
- **Public API / complex types**: document the contract when naming and types do not
  communicate enough for callers.

```ts
// GOOD: explains a non-obvious "why"
// Bind to 127.0.0.1 only: this server grants local FS access and must never
// be reachable from other hosts on the LAN.
server.listen(port, "127.0.0.1");

```

## When NOT to comment (remove these)

- **Noise that restates the code**: `// assign a to b`, `// loop over the list`,
  `// return the result`.
- **Translation-style duplication** that drifts out of date as the code changes.
- **Change-log narration**: `// changed to Y to fix X`, `// added per requirement`.
  A comment describes the current "why" of the code, not its history — that is git's job.
- **Commented-out dead code** and leftover debug comments.
- **Long comments that narrate a whole function**: if you need that much prose, the code
  usually needs splitting or renaming instead.

```ts
// BAD: noise + change-log narration
// increment count by one
count++; // added this for the new feature request

// GOOD
count++;
```

## Style

- Keep comments short and use English half-width punctuation (`,` `.` `:` `;` `()` `""`).
- Keep comments in sync with code: change the code, update or delete the comment.
- Do not add comments to code you did not change in this task.

### Function comments

When a function needs a comment, or the user requests one, use a plain `//` block instead
of JSDoc. Preserve this structure:

```ts
// Function purpose.
// params:
//   - paramName: Parameter description.
// return:
//   Return value description.
// except:
//   - Error message or condition: When it is thrown.
```

- Keep the purpose and descriptions brief. Do not narrate implementation details.
- Parameter names must match the code. Update the comment whenever parameter names,
  return behavior, or exception behavior changes.
- Keep `params:` for functions without parameters and write `//   None.`.
- Keep `return:` for void functions and write `//   Nothing.`.
- Keep `except:` in every function comment.
- Use one `//   - ...` item for each exception the function may actively throw. Briefly
  describe the exception or triggering condition.
- Write `//   None.` when the function does not throw an exception.

```ts
// Extracts unique words in first occurrence order.
// params:
//   - text: Text to scan for words.
// return:
//   Extracted unique words.
// except:
//   None.
function extractUniqueWords(text: string): string[] {
  return [...new Set(text.split(/\s+/))];
}
```

## Heuristic for agents

1. About to write a comment? First try to delete it by improving naming or structure.
2. Only when logic is genuinely complex or has a non-obvious trade-off, add a short
   comment explaining the "why".
3. When reviewing, flag comments that restate code, narrate changes, or have gone stale —
   propose fixing the code or removing the comment.
