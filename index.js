const { Telegraf, Markup } = require("telegraf");

// BOT TOKEN from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN;

// Admin ID
const ADMIN_ID = 7702942505;

// Channels
const CHANNELS = [
  "@Shein_Reward",
  "@LuckyXGiveways",
  "@GlobalTaskWorks"
];

const bot = new Telegraf(BOT_TOKEN);

// In-memory DB
let users = {};
let coupons = [];

// Helper to get user
function getUser(id) {
  if (!users[id]) {
    users[id] = { diamonds: 0, referrals: 0, referredBy: null };
  }
  return users[id];
}

// Check if user joined all channels
async function checkJoin(ctx) {
  for (let ch of CHANNELS) {
    try {
      const res = await ctx.telegram.getChatMember(ch, ctx.from.id);
      if (res.status === "left") return false;
    } catch (e) {
      return false;
    }
  }
  return true;
}

// START command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const refId = ctx.startPayload;

  const user = getUser(userId);

  // Referral
  if (refId && !user.referredBy && refId != userId) {
    user.referredBy = refId;
    const refUser = getUser(refId);
    refUser.diamonds += 1;
    refUser.referrals += 1;
  }

  const joined = await checkJoin(ctx);

  if (!joined) {
    return ctx.reply(
      "🚨 *First join all channels*",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("Join Channel 1", "https://t.me/Shein_Reward")],
          [Markup.button.url("Join Channel 2", "https://t.me/LuckyXGiveways")],
          [Markup.button.url("Join Channel 3", "https://t.me/GlobalTaskWorks")],
          [Markup.button.callback("✅ Check Join", "check_join")]
        ])
      }
    );
  }

  ctx.reply(
    "✅ *Welcome to Reward Bot*\nChoose an option 👇",
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([
        ["💎 Balance", "👥 Refer"],
        ["🎁 Withdraw", "📞 Support"]
      ]).resize()
    }
  );
});

// Check Join Action
bot.action("check_join", async (ctx) => {
  const joined = await checkJoin(ctx);
  if (!joined) return ctx.answerCbQuery("❌ Join all channels first!");
  ctx.answerCbQuery("✅ Joined Successfully");
  ctx.reply("🎉 Now use the bot menu");
});

// Balance
bot.hears("💎 Balance", (ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply(`💎 Diamonds: ${user.diamonds}\nReferrals: ${user.referrals}`);
});

// Refer
bot.hears("👥 Refer", (ctx) => {
  const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
  ctx.reply(`👥 Refer link:\n${link}\n🎁 1💎 per valid refer`);
});

// Withdraw
bot.hears("🎁 Withdraw", (ctx) => {
  const user = getUser(ctx.from.id);
  if (user.referrals < 5) return ctx.reply("❌ Minimum 5 referrals required");

  ctx.reply(
    "💳 Select Withdraw Option",
    Markup.inlineKeyboard([
      [Markup.button.callback("₹500 💎5", "wd_500")],
      [Markup.button.callback("₹1000 💎10", "wd_1000")]
    ])
  );
});

// Withdraw actions
bot.action("wd_500", (ctx) => withdraw(ctx, 5, 500));
bot.action("wd_1000", (ctx) => withdraw(ctx, 10, 1000));

function withdraw(ctx, diamonds, amount) {
  const user = getUser(ctx.from.id);
  if (user.diamonds < diamonds) return ctx.answerCbQuery("❌ Not enough diamonds");

  user.diamonds -= diamonds;
  ctx.reply(`✅ Withdraw request sent for ₹${amount}`);

  bot.telegram.sendMessage(
    ADMIN_ID,
    `📥 Withdraw Request\nUser: ${ctx.from.id}\nAmount: ₹${amount}`
  );
}

// Admin Add Coupon
bot.command("addcoupon", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Admin only");

  const code = ctx.message.text.split(" ")[1];
  if (!code) return ctx.reply("Usage: /addcoupon CODE");

  coupons.push(code);
  ctx.reply("✅ Coupon added");
});

// Support
bot.hears("📞 Support", (ctx) => {
  ctx.reply("📩 Contact Admin: @LuckyXGiveways");
});

// Launch Bot
bot.launch();
console.log("🤖 Bot started successfully");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
