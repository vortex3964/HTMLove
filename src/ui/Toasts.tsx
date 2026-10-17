/**
 * Toasts — a tiny feedback stack with no context: call `toast("Saved")`
 * from anywhere and the mounted <Toasts /> picks it up.
 */
import { useEffect, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";

export type ToastTone = "ok" | "warn" | "bad";

export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

type Listener = (item: ToastItem) => void;

let listener: Listener | null = null;
let nextId = 1;

/** Show a short message in the bottom-right stack. */
export function toast(text: string, tone: ToastTone = "ok"): void {
  listener?.({ id: nextId++, text, tone });
}

const LIFETIME = 3000;

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (item) => {
      setItems((prev) => [...prev.slice(-3), item]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, LIFETIME);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.tone}`}>
          {item.tone === "ok" ? <Check size={13} /> : <TriangleAlert size={13} />}
          <span className="toast-text">{item.text}</span>
          <button
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
