import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";

/**
 * Multi-select popover for choosing the columns shown in the leads table.
 * At least one data column must remain enabled; the Actions column is always
 * present and is intentionally not part of this selector.
 */
export default function TableFieldSelector({
  fields,
  visibleFields,
  onToggle,
  onReset,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = new Set(visibleFields);

  return (
    <div className="app-field-selector" ref={rootRef}>
      <button
        type="button"
        className={`app-field-selector-trigger${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span>Display fields</span>
        <em>{visibleFields.length}</em>
        <ChevronDown size={13} className={open ? "open" : ""} aria-hidden="true" />
      </button>

      {open && (
        <div className="app-field-selector-menu" role="dialog" aria-label="Choose table fields">
          <div className="app-field-selector-head">
            <div>
              <strong>Table fields</strong>
              <small>Choose what appears in list view</small>
            </div>
            <button type="button" onClick={onReset} title="Restore default fields">
              <RotateCcw size={12} aria-hidden="true" />
              Default
            </button>
          </div>

          <div className="app-field-selector-options">
            {fields.map((field) => {
              const checked = selected.has(field.id);
              const isLastSelected = checked && visibleFields.length === 1;
              return (
                <label
                  key={field.id}
                  className={`app-field-selector-option${checked ? " selected" : ""}${
                    isLastSelected ? " locked" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isLastSelected}
                    onChange={() => onToggle(field.id)}
                  />
                  <span>
                    <strong>{field.label}</strong>
                    {field.description && <small>{field.description}</small>}
                  </span>
                </label>
              );
            })}
          </div>

          <p className="app-field-selector-note">
            Your selection is saved on this device. Actions always remain visible.
          </p>
        </div>
      )}
    </div>
  );
}
