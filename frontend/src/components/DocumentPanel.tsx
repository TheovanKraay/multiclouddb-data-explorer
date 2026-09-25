// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { useState } from "react";
import {
  deleteDocument,
  errorMessage,
  readDocument,
  writeDocument,
} from "../api";
import type { DocumentReadResult } from "../api";

export function DocumentPanel({ connectionId }: { connectionId: string }) {
  const [database, setDatabase] = useState("");
  const [collection, setCollection] = useState("");
  const [partitionKey, setPartitionKey] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [docText, setDocText] = useState("{\n  \n}");
  const [result, setResult] = useState<DocumentReadResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addr = () => ({
    connectionId,
    database,
    collection,
    partitionKey,
    sortKey: sortKey || undefined,
  });

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doRead = () =>
    wrap(async () => {
      const r = await readDocument(addr());
      setResult(r);
      if (r.found && r.document) setDocText(JSON.stringify(r.document, null, 2));
      setStatus(r.found ? "Document loaded" : "Not found");
    });

  const doWrite = (op: "create" | "upsert" | "update") =>
    wrap(async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(docText);
      } catch {
        throw "Document is not valid JSON";
      }
      await writeDocument(op, addr(), parsed);
      setStatus(`${op} succeeded`);
    });

  const doDelete = () =>
    wrap(async () => {
      await deleteDocument(addr());
      setStatus("Deleted");
      setResult(null);
    });

  return (
    <div className="document-panel">
      <div className="target-row">
        <input placeholder="database" value={database} onChange={(e) => setDatabase(e.target.value)} />
        <input placeholder="collection" value={collection} onChange={(e) => setCollection(e.target.value)} />
        <input placeholder="partition key" value={partitionKey} onChange={(e) => setPartitionKey(e.target.value)} />
        <input placeholder="sort key (optional)" value={sortKey} onChange={(e) => setSortKey(e.target.value)} />
      </div>

      <textarea
        className="doc-editor"
        rows={14}
        value={docText}
        onChange={(e) => setDocText(e.target.value)}
        spellCheck={false}
      />

      <div className="doc-actions">
        <button disabled={busy} onClick={doRead}>Read</button>
        <button disabled={busy} onClick={() => doWrite("create")}>Create</button>
        <button disabled={busy} onClick={() => doWrite("upsert")}>Upsert</button>
        <button disabled={busy} onClick={() => doWrite("update")}>Update</button>
        <button disabled={busy} className="danger" onClick={doDelete}>Delete</button>
      </div>

      {status && <div className="status-banner">{status}</div>}
      {error && <div className="error-banner">{error}</div>}

      {result?.metadata && (
        <div className="metadata">
          <h4>Metadata</h4>
          <pre>{JSON.stringify(result.metadata, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
