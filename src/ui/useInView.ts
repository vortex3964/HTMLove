/**
 * useInView — mount expensive children (live previews) only when they
 * come close to the viewport. Falls back to "always in view" when
 * IntersectionObserver is unavailable.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

export function useInView<T extends Element>(
  rootMargin = "640px",
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
