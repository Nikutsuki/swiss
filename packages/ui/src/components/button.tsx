import {
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center tracking-[0.01em]",
    "transition-[transform,opacity,background-color,color] duration-150",
    "focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-[rgb(93_221_161/45%)]",
    "disabled:pointer-events-none disabled:opacity-60 cursor-pointer",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-white text-[#002112] shadow-[inset_0_0_0_999px_rgba(93,221,161,0.06)] hover:bg-(--security-emerald)",
        secondary:
          "bg-transparent text-(--on-surface) shadow-[inset_0_0_0_1px_rgba(71,71,71,0.2)] hover:bg-white/5",
        ghost: "bg-transparent text-(--on-surface) hover:bg-white/5",
        error:
          "bg-transparent text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.35)] hover:bg-[#ffb4ab]/10",
        fancy:
          "rounded-none bg-[#2f2f2f] text-[#5ddda1] border-l-4 border-t-0 border-r-0 border-b-0 border-[#5ddda1] hover:bg-[#393939] active:bg-[#404040] duration-300"
      },
      size: {
        sm: "h-10 px-4 text-xs",
        md: "h-12 px-5 text-sm",
        lg: "h-14 px-6 text-base",
      },
      bold: {
        true: "font-semibold",
        false: "font-normal",
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      bold: false,
    },
  }
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  bold,
  asChild = false,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, bold, className }));

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      ...props,
      className: cn(classes, child.props.className),
    });
  }

  return (
    <button
      type={type}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}