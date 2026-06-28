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
    console.error(`TG API ${method} → ${res.status}`, await res.text());
  }
  return res;
}

// ── One-time bot profile setup ────────────────────────────────────────────────
let setupDone = false;
async function setupBot(botToken: string) {
  if (setupDone) return;
  setupDone = true;

  await Promise.allSettled([
    // Chat header: persistent "Open App" button
    tg(
      "setChatMenuButton",
      {
        menu_button: { type: "web_app", text: "🎬 Open Reelx", web_app: { url: APP_URL } },
      },
      botToken,
    ),

    // Slash commands
    tg(
      "setMyCommands",
      {
        commands: [
          { command: "start", description: "🔥 Launch the app" },
          { command: "help", description: "💡 Tips & gestures" },
          { command: "about", description: "🎥 About Reelx" },
        ],
      },
      botToken,
    ),

    // Bot display name (shown in chat list header)
    tg("setMyName", { name: "Reelx" }, botToken),

    // Short description (shown at top of bot profile)
    tg(
      "setMyShortDescription",
      { short_description: "Endless cinematic shorts. TikTok-style feed inside Telegram. No app needed." },
      botToken,
    ),

    // Full description (shown in bot info)
    tg(
      "setMyDescription",
      {
        description:
          "🎬 Endless cinematic short videos inside Telegram.\n\n" +
          "✨ Swipe through a curated feed of premium content.\n" +
          "❤️ Like, save, and discover new creators.\n" +
          "📱 Pure TikTok-style experience — no downloads.",
      },
      botToken,
    ),

    // Bot profile photo
    tg("setMyDescriptionPhoto", {}, botToken).catch(() => {}),
  ]);
}

// ── Welcome flow: 3 premium messages in sequence ─────────────────────────────

function msgWelcomePhoto(chatId: number) {
  return {
    chat_id: chatId,
    photo: APP_PREVIEW_IMAGE,
    caption:
      "<b>🎬 Welcome to Reelx</b>\n\n" +
      "<i>Endless cinematic shorts. Pure TikTok magic.</i>\n\n" +
      "<b>━━ Now available as a Telegram Mini App ━━</b>\n" +
      "No downloads. No accounts. Just tap & watch.",
    parse_mode: "HTML" as const,
  };
}

function msgFeatures(chatId: number) {
  return {
    chat_id: chatId,
    text:
      "<b>What you can do:</b>\n\n" +
      "📱  <b>Swipe</b> — endless vertical feed\n" +
      "❤️  <b>Double-tap</b> — like videos\n" +
      "🔖  <b>Bookmark</b> — save favorites\n" +
      "⚡  <b>Hold sides</b> — fast-forward / rewind\n" +
      "🔍  <b>Discover</b> — browse creators\n\n" +
      "<i>Swipe up to start ⬆️</i>",
    parse_mode: "HTML" as const,
  };
}

function msgLaunch(chatId: number) {
  return {
    chat_id: chatId,
    text: "<b>👇 Ready? Hit the button below to dive in.</b>",
    parse_mode: "HTML" as const,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "▶️  START WATCHING NOW", web_app: { url: APP_URL } },
        ],
        [
          { text: "🔍 Explore Creators", web_app: { url: `${APP_URL}search` } },
          { text: "⭐ Saved Videos", web_app: { url: `${APP_URL}saved` } },
        ],
      ],
    },
  } as const;
}

// ── Help & About ─────────────────────────────────────────────────────────────

function msgHelp(chatId: number) {
  return {
    chat_id: chatId,
    text:
      "<b>💡 How to Use Reelx</b>\n\n" +
      "<b>📱 Swipe up/down</b> — scroll through endless videos\n" +
      "<b>👆 Tap</b> — pause / play any video\n" +
      "<b>❤️ Double-tap</b> — like a video instantly\n" +
      "<b>👈👉 Hold sides</b> — fast-forward / rewind (speed ramps up)\n" +
      "<b>🔇 Tap speaker</b> — mute / unmute\n" +
      "<b>🔖 Bookmark</b> — save for later\n" +
      "<b>📊 Scrub bar</b> — drag to jump anywhere\n\n" +
      "<i>Everything works inside Telegram. No downloads, no accounts required.</i>",
    parse_mode: "HTML" as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️  Open Reelx", web_app: { url: APP_URL } }],
      ],
    },
  } as const;
}

function msgAbout(chatId: number) {
  return {
    chat_id: chatId,
    text:
      "<b>🎥 Reelx — Cinematic Shorts</b>\n\n" +
      "A premium short-video platform built as a Telegram Mini App.\n\n" +
      "<b>Why Reelx?</b>\n" +
      "🏆  Curated cinematic quality\n" +
      "⚡  Instant — no downloads\n" +
      "🔒  Privacy-first — no tracking\n" +
      "🎯  Gesture-driven (hold to seek!)\n" +
      "👥  Creator profiles & discovery\n" +
      "💾  Save & build collections\n\n" +
      "<i>Built with obsession for video lovers.</i>",
    parse_mode: "HTML" as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀  Launch App", web_app: { url: APP_URL } }],
      ],
    },
  } as const;
}

// ── Webhook handler ──────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.BOT_TOKEN || process.env.VITE_BOT_TOKEN;
        if (!botToken) {
          console.error("TG webhook: BOT_TOKEN not set in env");
          return new Response("ok");
        }

        try {
          const update = await request.json();
          const msg = update.message ?? update.edited_message;
          const chatId: number | undefined = msg?.chat?.id;
          const text: string = (msg?.text ?? "").split(" ")[0];

          // ── Callback queries (inline button taps) ──
          const cb = update.callback_query;
          if (cb?.message?.chat?.id) {
            const cid = cb.message.chat.id;
            const data = cb.data;
            await tg("answerCallbackQuery", { callback_query_id: cb.id }, botToken);
            if (data === "help") await tg("sendMessage", msgHelp(cid), botToken);
            if (data === "about") await tg("sendMessage", msgAbout(cid), botToken);
            return new Response("ok");
          }

          if (!chatId) return new Response("ok");

          // Always run setup on first interaction
          await setupBot(botToken);

          if (text === "/start") {
            // Send 3 messages in sequence for maximum visual impact
            await tg("sendPhoto", msgWelcomePhoto(chatId), botToken);
            // Small delay so messages appear in order (Telegram API processes async)
            await tg("sendMessage", msgFeatures(chatId), botToken);
            await tg("sendMessage", msgLaunch(chatId), botToken);
          } else if (text === "/help") {
            await tg("sendMessage", msgHelp(chatId), botToken);
          } else if (text === "/about") {
            await tg("sendMessage", msgAbout(chatId), botToken);
          }
        } catch (e) {
          console.error("TG webhook error", e);
        }

        return new Response("ok");
      },
    },
  },
});
