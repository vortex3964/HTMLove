/**
 * useDebounced — delay propagating a fast-changing value (used to keep
 * live previews calm while typing).
 */
import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
