// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { useMemo, useRef, useState } from "react";
import {
  DSL_EXAMPLES,
  DSL_FUNCTIONS,
  DSL_KEYWORDS,
  extractParameters,
  validateDsl,
} from "../dsl";
import type { DslDiagnostic } from "../dsl";

interface Suggestion {
  label: string;
  detail: string;
  insert: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

/** DSL-aware editor: autocomplete (functions + keywords), inline validation. */
export function DslEditor({ value, onChange, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [showSug, setShowSug] = useState(false);
  const [sel, setSel] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const diagnostic: DslDiagnostic | null = useMemo(
    () => validateDsl(value),
    [value],
  );

  // Current word under the caret (letters/underscores) drives suggestions.
  const currentWord = useMemo(() => {
    const upto = value.slice(0, caret);
    const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(upto);
    return m ? m[1] : "";
  }, [value, caret]);

  const suggestions: Suggestion[] = useMemo(() => {
    if (!currentWord) return [];
    const w = currentWord.toLowerCase();
    const fns: Suggestion[] = DSL_FUNCTIONS.filter((f) =>
      f.name.startsWith(w),
    ).map((f) => ({ label: f.signature, detail: f.description, insert: f.snippet }));
    const kws: Suggestion[] = DSL_KEYWORDS.filter((k) =>
      k.word.toLowerCase().startsWith(w),
    ).map((k) => ({ label: k.word, detail: k.description, insert: k.word + " " }));
    return [...fns, ...kws].slice(0, 8);
  }, [currentWord]);

  const applySuggestion = (s: Suggestion) => {
    const upto = value.slice(0, caret);
    const start = upto.length - currentWord.length;
    const next = value.slice(0, start) + s.insert + value.slice(caret);
    onChange(next);
    setShowSug(false);
    // Restore focus after state settles.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        const p = start + s.insert.length;
        el.focus();
        el.setSelectionRange(p, p);
        setCaret(p);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSug && suggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => (s + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (s - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[sel]);
      } else if (e.key === "Escape") {
        setShowSug(false);
      }
    }
  };

  const sync = () => {
    const el = ref.current;
    if (el) setCaret(el.selectionStart ?? 0);
  };

  const params = extractParameters(value);

  return (
    <div className="dsl-editor">
      <div className="dsl-toolbar">
        <span className="dsl-label">Portable DSL</span>
        <button
          type="button"
          className="linklike"
          onClick={() => setShowHelp((v) => !v)}
        >
          {showHelp ? "Hide examples" : "DSL examples"}
        </button>
      </div>

      <div className="dsl-input-wrap">
        <textarea
          ref={ref}
          className={`dsl-textarea ${diagnostic ? "invalid" : ""}`}
          rows={4}
          spellCheck={false}
          disabled={disabled}
          placeholder="status = 'active' AND age >= @minAge"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSug(true);
            setSel(0);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={sync}
          onClick={sync}
          onBlur={() => setTimeout(() => setShowSug(false), 120)}
        />
        {showSug && suggestions.length > 0 && (
          <ul className="dsl-suggestions">
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                className={i === sel ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
              >
                <code>{s.label}</code>
                <span className="sug-detail">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {diagnostic ? (
        <div className="dsl-diagnostic error">
          ⚠ {diagnostic.message} (col {diagnostic.position + 1})
        </div>
      ) : (
        value.trim() && <div className="dsl-diagnostic ok">✓ looks valid</div>
      )}

      {params.length > 0 && (
        <div className="dsl-params-hint">
          Parameters: {params.map((p) => <code key={p}>@{p}</code>)}
        </div>
      )}

      {showHelp && (
        <div className="dsl-help">
          <table>
            <tbody>
              {DSL_EXAMPLES.map((ex) => (
                <tr key={ex.title}>
                  <td className="ex-title">{ex.title}</td>
                  <td>
                    <code
                      className="ex-code"
                      onClick={() => onChange(ex.expr)}
                      title="Click to insert"
                    >
                      {ex.expr}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
