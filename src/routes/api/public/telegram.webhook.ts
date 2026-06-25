import { createFileRoute } from "@tanstack/react-router";

const APP_URL = "https://zap-play.lovable.app/";
const APP_PREVIEW_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b7741ec3-0103-44cf-b718-57572162e5c4/id-preview-19a7c342--1ebc2081-317e-4a81-bd11-364b6348756a.lovable.app-1779600280082.png";

async function tg(method: string, body: unknown, botToken: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Telegram API error: ${method} → ${res.status}`, await res.text());
  }
  return res;
}

// ── One-time bot setup —───────────────────────────────────────────────────────
let setupDone = false;
async function setupBot(botToken: string) {
  if (setupDone) return;
  setupDone = true;

  await Promise.allSettled([
    // Persistent "Open" button in the chat header (replaces the keyboard button)
    tg(
      "setChatMenuButton",
      {
        menu_button: {
          type: "web_app",
          text: "🎬 Open Reelx",
          web_app: { url: APP_URL },
        },
      },
      botToken,
    ),

    // Slash commands shown in the chat input menu
    tg(
      "setMyCommands",
      {
        commands: [
          { command: "start", description: "🔥 Launch the app and start watching" },
          { command: "help", description: "💡 Tips & how to use Reelx" },
          { command: "about", description: "🎥 What is Reelx?" },
        ],
      },
      botToken,
    ),
  ]);
}

// ── Message builders —─────────────────────────────────────────────────────────

function welcomePhoto(chatId: number) {
  return {
    chat_id: chatId,
    photo: APP_PREVIEW_IMAGE,
    caption:
      "<b>🎬 Welcome to Reelx</b>\n\n" +
      "Endless cinematic shorts. TikTok-style feed, premium quality.\n\n" +
      "<i>Tap the button below or use the menu button in the header ⬇️</i>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️  Start Watching Now", web_app: { url: APP_URL } }],
        [
          { text: "🔍 Explore Creators", url: `${APP_URL}search` },
          { text: "⭐ Saved Videos", url: `${APP_URL}saved` },
        ],
        [
          { text: "📖  How It Works", callback_data: "help" },
          { text: "ℹ️  About Reelx", callback_data: "about" },
        ],
      ],
    },
  } as const;
}

function helpMessage(chatId: number) {
  return {
    chat_id: chatId,
    text:
      "<b>💡 How to Use Reelx</b>\n\n" +
      "<b>📱 Swipe up/down</b> — scroll through endless videos\n" +
      "<b>👆 Tap</b> — pause / play\n" +
      "<b>❤️ Double-tap</b> — like a video\n" +
      "<b>👈👉 Hold sides</b> — fast-forward / rewind\n" +
      "<b>🔇 Tap speaker</b> — mute / unmute\n" +
      "<b>🔖 Bookmark</b> — save for later\n\n" +
      "<i>Works inside Telegram as a Mini App. No downloads needed.</i>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️  Open Reelx", web_app: { url: APP_URL } }],
      ],
    },
  } as const;
}

function aboutMessage(chatId: number) {
  return {
    chat_id: chatId,
    text:
      "<b>🎥 Reelx — Cinematic Shorts</b>\n\n" +
      "Reelx is a premium short-video feed built for creators.\n\n" +
      "<b>✨ Features</b>\n" +
      "• Endless scroll feed (TikTok-style)\n" +
      "• Cinematic quality curation\n" +
      "• Gesture controls (tap, hold, swipe)\n" +
      "• Creator profiles & discovery\n" +
      "• Save favorites & build collections\n" +
      "• Works as a Telegram Mini App\n\n" +
      "<i>Built with ❤️ for video lovers.</i>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀  Launch App", web_app: { url: APP_URL } }],
      ],
    },
  } as const;
}

// ── Webhook route —────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
          console.error("Telegram webhook: BOT_TOKEN env var not set");
          return new Response("ok");
        }

        try {
          const update = await request.json();
          const msg = update.message ?? update.edited_message;
          const chatId: number | undefined = msg?.chat?.id;
          const text: string = msg?.text ?? "";

          // Callback queries from inline keyboard buttons (help/about)
          const cb = update.callback_query;
          if (cb?.message?.chat?.id) {
            const cbChatId = cb.message.chat.id;
            const data = cb.data;

            // Acknowledge the callback
            await tg("answerCallbackQuery", { callback_query_id: cb.id }, botToken);

            if (data === "help") {
              await tg("sendMessage", helpMessage(cbChatId), botToken);
            } else if (data === "about") {
              await tg("sendMessage", aboutMessage(cbChatId), botToken);
            }
            return new Response("ok");
          }

          if (!chatId) return new Response("ok");

          await setupBot(botToken);

          if (text.startsWith("/start")) {
            await tg("sendPhoto", welcomePhoto(chatId), botToken);
          } else if (text.startsWith("/help")) {
            await tg("sendMessage", helpMessage(chatId), botToken);
          } else if (text.startsWith("/about")) {
            await tg("sendMessage", aboutMessage(chatId), botToken);
          }
        } catch (e) {
          console.error("tg webhook error", e);
        }

        return new Response("ok");
      },
    },
  },
});
