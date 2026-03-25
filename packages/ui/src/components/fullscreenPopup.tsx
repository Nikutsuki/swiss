import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "./utils"; // Assumes existing utility

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, className, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      className={cn(
        // Core structural reset and positioning
        "m-auto p-0 rounded-md outline-none",
        "bg-(--surface-container-low) text-(--on-surface)",
        "backdrop:bg-black/40 backdrop:backdrop-blur-sm",
        className
      )}
    >
      <div className="h-full p-6">
        {children}
      </div>
    </dialog>
  );
}