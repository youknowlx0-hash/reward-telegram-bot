const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ====== CONFIG ======

// Channels for force join
const CHANNELS = [
  "@Shein_Reward",
  "@earnmoneysupport1",
  "@GlobalTaskWorks",
  "@Manish_Looterss"
];

const REDEEM_RULES = {
  500: { points: 5, refer: 3 },
  1000: { points: 10, refer: 6 },
  2000: { points: 20, refer: 8 },
  4000: { points: 40, refer: 15 }
};

// ====== DATABASE (memory) ======
let users = {};
let coupons = { 500: [], 1000: [], 2000: [], 4000: [] };
let admins = [7702942505];
let adminState = {};
let stats = { redeemed: 0 };

// ====== HELPERS ======

function isAdmin(id) {
  return admins.includes(id);
}

function getUser(id) {
  if (!users[id]) {
    users[id] = { points: 0, refer: 0, referredBy: null };
  }
  return users[id];
}

async function checkJoin(ctx) {
  for (let ch of CHANNELS) {
    try {
      const res = await ctx.telegram.getChatMember(ch, ctx.from.id);
      if (["left", "kicked"].includes(res.status)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function joinButtons() {
  return Markup.inlineKeyboard([
    ...CHANNELS.map((ch) =>
      [Markup.button.url(`Join ${ch}`, `https://t.me/${ch.replace("@", "")}`)]
    ),
    [Markup.button.callback("✅ I Joined", "check_join")]
  ]);
}

// ====== START ======
bot.start(async (ctx) => {
  const id = ctx.from.id;
  getUser(id);

  const ref = ctx.startPayload;
  if (ref && ref !== id.toString()) {
    const refUser = getUser(ref);
    refUser.points += 1;
    refUser.refer += 1;
  }

  if (!(await checkJoin(ctx))) {
    return ctx.reply("🔒 Please join all channels first", joinButtons());
  }

  ctx.reply(
    "✅ Welcome! Use Menu 👇",
    Markup.keyboard([
      ["👤 Profile", "🎁 Redeem"],
      ["📊 Stats", "❓ Help"]
    ]).resize()
  );
});

// ====== JOIN CHECK ======
bot.action("check_join", async (ctx) => {
  if (await checkJoin(ctx)) {
    await ctx.editMessageText("✅ Verified! Use Menu below.");
    ctx.reply("👇 Menu", Markup.keyboard([
      ["👤 Profile", "🎁 Redeem"],
      ["📊 Stats", "❓ Help"]
    ]).resize());
  } else {
    ctx.answerCbQuery("❌ Still not joined all channels");
  }
});

// ====== USER COMMANDS ======

bot.hears("👤 Profile", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(
    `👤 Profile\n\n💎 Points: ${u.points}\n👥 Referrals: ${u.refer}\n\n🔥 Your Link:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`
  );
});

bot.hears("🎁 Redeem", (ctx) => {
  let text = "🎁 Redeem Options:\n\n";
  for (const amt in REDEEM_RULES) {
    const r = REDEEM_RULES[amt];
    text += `💎${r.points} (👥${r.refer}) → ₹${amt}\n`;
  }
  ctx.reply(text);
});

bot.on("text", (ctx) => {
  const txt = ctx.message.text;
  const uid = ctx.from.id;
  const u = getUser(uid);

  if (REDEEM_RULES[txt]) {
    const rule = REDEEM_RULES[txt];

    if (u.points < rule.points || u.refer < rule.refer)
      return ctx.reply(`❌ You need at least 💎${rule.points} and 👥${rule.refer}`);

    if (!coupons[txt] || coupons[txt].length === 0)
      return ctx.reply("❌ Out of stock");

    const code = coupons[txt].shift();
    u.points -= rule.points;
    stats.redeemed++;

    return ctx.reply(`🎉 Redeemed ₹${txt}!\n🎟 Coupon:\n${code}`);
  }
});

// ====== STATS ======
bot.hears("📊 Stats", (ctx) => {
  ctx.reply(
    `📊 Bot Stats\n\n👥 Users: ${Object.keys(users).length}\n🎟 Redeemed: ${stats.redeemed}`
  );
});

// ====== HELP ======
bot.hears("❓ Help", (ctx) => {
  ctx.reply(
    `❓ Help Menu:\n\n👉 Join all channels\n👉 Refer your link to earn points\n👉 Check Redeem options\n👉 Use the Menu buttons`
  );
});

// ====== ADMIN PANEL ======

bot.command("adminpanel", (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Access denied");

  ctx.reply(
    "🛠 Admin Panel",
    Markup.keyboard([
      ["➕ Add Balance", "➖ Remove Balance"],
      ["🎟 Add Coupons", "❌ Remove Coupons"],
      ["👑 Add Admin", "📢 Broadcast"],
      ["📊 Stats"]
    ]).resize()
  );
});

// ====== ADMIN ACTIONS ======

bot.hears("➕ Add Balance", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "ADD_BAL";
  ctx.reply("Send:\nUSER_ID POINTS");
});

bot.hears("➖ Remove Balance", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "REM_BAL";
  ctx.reply("Send:\nUSER_ID POINTS");
});

bot.hears("🎟 Add Coupons", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "ADD_CP";
  ctx.reply(
    "Send coupons like:\n\n500\nSVIABCDEF1234567\nSVIHIJKLMN8910112\n…"
  );
});

bot.hears("❌ Remove Coupons", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "REM_CP";
  ctx.reply("Send AMOUNT (500/1000/2000/4000)");
});

bot.hears("👑 Add Admin", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "ADD_ADMIN";
  ctx.reply("Send USER_ID to grant admin");
});

bot.hears("📢 Broadcast", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "BC";
  ctx.reply("Send message to broadcast");
});

// ====== ADMIN TEXT HANDLER ======

bot.on("text", (ctx) => {
  const state = adminState[ctx.from.id];
  if (!state || !isAdmin(ctx.from.id)) return;

  const text = ctx.message.text.trim();
  const parts = text.split("\n");

  if (state === "ADD_BAL") {
    const [id, pts] = text.split(" ");
    getUser(Number(id)).points += Number(pts);
    ctx.reply("✅ Balance added");
  }

  if (state === "REM_BAL") {
    const [id, pts] = text.split(" ");
    const u = getUser(Number(id));
    u.points = Math.max(u.points - Number(pts), 0);
    ctx.reply("✅ Balance removed");
  }

  if (state === "ADD_CP") {
    const amt = Number(parts[0]);
    let added = 0;
    for (let i = 1; i < parts.length; i++) {
      const code = parts[i].trim();
      if (code.length === 15) {
        coupons[amt].push(code);
        added++;
      }
    }
    ctx.reply(`✅ ${added} coupons added for ₹${amt}`);
  }

  if (state === "REM_CP") {
    const amt = Number(text);
    coupons[amt] = [];
    ctx.reply(`✅ Coupons cleared for ₹${amt}`);
  }

  if (state === "ADD_ADMIN") {
    const id = Number(text);
    if (!admins.includes(id)) admins.push(id);
    ctx.reply("✅ New admin added");
  }

  if (state === "BC") {
    const msg = text;
    for (let u in users) {
      bot.telegram.sendMessage(u, msg).catch(() => {});
    }
    ctx.reply("✅ Broadcast sent");
  }

  delete adminState[ctx.from.id];
});

// ====== LAUNCH ======
bot.launch();
console.log("🤖 Bot started successfully");
