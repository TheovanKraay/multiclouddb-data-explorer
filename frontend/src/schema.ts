// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Infers a flat set of field paths from sampled documents, so the DSL editor
// can offer schema-aware field autocomplete and flag unknown fields.

const MAX_DEPTH = 4;
const MAX_FIELDS = 400;

/** Walk sampled rows and collect dotted field paths (objects recursed, arrays noted). */
export function inferFields(rows: Record<string, unknown>[]): string[] {
  const paths = new Set<string>();

  const walk = (obj: unknown, prefix: string, depth: number) => {
    if (paths.size >= MAX_FIELDS) return;
    if (obj === null || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      // Record the array field itself; sample first element for shape.
      if (obj.length && typeof obj[0] === "object") {
        walk(obj[0], prefix, depth); // arrays of objects: expose inner paths too
      }
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      paths.add(path);
      if (depth < MAX_DEPTH && v && typeof v === "object") {
        walk(v, path, depth + 1);
      }
    }
  };

  for (const r of rows) walk(r, "", 0);
  return Array.from(paths).sort();
}
