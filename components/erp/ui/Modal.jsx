"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, wide = false }) {
  const box = useRef(null);
  // The latest onClose without re-running the effect (parents pass a new arrow each render).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  // Esc closes; Tab stays inside the window; the first field is ready to type in; and
  // focus returns to the button that opened it.
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const timer = setTimeout(() => {
      const first = box.current?.querySelector("input:not([disabled]), select:not([disabled]), textarea:not([disabled])") || box.current?.querySelector(FOCUSABLE);
      first?.focus();
    }, 60);
    const onKey = (e) => {
      if (e.key === "Escape") return closeRef.current?.();
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (before && typeof before.focus === "function") before.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl ${
              wide ? "sm:max-w-3xl" : "sm:max-w-lg"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
