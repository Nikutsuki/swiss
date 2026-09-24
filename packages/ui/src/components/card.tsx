import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const cardVariants = cva(
  "rounded-md bg-(--surface-container-low) p-6",
  {
    variants: {
      variant: {
        primary: "bg-(--surface-container-low) text-(--on-surface)",
        ghost: "bg-transparent text-(--on-surface-variant)",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
);

export type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, className }))} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 
      className={cn("text-[clamp(1.35rem,2vw,1.8rem)] leading-tight tracking-[0.01em]", className)} 
      {...props} 
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn("mt-4 leading-[1.7] text-(--on-surface-variant)", className)} 
      {...props} 
    />
  );
}