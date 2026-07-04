import type { KeyboardEvent } from "react";

interface EditableClockValueProps {
  disabled: boolean;
  label: string;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}

function formattedValue(value: number) {
  return String(value).padStart(2, "0");
}

export function EditableClockValue({
  disabled,
  label,
  max,
  min = 0,
  onChange,
  value,
}: EditableClockValueProps) {
  function commit(element: HTMLElement) {
    const nextValue = Number(element.textContent);
    if (!Number.isInteger(nextValue) || nextValue < min || nextValue > max) {
      element.textContent = formattedValue(value);
      return;
    }
    onChange(nextValue);
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (disabled) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onChange(Math.min(max, Math.max(min, value + direction)));
      return;
    }
    if (
      event.key.length === 1 &&
      !/^\d$/.test(event.key) &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
    }
  }

  return (
    <span
      role="spinbutton"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      contentEditable={!disabled}
      suppressContentEditableWarning
      inputMode="numeric"
      className={`editable-clock-value ${disabled ? "is-locked" : ""}`}
      title={disabled ? undefined : `Select the ${label.toLowerCase()} and type a value`}
      onBlur={(event) => commit(event.currentTarget)}
      onFocus={(event) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(event.currentTarget);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }}
      onKeyDown={onKeyDown}
    >
      {formattedValue(value)}
    </span>
  );
}
