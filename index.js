const { Telegraf, Markup } = require("telegraf");

if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN missing");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= CONFIG =================
const ADMINS = new Set([7702942505]);

const CHANNELS = [
  "@Shein_Reward",
  "@earnmoneysupport1",
  "@GlobalTaskWorks",
  "@Manish_Looterss"
];

// ✅ Redeem points updated
const REDEEM = {
  500: { points: 3 },
  1000: { points: 6 },
  2000: { points: 10 },
  4000: { points: 15 }
};

// ================= DATABASE =================
const users = {}; // uid => { points, refer }
const coupons = { 500: [], 1000: [], 2000: [], 4000: [] };
const adminStep = {};
const stats = { redeemed: 0 };

// ================= HELPERS =================
const isAdmin = (id) => ADMINS.has(id);

function getUser(id) {
  if (!users[id]) users[id] = { points: 0, refer: 0 };
  return users[id];
}

async function checkJoin(ctx) {
  for (let ch of CHANNELS) {
    try {
      const m = await ctx.telegram.getChatMember(ch, ctx.from.id);
      if (["left", "kicked"].includes(m.status)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ================= ADMIN PANEL =================
bot.command("adminpanel", (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Access denied");

  ctx.reply(
    "🛠 Admin Panel",
    Markup.keyboard([
      ["➕ Add Balance", "➖ Remove Balance"],
      ["🎟 Add Coupons", "❌ Clear Coupons"],
      ["👑 Add Admin", "📢 Broadcast"],
      ["📊 Stats"]
    ]).resize()
  );
});

// ================= START =================
bot.start(async (ctx) => {
  const uid = ctx.from.id;
  getUser(uid);

  if (!(await checkJoin(ctx))) {
    return ctx.reply(
      "🔒 Pehle sab channels join karo",
      Markup.inlineKeyboard([
        ...CHANNELS.map(c => [
          Markup.button.url(`Join ${c}`, `https://t.me/${c.replace("@", "")}`)
        ]),
        [Markup.button.callback("✅ I Joined", "check_join")]
      ])
    );
  }

  ctx.reply(
    "✅ Bot Ready",
    Markup.keyboard([
      ["👤 Profile", "🎁 Redeem"],
      ["📊 Stats", "❓ Help"]
    ]).resize()
  );
});

bot.action("check_join", async (ctx) => {
  if (await checkJoin(ctx)) {
    await ctx.editMessageText("✅ Verified! Ab menu use karo");
  } else {
    await ctx.answerCbQuery("❌ Abhi join pending", { show_alert: true });
  }
});

// ================= ADMIN HANDLERS =================
bot.hears("➕ Add Balance", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminStep[ctx.from.id] = "ADD_BAL";
  ctx.reply("Send:\nUSER_ID POINTS");
});

bot.hears("➖ Remove Balance", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminStep[ctx.from.id] = "REM_BAL";
  ctx.reply("Send:\nUSER_ID POINTS");
});

bot.hears("🎟 Add Coupons", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminStep[ctx.from.id] = "ADD_CP";
  ctx.reply("Send:\nAMOUNT\nCOUPON1\nCOUPON2\n...");
});

bot.hears("❌ Clear Coupons", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminStep[ctx.from.id] = "CLR_CP";
  ctx.reply("Send amount (500/1000/2000/4000)");
});

bot.hears("👑 Add Admin", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminStep[ctx.from.id] = "ADD_ADMIN";
  ctx.reply("Send USER_ID");
});

bot.hears("📢 Broadcast", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminStep[ctx.from.id] = "BC";
  ctx.reply("Send message");
});

// ================= USER MESSAGE HANDLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const uid = ctx.from.id;
  const user = getUser(uid);

  // ===== Admin steps
  if (adminStep[uid] && isAdmin(uid)) {
    const step = adminStep[uid];

    if (step === "ADD_BAL") {
      const [id, pts] = text.split(" ");
      const uid2 = Number(id);
      if (!uid2 || isNaN(pts)) return ctx.reply("❌ Invalid format");
      getUser(uid2).points += Number(pts);
      ctx.reply("✅ Balance added");
    }

    if (step === "REM_BAL") {
      const [id, pts] = text.split(" ");
      const uid2 = Number(id);
      if (!uid2 || isNaN(pts)) return ctx.reply("❌ Invalid format");
      const u = getUser(uid2);
      u.points = Math.max(0, u.points - Number(pts));
      ctx.reply("✅ Balance removed");
    }

    if (step === "ADD_CP") {
      const lines = text.split("\n");
      const amt = Number(lines[0]);
      let added = 0;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim().length === 15) {
          coupons[amt].push(lines[i].trim());
          added++;
        }
      }
      ctx.reply(`✅ ${added} coupons added for ₹${amt}`);
    }

    if (step === "CLR_CP") {
      const amt = Number(text);
      if ([500,1000,2000,4000].includes(amt)) {
        coupons[amt] = [];
        ctx.reply(`✅ Coupons cleared for ₹${amt}`);
      } else ctx.reply("❌ Invalid amount");
    }

    if (step === "ADD_ADMIN") {
      ADMINS.add(Number(text));
      ctx.reply("✅ New admin added");
    }

    if (step === "BC") {
      for (let u in users) {
        bot.telegram.sendMessage(u, text).catch(() => {});
      }
      ctx.reply("✅ Broadcast sent");
    }

    delete adminStep[uid];
    return;
  }

  // ===== User commands
  if (text === "👤 Profile") {
    return ctx.reply(
      `👤 Profile\n\n💎 Balance: ${user.points}\n👥 Refers: ${user.refer}\n\n🔗 Referral Link:\nhttps://t.me/${ctx.botInfo.username}?start=${uid}`
    );
  }

  if (text === "📊 Stats") {
    return ctx.reply(
      `📊 Bot Stats\n\n👥 Users: ${Object.keys(users).length}\n🎟 Redeemed: ${stats.redeemed}`
    );
  }

  if (text === "❓ Help") {
    return ctx.reply(
      "ℹ️ Use bot:\n1️⃣ Join channels\n2️⃣ Refer friends\n3️⃣ Earn 💎\n4️⃣ Redeem vouchers"
    );
  }

  if (text === "🎁 Redeem") {
    return ctx.reply(
      "🎁 Choose Voucher",
      Markup.inlineKeyboard([
        [Markup.button.callback("₹500 (💎3)", "redeem_500")],
        [Markup.button.callback("₹1000 (💎6)", "redeem_1000")],
        [Markup.button.callback("₹2000 (💎10)", "redeem_2000")],
        [Markup.button.callback("₹4000 (💎15)", "redeem_4000")]
      ])
    );
  }
});

// ================= REDEEM CALLBACKS =================
[500,1000,2000,4000].forEach(amt => {
  bot.action(`redeem_${amt}`, (ctx) => {
    const u = getUser(ctx.from.id);
    const rule = REDEEM[amt];

    // ✅ Only balance check
    if (u.points < rule.points)
      return ctx.answerCbQuery("❌ Not enough balance", { show_alert: true });

    if (coupons[amt].length === 0)
      return ctx.answerCbQuery("❌ Out of stock", { show_alert: true });

    const code = coupons[amt].shift();
    u.points -= rule.points;
    stats.redeemed++;

    ctx.reply(`🎉 Redeem Successful\n₹${amt} Voucher\n🎟 Code:\n${code}`);
  });
});

// ================= BOT LAUNCH =================
bot.launch();
console.log("🤖 BOT RUNNING – FINAL VERSION");
