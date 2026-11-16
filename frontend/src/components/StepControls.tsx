interface Props {
  index: number;
  total: number;
  onChange: (index: number) => void;
}

export function StepControls({ index, total, onChange }: Props) {
  const last = total - 1;
  return (
    <div className="controls">
      <div className="buttons">
        <button type="button" onClick={() => onChange(0)} disabled={index === 0}>
          Reset
        </button>
        <button
          type="button"
          onClick={() => onChange(index - 1)}
          disabled={index === 0}
          aria-keyshortcuts="ArrowLeft"
        >
          Previous
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onChange(index + 1)}
          disabled={index >= last}
          aria-keyshortcuts="ArrowRight"
        >
          Next
        </button>
      </div>
      <label className="scrubber">
        <span>
          Step {index + 1} of {total}
        </span>
        <input
          type="range"
          min={0}
          max={last}
          value={index}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
