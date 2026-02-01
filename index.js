const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== CONFIG =====
const ADMINS = new Set([7702942505]);

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

// ===== MEMORY DATABASE =====
let users = {};
let coupons = { 500: [], 1000: [], 2000: [], 4000: [] };
let adminState = {};
let stats = { redeemed: 0 };

// ===== HELPERS =====
const isAdmin = (id) => ADMINS.has(id);

function getUser(id) {
  if (!users[id]) {
    users[id] = { points: 0, refer: 0 };
  }
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

// ===== START =====
bot.start(async (ctx) => {
  const uid = ctx.from.id;
  const user = getUser(uid);

  // referral
  if (ctx.startPayload && ctx.startPayload !== uid.toString()) {
    const refUser = getUser(ctx.startPayload);
    refUser.points += 1;
    refUser.refer += 1;
  }

  if (!(await checkJoin(ctx))) {
    return ctx.reply(
      "🔒 Pehle sab channels join karo",
      Markup.inlineKeyboard([
        ...CHANNELS.map((c) => [
          Markup.button.url(
            `Join ${c}`,
            `https://t.me/${c.replace("@", "")}`
          ),
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
    ctx.editMessageText("✅ Verified! Menu use karo");
  } else {
    ctx.answerCbQuery("❌ Abhi bhi join pending hai", { show_alert: true });
  }
});

// ===== USER =====
bot.hears("👤 Profile", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(
    `👤 Profile\n\n💎 Points: ${u.points}\n👥 Refers: ${u.refer}\n\n🔗 Referral Link:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`
  );
});

bot.hears("🎁 Redeem", (ctx) => {
  ctx.reply(
    "🎁 Voucher Choose Karo",
    Markup.inlineKeyboard([
      [Markup.button.callback("₹500 (💎5 | 👥3)", "redeem_500")],
      [Markup.button.callback("₹1000 (💎10 | 👥6)", "redeem_1000")],
      [Markup.button.callback("₹2000 (💎20 | 👥8)", "redeem_2000")],
      [Markup.button.callback("₹4000 (💎40 | 👥15)", "redeem_4000")]
    ])
  );
});

for (let amt of [500, 1000, 2000, 4000]) {
  bot.action(`redeem_${amt}`, (ctx) => {
    const u = getUser(ctx.from.id);
    const rule = REDEEM_RULES[amt];

    if (u.points < rule.points || u.refer < rule.refer) {
      return ctx.answerCbQuery(
        "❌ Points / Refer kam hai",
        { show_alert: true }
      );
    }

    if (!coupons[amt].length) {
      return ctx.answerCbQuery(
        "❌ Coupon out of stock",
        { show_alert: true }
      );
    }

    const code = coupons[amt].shift();
    u.points -= rule.points;
    stats.redeemed++;

    ctx.reply(
      `🎉 Redeem Successful\n\n💰 Amount: ₹${amt}\n🎟 Coupon Code:\n${code}`
    );
  });
}

// ===== STATS & HELP =====
bot.hears("📊 Stats", (ctx) => {
  ctx.reply(
    `📊 Bot Stats\n\n👥 Users: ${Object.keys(users).length}\n🎟 Total Redeemed: ${stats.redeemed}`
  );
});

bot.hears("❓ Help", (ctx) => {
  ctx.reply(
    "ℹ️ How to use bot:\n\n1️⃣ Join all channels\n2️⃣ Refer friends\n3️⃣ Earn 💎 points\n4️⃣ Redeem vouchers"
  );
});

// ===== ADMIN PANEL =====
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

// ===== ADMIN ACTIONS =====
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
    "Send format:\n\nAMOUNT\nCOUPON1\nCOUPON2\n...\n\n(15 digit each)"
  );
});

bot.hears("❌ Clear Coupons", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "CLR_CP";
  ctx.reply("Send amount (500/1000/2000/4000)");
});

bot.hears("👑 Add Admin", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "ADD_ADMIN";
  ctx.reply("Send USER_ID");
});

bot.hears("📢 Broadcast", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "BC";
  ctx.reply("Send message to broadcast");
});

// ===== ADMIN TEXT HANDLER =====
bot.on("text", (ctx) => {
  const state = adminState[ctx.from.id];
  if (!state || !isAdmin(ctx.from.id)) return;

  const text = ctx.message.text.trim();

  if (state === "ADD_BAL") {
    const [id, pts] = text.split(" ");
    getUser(id).points += Number(pts);
    ctx.reply("✅ Balance added");
  }

  if (state === "REM_BAL") {
    const [id, pts] = text.split(" ");
    const u = getUser(id);
    u.points = Math.max(0, u.points - Number(pts));
    ctx.reply("✅ Balance removed");
  }

  if (state === "ADD_CP") {
    const lines = text.split("\n");
    const amt = Number(lines[0]);
    let added = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].length === 15) {
        coupons[amt].push(lines[i]);
        added++;
      }
    }
    ctx.reply(`✅ ${added} coupons added for ₹${amt}`);
  }

  if (state === "CLR_CP") {
    coupons[Number(text)] = [];
    ctx.reply("✅ Coupons cleared");
  }

  if (state === "ADD_ADMIN") {
    ADMINS.add(Number(text));
    ctx.reply("✅ Admin added");
  }

  if (state === "BC") {
    for (let u in users) {
      bot.telegram.sendMessage(u, text).catch(() => {});
    }
    ctx.reply("✅ Broadcast sent");
  }

  delete adminState[ctx.from.id];
});

// ===== LAUNCH =====
bot.launch();
console.log("🤖 Bot started successfully");
