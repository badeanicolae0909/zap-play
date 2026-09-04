import { useEffect } from "react";
import { useRouter, useLocation } from "@tanstack/react-router";
import { getTelegram } from "@/lib/telegram";

/**
 * Maps the Telegram back button (and the Android hardware back button,
 * which Telegram routes to it while visible) to in-app history navigation.
 * Hidden on the feed root, where back should close the mini app.
 */
export function TelegramBackButton() {
  const router = useRouter();
  const { pathname } = useLocation();
  const isRoot = pathname === "/";

  useEffect(() => {
    const tg = getTelegram();
    const back = tg?.BackButton;
    if (!back) return;

    const onBack = () => {
      if (window.history.length > 1) router.history.back();
      else router.navigate({ to: "/" });
    };

    back.onClick(onBack);
    if (isRoot) back.hide();
    else back.show();

    return () => {
      back.offClick(onBack);
    };
  }, [isRoot, router]);

  return null;
}
