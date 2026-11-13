import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function CreatorScrollReset() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    // Reset page navigation, not tool state changes or explicit anchor links.
    if (!pathname.startsWith("/creator/") || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);
  return null;
}
