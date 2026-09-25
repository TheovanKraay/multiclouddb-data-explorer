// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// A tokenizer mirroring the SDK's ExpressionParser lexer (see
// multiclouddb-api/.../query/ExpressionParser.java#tokenize). Used for both
// syntax highlighting and field extraction. Kept deliberately close to the Java
// lexer so token boundaries match what the SDK will actually parse.

export type TokenKind =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "param"
  | "comp"
  | "paren"
  | "comma"
  | "dot"
  | "function"
  | "keyword"
  | "field"
  | "whitespace"
  | "unknown";

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

const FUNCTIONS = new Set([
  "starts_with",
  "contains",
  "field_exists",
  "string_length",
  "collection_size",
]);
const KEYWORDS = new Set(["and", "or", "not", "in", "between"]);

function isIdentStart(c: string) {
  return /[A-Za-z_]/.test(c);
}
function isIdentPart(c: string) {
  return /[A-Za-z0-9_]/.test(c);
}

/** Tokenize a DSL expression. Never throws; unknown chars become `unknown`. */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  const peekIdentIsFunctionCall = (endOfIdent: number): boolean => {
    let j = endOfIdent;
    while (j < n && /\s/.test(input[j])) j++;
    return input[j] === "(";
  };

  while (i < n) {
    const c = input[i];

    // Whitespace
    if (/\s/.test(c)) {
      const start = i;
      while (i < n && /\s/.test(input[i])) i++;
      tokens.push({ kind: "whitespace", value: input.slice(start, i), start, end: i });
      continue;
    }

    // String literal (single-quoted, '' escapes a quote)
    if (c === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (input[i] === "'") {
          if (input[i + 1] === "'") i += 2;
          else {
            i++;
            break;
          }
        } else i++;
      }
      tokens.push({ kind: "string", value: input.slice(start, i), start, end: i });
      continue;
    }

    // Parameter
    if (c === "@") {
      const start = i;
      i++;
      while (i < n && isIdentPart(input[i])) i++;
      tokens.push({ kind: "param", value: input.slice(start, i), start, end: i });
      continue;
    }

    // Number (optionally negative, decimal)
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      const start = i;
      if (c === "-") i++;
      while (i < n && /[0-9]/.test(input[i])) i++;
      if (input[i] === ".") {
        i++;
        while (i < n && /[0-9]/.test(input[i])) i++;
      }
      tokens.push({ kind: "number", value: input.slice(start, i), start, end: i });
      continue;
    }

    // Comparison operators
    if (c === "=" || c === "<" || c === ">" || c === "!") {
      const start = i;
      const two = input.slice(i, i + 2);
      if (two === "<=" || two === "<>" || two === ">=" || two === "!=") {
        i += 2;
      } else {
        i += 1;
      }
      tokens.push({ kind: "comp", value: input.slice(start, i), start, end: i });
      continue;
    }

    if (c === "(" || c === ")") {
      tokens.push({ kind: "paren", value: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ kind: "comma", value: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ".") {
      tokens.push({ kind: "dot", value: c, start: i, end: i + 1 });
      i++;
      continue;
    }

    // Identifier / keyword / boolean / null / function / field
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(input[i])) i++;
      const word = input.slice(start, i);
      const lower = word.toLowerCase();
      let kind: TokenKind;
      if (lower === "true" || lower === "false") kind = "boolean";
      else if (lower === "null") kind = "null";
      else if (KEYWORDS.has(lower)) kind = "keyword";
      else if (FUNCTIONS.has(lower) && peekIdentIsFunctionCall(i)) kind = "function";
      else kind = "field";
      tokens.push({ kind, value: word, start, end: i });
      continue;
    }

    tokens.push({ kind: "unknown", value: c, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

/**
 * Extract field references (including dotted paths) from a token stream.
 * A field is an identifier not used as a function name, joined across DOT tokens.
 */
export function fieldReferences(tokens: Token[]): string[] {
  const fields: string[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind !== "field") continue;
    let name = t.value;
    // Absorb `.ident` chains.
    let j = k + 1;
    while (
      tokens[j]?.kind === "dot" &&
      (tokens[j + 1]?.kind === "field")
    ) {
      name += "." + tokens[j + 1].value;
      j += 2;
    }
    k = j - 1;
    fields.push(name);
  }
  return fields;
}
