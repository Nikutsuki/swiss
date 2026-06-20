"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const cx = (...tokens: Array<string | false | null | undefined>) => tokens.filter(Boolean).join(" ");

export type DropdownOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

interface AnimatedDropdownProps<T extends string = string> {
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
  triggerClassName?: string;
  listClassName?: string;
  compact?: boolean;
}

export function AnimatedDropdown<T extends string = string>({
  options,
  value,
  onChange,
  label,
  className,
  triggerClassName,
  listClassName,
  compact = false,
}: AnimatedDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const triggerHeight = compact ? "h-8" : "h-10";
  const triggerPadding = compact ? "px-2.5" : "px-3";
  const triggerText = compact ? "text-xs" : "text-sm";

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      {label && <div className="mb-1 text-[10px] uppercase tracking-wider text-(--on-surface-variant)">{label}</div>}
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "group w-full rounded-md border border-(--outline-variant)/30 bg-(--surface-container-high) text-left transition-all duration-200 hover:border-(--security-emerald)/40 hover:bg-(--surface-container-highest) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--security-emerald)/60",
          triggerHeight,
          triggerPadding,
          triggerText,
          "flex items-center justify-between gap-2",
          triggerClassName,
        )}
      >
        <span className="truncate text-(--on-surface)">{selectedOption?.label ?? "Select"}</span>
        <ChevronDown
          className={cx(
            "h-4 w-4 text-(--on-surface-variant) transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        id={listId}
        role="listbox"
        aria-labelledby={buttonId}
        className={cx(
          "absolute z-40 mt-1.5 w-full origin-top overflow-hidden rounded-md border border-(--outline-variant)/30 bg-(--surface-container-high) shadow-lg shadow-black/30 transition-all duration-200",
          open
            ? "pointer-events-auto translate-y-0 scale-y-100 opacity-100 max-h-72"
            : "pointer-events-none -translate-y-1 scale-y-95 opacity-0 max-h-0",
          listClassName,
        )}
      >
        <div className="max-h-72 overflow-y-auto p-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cx(
                  "w-full rounded px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-(--security-emerald)/20 text-(--on-surface)"
                    : "text-(--on-surface-variant) hover:bg-white/5 hover:text-(--on-surface)",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("truncate", compact ? "text-xs" : "text-sm")}>{option.label}</span>
                  <Check className={cx("h-4 w-4 shrink-0 text-(--security-emerald)", active ? "opacity-100" : "opacity-0")} />
                </div>
                {option.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-(--on-surface-variant)/80">
                    {option.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
