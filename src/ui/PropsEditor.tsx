/**
 * PropsEditor — the small JSON editor behind the {} button in a panel
 * header. Applies as you type (debounced); invalid JSON is pointed at
 * and simply not applied. "Sample props" reads the component's own TS
 * types and writes starter JSON.
 */
import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { formatPropsJson, parsePropsJson } from "../core/board";
import { sampleProps } from "../core/propsSample";
import { useDebounced } from "./useDebounced";

interface PropsEditorProps {
  props: Record<string, unknown> | undefined;
  /** The component's source, for the sample-props button. */
  source?: string;
  onApply(props: Record<string, unknown>): void;
}

export function PropsEditor({ props, source, onApply }: PropsEditorProps) {
  const [text, setText] = useState(() => formatPropsJson(props));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
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

  const createSample = () => {
    if (!source) return;
    const sample = sampleProps(source);
    if (Object.keys(sample.props).length === 0) {
      setNote(null);
      setError("Could not read any props from this component's types.");
      return;
    }
    setError(null);
    setNote(
      sample.skipped.length > 0
        ? `Could not sample: ${sample.skipped.join(", ")} — fill those in yourself.`
        : null,
    );
    setText(JSON.stringify(sample.props, null, 2));
  };

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
        ) : note ? (
          <span className="faint">{note}</span>
        ) : (
          <span className="faint">
            Props are JSON — strings like <code>(item) =&gt; item.title</code> become functions.
          </span>
        )}
        <span className="spacer" />
        <button
          className="btn ghost small"
          disabled={!source}
          onClick={createSample}
          title="Write starter JSON from this component's TypeScript types"
        >
          Sample props
        </button>
        <button
          className="btn ghost small"
          disabled={text === "" && !props}
          onClick={() => {
            setText("");
            setError(null);
            setNote(null);
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
