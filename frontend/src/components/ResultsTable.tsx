// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { useMemo, useState } from "react";

/** Renders heterogeneous JSON rows as a table with a union of top-level keys. */
export function ResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) Object.keys(r).forEach((k) => set.add(k));
    return Array.from(set);
  }, [rows]);

  if (!rows.length) return <div className="empty">No results.</div>;

  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="results">
      <table>
        <thead>
          <tr>
            <th className="row-toggle" />
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <>
              <tr key={i}>
                <td className="row-toggle">
                  <button onClick={() => setExpanded(expanded === i ? null : i)}>
                    {expanded === i ? "▾" : "▸"}
                  </button>
                </td>
                {columns.map((c) => (
                  <td key={c} className="cell" title={cell(r[c])}>
                    {cell(r[c])}
                  </td>
                ))}
              </tr>
              {expanded === i && (
                <tr key={`${i}-json`} className="json-row">
                  <td colSpan={columns.length + 1}>
                    <pre>{JSON.stringify(r, null, 2)}</pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
