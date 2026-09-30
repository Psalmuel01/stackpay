/**
 * Tiny syntax highlighter for documentation snippets (TypeScript/JavaScript, shell, JSON).
 * It only colours tokens; it never evaluates or transforms the code.
 */

export type CodeLanguage = "ts" | "bash" | "json";
export type TokenType = "keyword" | "string" | "comment" | "number" | "function" | "property" | "flag" | "variable" | "command";
export type Token = { type: TokenType | null; text: string };

const KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "else", "export", "extends",
  "finally", "for", "from", "function", "if", "import", "in", "instanceof", "interface", "let", "new", "of", "return",
  "switch", "throw", "try", "type", "typeof", "var", "while",
]);
const LITERALS = new Set(["true", "false", "null", "undefined"]);

export function highlight(code: string, lang: CodeLanguage): Token[] {
  const tokens: Token[] = [];
  const push = (type: TokenType | null, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else tokens.push({ type, text });
  };
  const nextNonSpace = (from: number) => {
    const match = /\S/.exec(code.slice(from));
    return match ? code[from + match.index] : "";
  };
  const atLineStart = (at: number) => /(^|\n)[ \t]*$/.test(code.slice(0, at));

  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    const prev = code[i - 1] ?? "";
    let match: RegExpExecArray | null;

    if (lang !== "bash" && (match = /^\/\/[^\n]*/.exec(rest))) {
      push("comment", match[0]);
    } else if (lang === "bash" && (!prev || /\s/.test(prev)) && (match = /^#[^\n]*/.exec(rest))) {
      push("comment", match[0]);
    } else if ((match = /^(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1?/.exec(rest))) {
      // A quoted key followed by ":" is a JSON/object property.
      const isKey = lang !== "bash" && nextNonSpace(i + match[0].length) === ":";
      push(isKey ? "property" : "string", match[0]);
    } else if (lang === "bash" && (match = /^\$[A-Za-z_]\w*/.exec(rest))) {
      push("variable", match[0]);
    } else if (lang === "bash" && /\s/.test(prev) && (match = /^--?[A-Za-z][\w-]*/.exec(rest))) {
      push("flag", match[0]);
    } else if ((lang === "bash" ? !prev || /[\s=]/.test(prev) : !/[\w$.]/.test(prev)) && (match = /^\d+(?:\.\d+)?/.exec(rest))) {
      push("number", match[0]);
    } else if ((match = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = match[0];
      const after = nextNonSpace(i + word.length);
      let type: TokenType | null = null;
      if (lang === "bash") type = atLineStart(i) ? "command" : null;
      else if (KEYWORDS.has(word)) type = "keyword";
      else if (LITERALS.has(word)) type = "number";
      else if (after === "(") type = "function";
      else if (after === ":" && prev !== "." && code[i + word.length] === ":") type = "property";
      push(type, word);
    } else {
      match = /^[\s\S]/.exec(rest)!;
      push(null, match[0]);
    }
    i += match[0].length;
  }
  return tokens;
}

/** Splits highlighted tokens into lines for line-numbered rendering. */
export function tokenLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    token.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: token.type, text: part });
    });
  }
  return lines;
}
