/**
 * PropsEditor — the small JSON editor behind the {} button in a panel
 * header. Applies as you type (debounced); invalid JSON is pointed at
 * and simply not applied.
 */
import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { formatPropsJson, parsePropsJson } from "../core/board";
import { useDebounced } from "./useDebounced";

interface PropsEditorProps {
  props: Record<string, unknown> | undefined;
  onApply(props: Record<string, unknown>): void;
}

export function PropsEditor({ props, onApply }: PropsEditorProps) {
  const [text, setText] = useState(() => formatPropsJson(props));
  const [error, setError] = useState<string | null>(null);
  const lastApplied = useRef(text);
  const debounced = useDebounced(text, 450);

  useEffect(() => {
    if (debounced === lastApplied.current) return;
    const parsed = parsePropsJson(debounced);
    if (parsed.ok) {
      lastApplied.current = debounced;
      setError(null);
      onApply(parsed.props);
    } else {
      setError(parsed.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="props-editor">
      <textarea
        className="props-text mono"
        value={text}
        spellCheck={false}
        rows={4}
        placeholder={'{ "slides": [ { "id": 1, "src": "…" } ] }'}
        onChange={(e) => setText(e.target.value)}
        aria-label="Component props JSON"
      />
      <div className="props-foot">
        {error ? (
          <span className="props-error">
            <TriangleAlert size={11} /> {error}
          </span>
        ) : (
          <span className="faint">Props for this component — a JSON object.</span>
        )}
        <span className="spacer" />
        <button
          className="btn ghost small"
          disabled={text === "" && !props}
          onClick={() => {
            setText("");
            setError(null);
            lastApplied.current = "";
            onApply({});
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
