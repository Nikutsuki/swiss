import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const inputVariants = cva(
  [
    "w-full bg-(--surface-container-lowest) text-(--on-surface)",
    "ring-0 ring-(--security-emerald) rounded-xs",
    "focus:ring-2",
    "outline-0",
    "transition-all duration-200",
  ],
  {
    variants: {
      variant: {
        primary: "bg-(--surface-container-lowest)",
        ghost: "bg-transparent border border-(--outline-variant)",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-4 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    }
  }
);

const textareaVariants = cva(
  [
    "w-full cursor-text text-(--on-surface)",
    "font-[family-name:var(--font-inter),ui-sans-serif,sans-serif]",
    "text-sm leading-relaxed",
    "ring-0 ring-(--security-emerald) rounded-xs",
    "focus:ring-2",
    "outline-0 focus-visible:outline-none",
    "transition-all duration-200",
    "resize-y",
  ],
  {
    variants: {
      variant: {
        primary: "bg-(--surface-container-lowest)",
        ghost: "bg-transparent border border-(--outline-variant)",
      },
      size: {
        sm: "px-3 py-3 text-xs",
        md: "px-6 py-6 text-sm",
        lg: "px-8 py-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  VariantProps<typeof inputVariants>;

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "size"
> &
  VariantProps<typeof textareaVariants>;

export function Input({ className, title, variant, size, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-2">
      {title && <label className="text-sm font-medium">{title}</label>}
      <input
        className={cn(inputVariants({ variant, size }), className)}
        {...props}
      />
    </div>
  )
}

export function Textarea({
  className,
  title,
  variant,
  size,
  ...props
}: TextareaProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      {title && <label className="text-sm font-medium">{title}</label>}
      <textarea
        className={cn(textareaVariants({ variant, size }), className)}
        {...props}
      />
    </div>
  )
}