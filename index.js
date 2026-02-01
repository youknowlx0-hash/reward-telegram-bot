const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");

const bot = new Telegraf(BOT_TOKEN);

/* ================= CONFIG ================= */

const ADMINS = new Set([7702942505]);

const CHANNELS = [
  { user: "@Shein_Reward", link: "https://t.me/Shein_Reward" },
  { user: "@earnmoneysupport1", link: "https://t.me/earnmoneysupport1" },
  { user: "@GlobalTaskWorks", link: "https://t.me/GlobalTaskWorks" }
];

/* ================= DATABASE (memory) ================= */

const users = {}; 
const coupons = {
  500: [],
  1000: [],
  2000: [],
  4000: []
};

let totalRedeems = 0;

/* ================= HELPERS ================= */

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      diamonds: 0,
      refs: 0,
      refBy: null,
      redeems: 0
    };
  }
  return users[id];
}

function isAdmin(id) {
  return ADMINS.has(id);
}

async function isJoined(ctx) {
  for (const ch of CHANNELS) {
    try {
      const m = await ctx.telegram.getChatMember(ch.user, ctx.from.id);
      if (["left", "kicked"].includes(m.status)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function joinKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url("Join Channel 1", CHANNELS[0].link)],
    [Markup.button.url("Join Channel 2", CHANNELS[1].link)],
    [Markup.button.url("Join Channel 3", CHANNELS[2].link)],
    [Markup.button.callback("✅ Joined", "check_join")]
  ]);
}

function mainMenu() {
  return Markup.keyboard([
    ["💎 Balance", "👥 Refer"],
    ["🎁 Withdraw", "📊 Stats"],
    ["❓ Help"]
  ]).resize();
}

/* ================= START ================= */

bot.start(async (ctx) => {
  const id = ctx.from.id;
  const ref = ctx.startPayload;
  const user = getUser(id);

  if (ref && !user.refBy && ref !== String(id)) {
    user.refBy = ref;
    const r = getUser(ref);
    r.diamonds += 1;
    r.refs += 1;
  }

  if (!(await isJoined(ctx))) {
    return ctx.reply(
      "🔒 Bot use karne ke liye pehle saare channels join karo 👇",
      joinKeyboard()
    );
  }

  ctx.reply("✅ Welcome! Menu use karo 👇", mainMenu());
});

/* ================= JOIN CHECK ================= */

bot.action("check_join", async (ctx) => {
  if (await isJoined(ctx)) {
    await ctx.editMessageText("✅ Verified! Menu open ho gaya.");
    ctx.reply("👇 Menu", mainMenu());
  } else {
    ctx.answerCbQuery("❌ Abhi join pending hai");
  }
});

/* ================= USER ================= */

bot.hears("💎 Balance", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(`💎 Diamonds: ${u.diamonds}\n👥 Referrals: ${u.refs}`);
});

bot.hears("👥 Refer", (ctx) => {
  ctx.reply(
    `👥 Refer & Earn 💎1 per valid refer\n\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`
  );
});

bot.hears("🎁 Withdraw", (ctx) => {
  ctx.reply(
    "🎁 Withdraw option choose karo:",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎5 → ₹500", "wd_500")],
      [Markup.button.callback("💎10 → ₹1000", "wd_1000")],
      [Markup.button.callback("💎20 → ₹2000", "wd_2000")],
      [Markup.button.callback("💎40 → ₹4000", "wd_4000")]
    ])
  );
});

/* ================= WITHDRAW ================= */

function withdraw(ctx, need, amount) {
  const u = getUser(ctx.from.id);

  if (u.diamonds < need) {
    return ctx.answerCbQuery("❌ Enough diamonds nahi hai");
  }

  if (coupons[amount].length === 0) {
    return ctx.answerCbQuery("❌ Coupon out of stock");
  }

  const code = coupons[amount].shift();

  u.diamonds -= need;
  u.redeems += 1;
  totalRedeems += 1;

  ctx.reply(
    `🎉 Redeem Successful!\n\n💰 Amount: ₹${amount}\n🎟 Voucher Code:\n${code}`
  );
}

bot.action("wd_500", (ctx) => withdraw(ctx, 5, 500));
bot.action("wd_1000", (ctx) => withdraw(ctx, 10, 1000));
bot.action("wd_2000", (ctx) => withdraw(ctx, 20, 2000));
bot.action("wd_4000", (ctx) => withdraw(ctx, 40, 4000));

/* ================= STATS ================= */

bot.hears("📊 Stats", (ctx) => {
  const totalUsers = Object.keys(users).length;
  ctx.reply(
    `📊 Bot Stats\n\n👥 Total Users: ${totalUsers}\n🎁 Total Redeems: ${totalRedeems}`
  );
});

/* ================= HELP ================= */

bot.hears("❓ Help", (ctx) => {
  ctx.reply(
`❓ How to use this bot:

1️⃣ Join all required channels
2️⃣ Refer friends & earn 💎1 per refer
3️⃣ Check balance in 💎 Balance
4️⃣ Redeem vouchers from 🎁 Withdraw
5️⃣ Coupons auto delivered if stock available

📞 For support contact admin`
  );
});

/* ================= ADMIN PANEL ================= */

bot.command("adminpanel", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  ctx.reply(
    "🛠 Admin Panel",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ Add Balance", "ab_add")],
      [Markup.button.callback("➖ Remove Balance", "ab_remove")],
      [Markup.button.callback("🎟 Add Coupons", "cp_add")],
      [Markup.button.callback("🗑 Remove Coupons", "cp_remove")],
      [Markup.button.callback("👤 Add Admin", "add_admin")]
    ])
  );
});

/* ================= ADMIN ACTIONS ================= */

const adminState = {};

bot.action("ab_add", (ctx) => {
  adminState[ctx.from.id] = "ADD_BAL";
  ctx.reply("Send: USERID AMOUNT");
});

bot.action("ab_remove", (ctx) => {
  adminState[ctx.from.id] = "REM_BAL";
  ctx.reply("Send: USERID AMOUNT");
});

bot.action("cp_add", (ctx) => {
  adminState[ctx.from.id] = "ADD_CP";
  ctx.reply("Send: AMOUNT CODE\nExample:\n500 ABC123");
});

bot.action("cp_remove", (ctx) => {
  adminState[ctx.from.id] = "REM_CP";
  ctx.reply("Send: AMOUNT");
});

bot.action("add_admin", (ctx) => {
  adminState[ctx.from.id] = "ADD_ADMIN";
  ctx.reply("Send USERID to make admin");
});

bot.on("text", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const state = adminState[ctx.from.id];
  if (!state) return;

  const parts = ctx.message.text.split(" ");

  if (state === "ADD_BAL") {
    getUser(parts[0]).diamonds += Number(parts[1]);
    ctx.reply("✅ Balance added");
  }

  if (state === "REM_BAL") {
    getUser(parts[0]).diamonds -= Number(parts[1]);
    ctx.reply("✅ Balance removed");
  }

  if (state === "ADD_CP") {
    const amt = Number(parts[0]);
    const code = parts.slice(1).join(" ");
    if (coupons[amt]) {
      coupons[amt].push(code);
      ctx.reply("✅ Coupon added");
    } else ctx.reply("❌ Invalid amount");
  }

  if (state === "REM_CP") {
    const amt = Number(parts[0]);
    if (coupons[amt]) {
      coupons[amt] = [];
      ctx.reply("✅ Coupons cleared");
    }
  }

  if (state === "ADD_ADMIN") {
    ADMINS.add(Number(parts[0]));
    ctx.reply("✅ New admin added");
  }

  delete adminState[ctx.from.id];
});

/* ================= RUN ================= */

bot.launch();
console.log("🤖 Bot running successfully");
