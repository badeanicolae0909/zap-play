import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";

/**
 * Invisible hotspot in the top-right corner.
 * Five quick taps (within 3s) opens the hidden admin sign-in route.
 */
export function SecretAdminEntry() {
  const nav = useNavigate();
  const taps = useRef<number[]>([]);

  function onTap() {
    const now = Date.now();
    taps.current = [...taps.current, now].filter((t) => now - t < 3000);
    if (taps.current.length >= 5) {
      taps.current = [];
      nav({ to: "/sys-access" });
    }
  }

  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      onClick={onTap}
      className="fixed right-0 top-0 z-[60] h-12 w-12 opacity-0"
      style={{ WebkitTapHighlightColor: "transparent" }}
    />
  );
}
