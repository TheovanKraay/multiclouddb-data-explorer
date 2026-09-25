// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { useState } from "react";
import {
  errorMessage,
  runQuery,
} from "../api";
import type { Capability, QueryResult } from "../api";
import { isSupported } from "./CapabilityBadges";
import { ResultsTable } from "./ResultsTable";
import { DslEditor } from "./DslEditor";
import { extractParameters } from "../dsl";

interface Props {
  connectionId: string;
  capabilities: Capability[];
}

type Mode = "portable" | "native";

export function QueryPanel({ connectionId, capabilities }: Props) {
  const nativeAllowed = isSupported(capabilities, "native_sql_query");
  const [database, setDatabase] = useState("");
  const [collection, setCollection] = useState("");
  const [mode, setMode] = useState<Mode>("portable");
  const [expression, setExpression] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [partitionKey, setPartitionKey] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (token?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      // Coerce @param values: try number/boolean, else keep string.
      const coerced: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(paramValues)) {
        if (v === "true" || v === "false") coerced[k] = v === "true";
        else if (v !== "" && !isNaN(Number(v))) coerced[k] = Number(v);
        else coerced[k] = v;
      }
      const res = await runQuery({
        connectionId,
        database,
        collection,
        expression: mode === "portable" ? expression : undefined,
        nativeExpression: mode === "native" ? expression : undefined,
        parameters: mode === "portable" ? coerced : undefined,
        partitionKey: partitionKey || undefined,
        pageSize,
        continuationToken: token || undefined,
      });
      setResult(res);
      setContinuation(res.continuationToken);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="query-panel">
      <div className="target-row">
        <input
          placeholder="database"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
        />
        <input
          placeholder="collection"
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
        />
        <input
          placeholder="partition key (optional)"
          value={partitionKey}
          onChange={(e) => setPartitionKey(e.target.value)}
        />
      </div>

      <div className="mode-row">
        <label>
          <input
            type="radio"
            checked={mode === "portable"}
            onChange={() => setMode("portable")}
          />
          Portable expression
        </label>
        <label className={nativeAllowed ? "" : "disabled"}>
          <input
            type="radio"
            checked={mode === "native"}
            disabled={!nativeAllowed}
            onChange={() => setMode("native")}
          />
          Native SQL
          {!nativeAllowed && (
            <small className="hint"> (not supported by this provider)</small>
          )}
        </label>
      </div>

      {mode === "portable" ? (
        <DslEditor value={expression} onChange={setExpression} disabled={busy} />
      ) : (
        <textarea
          className="query-editor"
          rows={5}
          placeholder="Provider-native SQL"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
        />
      )}

      {mode === "portable" && extractParameters(expression).length > 0 && (
        <div className="param-editor">
          <h4>Parameters</h4>
          {extractParameters(expression).map((p) => (
            <label className="param-row" key={p}>
              <code>@{p}</code>
              <input
                value={paramValues[p] ?? ""}
                placeholder="value"
                onChange={(e) =>
                  setParamValues((prev) => ({ ...prev, [p]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className="query-actions">
        <label>
          Page size
          <input
            type="number"
            min={1}
            max={1000}
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          />
        </label>
        <button disabled={busy || !database || !collection} onClick={() => execute(null)}>
          {busy ? "Running…" : "Run query"}
        </button>
        {continuation && (
          <button disabled={busy} onClick={() => execute(continuation)}>
            Next page →
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <>
          {result.diagnostics && (
            <div className="diagnostics">
              {result.diagnostics.provider && (
                <span>provider: {result.diagnostics.provider}</span>
              )}
              {result.diagnostics.requestCharge != null && (
                <span>request charge: {result.diagnostics.requestCharge}</span>
              )}
              <span>{result.items.length} rows</span>
            </div>
          )}
          <ResultsTable rows={result.items} />
        </>
      )}
    </div>
  );
}
