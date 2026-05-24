import { createFileRoute } from "@tanstack/react-router";

const BOT_TOKEN = "8705337450:AAFHrgtCMyt-iTXaaoK6pwASq3T2kxs6tpc";
const APP_URL = "https://zap-play.lovable.app/";

async function tg(method: string, body: unknown) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const update = await request.json();
          const msg = update.message ?? update.edited_message;
          const chatId = msg?.chat?.id;
          const text: string = msg?.text ?? "";

          if (chatId && text.startsWith("/start")) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: "🎬 Welcome to Reelx — endless cinematic shorts.\n\nTap below to start watching:",
              reply_markup: {
                inline_keyboard: [[
                  { text: "▶️  Open Reelx", web_app: { url: APP_URL } },
                ]],
              },
            });
          }
        } catch (e) {
          console.error("tg webhook error", e);
        }
        return new Response("ok");
      },
    },
  },
});
