import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { timesLabel, type LineHeat } from "../heatmap";

type EditorInstance = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];
type Decorations = ReturnType<EditorInstance["createDecorationsCollection"]>;
type DecorationList = Parameters<Decorations["set"]>[0][number][];

interface Props {
  code: string;
  onChange: (code: string) => void;
  /** Line about to run at the current step, or null when nothing is traced. */
  currentLine: number | null;
  errorLines: number[];
  /** Per-line execution heat, or null when the heatmap is off. */
  heat: LineHeat[] | null;
}

// The code sits on a dark "film"; the current line is the exposed spot.
// Monaco cannot read CSS variables, so these hex values copy the Radiograph
// tokens in docs/design.md (--surface, --text, --text-faint, --text-muted,
// --accent). Keep them in sync with styles.css.
const defineFilmTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("xray-film", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7894A5", fontStyle: "italic" },
      { token: "keyword", foreground: "8FCBE0" },
      { token: "string", foreground: "BCD9C5" },
      { token: "number", foreground: "E6CB92" },
    ],
    colors: {
      "editor.background": "#111F2B",
      "editorGutter.background": "#111F2B",
      "editor.foreground": "#DCE7EC",
      "editorLineNumber.foreground": "#6A8A9C",
      "editorLineNumber.activeForeground": "#8BA3B1",
      "editor.lineHighlightBackground": "#00000000",
      "editor.selectionBackground": "#2B4A60",
      "editorCursor.foreground": "#7FD3E6",
      // Plain brackets: rainbow bracket colors are outside the palette.
      "editorBracketHighlight.foreground1": "#DCE7EC",
      "editorBracketHighlight.foreground2": "#DCE7EC",
      "editorBracketHighlight.foreground3": "#DCE7EC",
      "editorBracketHighlight.foreground4": "#DCE7EC",
      "editorBracketHighlight.foreground5": "#DCE7EC",
      "editorBracketHighlight.foreground6": "#DCE7EC",
    },
  });
};

export function CodeFilm({
  code,
  onChange,
  currentLine,
  errorLines,
  heat,
}: Props) {
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
    const model = editor?.getModel();
    if (!editor || !monaco || !decorations || !model) return;

    const lineCount = model.getLineCount();
    const inRange = (line: number) => line >= 1 && line <= lineCount;
    // Span the whole text of the line so hovering anywhere on it works.
    const lineRange = (line: number) =>
      new monaco.Range(line, 1, line, model.getLineMaxColumn(line));
    const items: DecorationList = [];

    // Heat goes first so the current-line glow is drawn above it.
    for (const { line, count, level } of heat ?? []) {
      if (!inRange(line)) continue;
      items.push({
        range: lineRange(line),
        options: {
          isWholeLine: true,
          className: `film-heat-${level}`,
          hoverMessage: { value: `Line ${line} ran ${timesLabel(count)}` },
        },
      });
    }
    for (const line of errorLines.filter(inRange)) {
      items.push({
        range: lineRange(line),
        options: { isWholeLine: true, className: "film-error-line" },
      });
    }
    if (currentLine !== null && inRange(currentLine)) {
      items.push({
        range: lineRange(currentLine),
        options: {
          isWholeLine: true,
          className: "film-current-line",
          linesDecorationsClassName: "film-current-gutter",
        },
      });
      editor.revealLineInCenterIfOutsideViewport(currentLine);
    }
    decorations.set(items);
  }, [currentLine, errorLines, heat]);

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
