import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

type EditorInstance = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];
type Decorations = ReturnType<EditorInstance["createDecorationsCollection"]>;

interface Props {
  code: string;
  onChange: (code: string) => void;
  /** Line about to run at the current step, or null when nothing is traced. */
  currentLine: number | null;
  errorLines: number[];
}

// The code sits on a dark "film"; the current line is the exposed spot.
const defineFilmTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("xray-film", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6A8A9C", fontStyle: "italic" },
      { token: "keyword", foreground: "8FCBE0" },
      { token: "string", foreground: "BCD9C5" },
      { token: "number", foreground: "E6CB92" },
    ],
    colors: {
      "editor.background": "#12283A",
      "editorGutter.background": "#12283A",
      "editor.foreground": "#DCE6EA",
      "editorLineNumber.foreground": "#4F6E82",
      "editorLineNumber.activeForeground": "#A9C6D3",
      "editor.lineHighlightBackground": "#00000000",
      "editor.selectionBackground": "#2E5470",
      "editorCursor.foreground": "#7FD3E6",
    },
  });
};

export function CodeFilm({ code, onChange, currentLine, errorLines }: Props) {
  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const decorationsRef = useRef<Decorations | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection([]);
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const decorations = decorationsRef.current;
    if (!editor || !monaco || !decorations) return;

    const lineRange = (line: number) => new monaco.Range(line, 1, line, 1);
    const items = errorLines.map((line) => ({
      range: lineRange(line),
      options: { isWholeLine: true, className: "film-error-line" },
    }));
    if (currentLine !== null && currentLine > 0) {
      items.push({
        range: lineRange(currentLine),
        options: {
          isWholeLine: true,
          className: "film-current-line",
          linesDecorationsClassName: "film-current-gutter",
        } as (typeof items)[number]["options"],
      });
      editor.revealLineInCenterIfOutsideViewport(currentLine);
    }
    decorations.set(items);
  }, [currentLine, errorLines]);

  return (
    <div className="film" aria-label="Code editor">
      <Editor
        height="100%"
        language="python"
        theme="xray-film"
        value={code}
        beforeMount={defineFilmTheme}
        onMount={handleMount}
        onChange={(value) => onChange(value ?? "")}
        loading={<p className="film-loading">Loading editor</p>}
        options={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 15,
          lineHeight: 24,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: "none",
          lineNumbersMinChars: 3,
          padding: { top: 16, bottom: 16 },
          tabSize: 4,
          automaticLayout: true,
          overviewRulerLanes: 0,
        }}
      />
    </div>
  );
}
