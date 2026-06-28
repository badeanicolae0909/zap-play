// Setup script for Telegram bot webhook
// Usage: node scripts/setup-bot.mjs
// Requires BOT_TOKEN in .env or .dev.vars

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv(path) {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+)="?(.+?)"?\s*$/);
      if (match) process.env[match[1]] = match[2];
    }
  } catch {}
}

// Load from .dev.vars (Cloudflare Workers local) or .env
loadEnv(resolve(root, ".dev.vars"));
loadEnv(resolve(root, ".env"));

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not found in .dev.vars or .env");
  console.error("   Add: BOT_TOKEN=\"your-token-from-botfather\"");
  process.exit(1);
}

// Determine webhook URL — default to lovable.app deployment
const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "https://zap-play.lovable.app/api/public/telegram/webhook";

async function main() {
  console.log("🔧 Setting up Reelx Telegram bot...\n");

  const api = (method, body) =>
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  // 1. Set webhook
  console.log(`📡 Setting webhook → ${WEBHOOK_URL}`);
  const wh = await api("setWebhook", { url: WEBHOOK_URL });
  console.log(wh.ok ? "   ✅ Webhook set" : `   ❌ ${JSON.stringify(wh)}`);

  // 2. Delete webhook first if needed, then set again (force refresh)
  if (!wh.ok) {
    console.log("   Retrying with drop_pending_updates...");
    const wh2 = await api("setWebhook", {
      url: WEBHOOK_URL,
      drop_pending_updates: true,
    });
    console.log(wh2.ok ? "   ✅ Webhook set (cleaned)" : `   ❌ ${JSON.stringify(wh2)}`);
  }

  // 3. Set bot profile
  console.log("\n📝 Configuring bot profile...");
  const profile = await Promise.allSettled([
    api("setMyName", { name: "Reelx" }),
    api("setMyShortDescription", {
      short_description:
        "Endless cinematic shorts. TikTok-style feed inside Telegram. No app needed.",
    }),
    api("setMyDescription", {
      description:
        "🎬 Endless cinematic short videos inside Telegram.\n\n" +
        "✨ Swipe through a curated feed of premium content.\n" +
        "❤️ Like, save, and discover new creators.\n" +
        "📱 Pure TikTok-style experience — no downloads.",
    }),
    api("setMyCommands", {
      commands: [
        { command: "start", description: "🔥 Launch the app" },
        { command: "help", description: "💡 Tips & gestures" },
        { command: "about", description: "🎥 About Reelx" },
      ],
    }),
    api("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "🎬 Open Reelx",
        web_app: { url: "https://zap-play.lovable.app/" },
      },
    }),
  ]);
  let ok = 0;
  for (const r of profile) {
    if (r.status === "fulfilled" && r.value?.ok) ok++;
  }
  console.log(`   ✅ ${ok}/5 profile settings applied`);

  // 4. Verify
  console.log("\n🔍 Verifying...");
  const info = await api("getWebhookInfo", {});
  console.log(`   Webhook URL: ${info.result?.url ?? "NOT SET"}`);
  console.log(
    `   Pending updates: ${info.result?.pending_update_count ?? "?"}`
  );

  console.log("\n✅ Done! Your bot is ready.\n");
  console.log("   Try it: t.me/" + (process.env.BOT_USERNAME || "your_bot"));
}

main().catch((e) => {
  console.error("\n❌ Setup failed:", e.message);
  process.exit(1);
});
