/**
 * CodeEditor — a CodeMirror 6 wrapper, light theme, mono, line wrapping.
 * Re-created when the language changes; external value changes are
 * dispatched into the existing document so the cursor survives.
 */
import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { javascript as jsLang } from "@codemirror/lang-javascript";

export type EditorLanguage = "html" | "css" | "javascript";

function languageExtension(language: EditorLanguage) {
  switch (language) {
    case "css":
      return cssLang();
    case "javascript":
      return jsLang({ jsx: true, typescript: true });
    default:
      return htmlLang();
  }
}

const lightTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12.5px",
    backgroundColor: "#ffffff",
  },
  ".cm-scroller": {
    fontFamily: "var(--mono)",
    lineHeight: "1.55",
    overflow: "auto",
  },
  ".cm-content": { caretColor: "#4f46e5" },
  ".cm-gutters": {
    backgroundColor: "#fbfbfc",
    borderRight: "1px solid #e6e6ea",
    color: "#a1a1aa",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-activeLine": { backgroundColor: "#f6f6f9" },
  ".cm-activeLineGutter": { backgroundColor: "#f1f1f4" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#dfe3ff",
  },
});

export function CodeEditor({
  value,
  language,
  onChange,
  ariaLabel,
}: {
  value: string;
  language: EditorLanguage;
  onChange(next: string): void;
  ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          languageExtension(language),
          EditorView.lineWrapping,
          lightTheme,
          EditorView.contentAttributes.of(ariaLabel ? { "aria-label": ariaLabel } : {}),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // the initial value is intentionally read once per language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value, language]);

  return <div className="editor-host" ref={hostRef} />;
}
