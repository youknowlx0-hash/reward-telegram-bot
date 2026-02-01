const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== DATABASE (IN-MEMORY) =====
let users = {};
let admins = [7702942505]; // ← ADMIN ID
let coupons = {
  500: [],
  1000: [],
  2000: [],
  4000: []
};

let stats = {
  redeemed: 0
};

let adminState = {};

// ===== REFER REQUIREMENTS =====
const REFER_NEED = {
  500: 3,
  1000: 6,
  2000: 8,
  4000: 15
};

// ===== HELPERS =====
function isAdmin(id) {
  return admins.includes(id);
}

function getUser(id) {
  if (!users[id]) {
    users[id] = { points: 0, referred: 0 };
  }
  return users[id];
}

// ===== START =====
bot.start((ctx) => {
  const id = ctx.from.id;
  getUser(id);

  const ref = ctx.startPayload;
  if (ref && ref !== id.toString()) {
    const refUser = getUser(ref);
    refUser.points += 1;
    refUser.referred += 1;
  }

  ctx.reply(
    "👋 Welcome!\n\n🔗 Refer friends & earn rewards.",
    Markup.keyboard([
      ["💰 Balance", "🎁 Redeem"],
      ["📊 Stats", "❓ Help"]
    ]).resize()
  );
});

// ===== BALANCE =====
bot.hears("💰 Balance", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(
    `💎 Points: ${u.points}\n👥 Referrals: ${u.referred}\n\n🔗 Your link:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`
  );
});

// ===== REDEEM MENU =====
bot.hears("🎁 Redeem", (ctx) => {
  const u = getUser(ctx.from.id);

  let msg = "🎁 Redeem Options:\n\n";
  if (u.points >= 3) msg += "💎3 → ₹500\n";
  if (u.points >= 6) msg += "💎6 → ₹1000\n";
  if (u.points >= 8) msg += "💎8 → ₹2000\n";
  if (u.points >= 15) msg += "💎15 → ₹4000\n";

  if (msg === "🎁 Redeem Options:\n\n")
    msg = "❌ Not enough points";

  ctx.reply(msg);
});

// ===== REDEEM PROCESS =====
bot.hears(/₹(\d+)/, (ctx) => {
  const amount = Number(ctx.match[1]);
  const need = REFER_NEED[amount];
  const u = getUser(ctx.from.id);

  if (!need) return;
  if (u.points < need)
    return ctx.reply(`❌ Need ${need} referrals`);

  if (!coupons[amount] || coupons[amount].length === 0)
    return ctx.reply("❌ Coupon out of stock");

  const code = coupons[amount].shift();
  u.points -= need;
  stats.redeemed++;

  ctx.reply(
    `✅ Redeemed Successfully!\n\n🎟 Coupon: ${code}\n💰 Value: ₹${amount}`
  );
});

// ===== HELP =====
bot.hears("❓ Help", (ctx) => {
  ctx.reply(
    "ℹ️ Bot Guide:\n\n1️⃣ Refer friends\n2️⃣ Earn points\n3️⃣ Redeem coupons\n\nNeed help? Contact admin."
  );
});

// ===== STATS =====
bot.hears("📊 Stats", (ctx) => {
  ctx.reply(
    `📊 Bot Stats\n\n👥 Users: ${Object.keys(users).length}\n🎟 Redeemed: ${stats.redeemed}`
  );
});

// ===== ADMIN PANEL =====
bot.command("adminpanel", (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Access denied");

  ctx.reply(
    "🛠 Admin Panel",
    Markup.keyboard([
      ["🎟️ Add Coupons", "❌ Remove Coupons"],
      ["👑 Add Admin", "📢 Broadcast"],
      ["📊 Stats"]
    ]).resize()
  );
});

// ===== ADD COUPONS =====
bot.hears("🎟️ Add Coupons", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState[ctx.from.id] = "ADD_COUPON";
  ctx.reply(
    "Send format:\n\n500\nSVIXXXXXXXXXXXX\nSVIXXXXXXXXXXXX\n(15 characters each)"
  );
});

// ===== ADMIN TEXT HANDLER =====
bot.on("text", (ctx) => {
  const state = adminState[ctx.from.id];
  if (!state) return;

  if (state === "ADD_COUPON") {
    const lines = ctx.message.text.split("\n");
    const amount = Number(lines[0]);

    if (!coupons[amount]) {
      delete adminState[ctx.from.id];
      return ctx.reply("❌ Invalid amount");
    }

    let added = 0;
    for (let i = 1; i < lines.length; i++) {
      const code = lines[i].trim();
      if (code.length === 15) {
        coupons[amount].push(code);
        added++;
      }
    }

    delete adminState[ctx.from.id];
    ctx.reply(`✅ ${added} coupons added for ₹${amount}`);
  }
});

// ===== START BOT =====
bot.launch();
console.log("🤖 Bot running...");
