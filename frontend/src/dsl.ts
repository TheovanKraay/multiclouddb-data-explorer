// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Single source of truth for the portable query DSL, transcribed directly from
// the SDK's ExpressionParser grammar and PortableFunction enum. Keep in sync
// with multiclouddb-api/.../query/ExpressionParser.java + PortableFunction.java.

export interface DslFunction {
  name: string;
  signature: string;
  description: string;
  snippet: string; // insertion template
}

export interface DslKeyword {
  word: string;
  description: string;
}

/** Portable functions (PortableFunction enum). All work across every provider. */
export const DSL_FUNCTIONS: DslFunction[] = [
  {
    name: "starts_with",
    signature: "starts_with(field, 'prefix')",
    description: "True if a string field starts with the given prefix.",
    snippet: "starts_with(",
  },
  {
    name: "contains",
    signature: "contains(field, 'substring')",
    description: "True if a string field contains the given substring.",
    snippet: "contains(",
  },
  {
    name: "field_exists",
    signature: "field_exists(field)",
    description: "True if the field is defined (exists / not null).",
    snippet: "field_exists(",
  },
  {
    name: "string_length",
    signature: "string_length(field)",
    description: "Length of a string field (use in a comparison).",
    snippet: "string_length(",
  },
  {
    name: "collection_size",
    signature: "collection_size(field)",
    description: "Size of an array/collection field (use in a comparison).",
    snippet: "collection_size(",
  },
];

/** Keywords/operators recognized by the parser. */
export const DSL_KEYWORDS: DslKeyword[] = [
  { word: "AND", description: "Logical AND (binds tighter than OR)." },
  { word: "OR", description: "Logical OR." },
  { word: "NOT", description: "Logical negation (binds tightest)." },
  { word: "IN", description: "field IN (v1, v2, …) — membership test." },
  { word: "BETWEEN", description: "field BETWEEN low AND high — inclusive range." },
  { word: "true", description: "Boolean literal." },
  { word: "false", description: "Boolean literal." },
  { word: "null", description: "Null literal." },
];

export const DSL_COMPARISON_OPS = ["=", "<>", "!=", "<", ">", "<=", ">="];

/** Example snippets shown in the DSL help drawer. */
export const DSL_EXAMPLES: { title: string; expr: string }[] = [
  { title: "Simple equality", expr: "status = 'active'" },
  { title: "Numeric comparison", expr: "age >= 18" },
  { title: "AND / OR grouping", expr: "status = 'active' AND (tier = 'gold' OR tier = 'platinum')" },
  { title: "Parameterized", expr: "country = @country AND createdYear > @minYear" },
  { title: "IN list", expr: "region IN ('us-east', 'us-west', 'eu-central')" },
  { title: "BETWEEN range", expr: "price BETWEEN 10 AND 100" },
  { title: "Prefix match", expr: "starts_with(email, 'admin@')" },
  { title: "Substring match", expr: "contains(description, 'urgent')" },
  { title: "Field existence", expr: "field_exists(deletedAt) = false" },
  { title: "String length", expr: "string_length(name) > 3" },
  { title: "Collection size", expr: "collection_size(tags) >= 1" },
  { title: "Dotted path", expr: "address.city = 'Seattle'" },
];

/**
 * Lightweight client-side validation mirroring the SDK's tokenizer + parser
 * shape. This is a pre-flight check for fast feedback; the SDK's parser remains
 * the authority (its errors are surfaced verbatim on execution).
 *
 * Returns null if plausibly valid, else a { message, position } diagnostic.
 */
export interface DslDiagnostic {
  message: string;
  position: number;
}

const FUNCTION_NAMES = new Set(DSL_FUNCTIONS.map((f) => f.name));

export function validateDsl(input: string): DslDiagnostic | null {
  const s = input.trim();
  if (!s) return null; // empty is allowed (no filter)

  // Balanced parentheses + quotes.
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "'") {
        // '' is an escaped quote inside a string
        if (s[i + 1] === "'") i++;
        else inString = false;
      }
      continue;
    }
    if (c === "'") inString = true;
    else if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth < 0) return { message: "Unmatched ')'", position: i };
    }
  }
  if (inString) return { message: "Unterminated string literal", position: s.length };
  if (depth > 0) return { message: "Unclosed '('", position: s.length };

  // Bare @ with no name.
  const at = s.indexOf("@");
  if (at >= 0 && !/@[A-Za-z0-9_]/.test(s.slice(at, at + 2))) {
    return { message: "Empty parameter name after '@'", position: at };
  }

  // Unknown function-like token: identifier immediately followed by '(' that
  // isn't a known portable function.
  const fnRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(s)) !== null) {
    const name = m[1];
    // Skip if this identifier is actually a keyword like NOT before a group.
    if (["AND", "OR", "NOT", "IN"].includes(name.toUpperCase())) continue;
    if (!FUNCTION_NAMES.has(name.toLowerCase())) {
      return {
        message: `Unknown function '${name}'. Portable functions: ${[...FUNCTION_NAMES].join(", ")}`,
        position: m.index,
      };
    }
  }

  return null;
}

/** Collect @parameter names referenced in an expression (for the param editor). */
export function extractParameters(input: string): string[] {
  const names = new Set<string>();
  const re = /@([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) names.add(m[1]);
  return [...names];
}
