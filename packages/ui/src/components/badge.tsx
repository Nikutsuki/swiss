import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-[0.69rem] font-medium uppercase tracking-[0.05em]",
  {
    variants: {
      variant: {
        neutral: "bg-(--surface-container-high) text-(--on-surface-variant)",
        success: "bg-(--security-emerald)/18 text-(--security-emerald)",
        error: "bg-[#ffb4ab]/15 text-[#ffb4ab]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
