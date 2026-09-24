import type { SelectHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const selectVariants = cva(
  [
    "w-full bg-(--surface-container-lowest) text-(--on-surface)",
    "ring-0 ring-(--security-emerald) rounded-xs",
    "focus:ring-2",
    "outline-0",
    "transition-all duration-200",
    "appearance-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ],
  {
    variants: {
      variant: {
        primary: "bg-(--surface-container-lowest)",
        ghost: "bg-transparent border border-(--outline-variant)",
      },
      size: {
        sm: "h-9 px-3 pr-10 text-xs",
        md: "h-11 px-4 pr-10 text-sm",
        lg: "h-12 px-4 pr-10 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> &
  VariantProps<typeof selectVariants> & {
    title?: string;
    options?: SelectOption[];
  };

export function Select({
  className,
  title,
  variant,
  size,
  options,
  children,
  ...props
}: SelectProps) {
  return (
    <div className="flex flex-col gap-2">
      {title && <label className="text-sm font-medium">{title}</label>}
      <div className="relative">
        <select
          className={cn(selectVariants({ variant, size }), className)}
          {...props}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <span
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-(--on-surface-variant)"
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 10L12 15L17 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}