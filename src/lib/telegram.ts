// Telegram Mini App SDK wrapper
type TGUser = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
type TGWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: { user?: TGUser };
  colorScheme: "light" | "dark";
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window { Telegram?: { WebApp?: TGWebApp } }
}

export function getTelegram(): TGWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram() {
  const tg = getTelegram();
  if (!tg) return null;
  try {
    tg.ready();
    tg.expand();
    tg.setBackgroundColor?.("#15101f");
    tg.setHeaderColor?.("#15101f");
  } catch {}
  return tg;
}

export function haptic(type: "light" | "medium" | "heavy" = "light") {
  const tg = getTelegram();
  tg?.HapticFeedback?.impactOccurred(type);
}

export function hapticSuccess() {
  getTelegram()?.HapticFeedback?.notificationOccurred("success");
}
