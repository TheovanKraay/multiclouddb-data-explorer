// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { useEffect, useState } from "react";
import {
  connect,
  errorMessage,
  listProviders,
} from "../api";
import type { ProviderDescriptor, ConnectResult } from "../api";

interface Props {
  onConnected: (result: ConnectResult) => void;
}

export function ConnectionForm({ onConnected }: Props) {
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProviders()
      .then((p) => {
        setProviders(p);
        if (p.length && !selected) setSelected(p[0].id);
      })
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider = providers.find((p) => p.id === selected);

  const setField = (key: string, v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      const result = await connect(provider.id, values);
      onConnected(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="connection-form" onSubmit={submit}>
      <h2>New Connection</h2>

      <label className="field">
        <span>Provider</span>
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setValues({});
            setError(null);
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>

      {provider?.identitySupported && (
        <p className="identity-note">{provider.identityNote}</p>
      )}

      {provider?.fields.map((f) => (
        <label className="field" key={f.key}>
          <span>
            {f.label}
            {f.required && <em className="req"> *</em>}
          </span>
          <input
            type={f.secret ? "password" : "text"}
            value={values[f.key] ?? ""}
            placeholder={f.placeholder}
            required={f.required}
            onChange={(e) => setField(f.key, e.target.value)}
          />
          {f.hint && <small className="hint">{f.hint}</small>}
        </label>
      ))}

      {error && <div className="error-banner">{error}</div>}

      <button type="submit" disabled={busy || !provider}>
        {busy ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
