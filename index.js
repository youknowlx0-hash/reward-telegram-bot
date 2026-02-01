const TelegramBot = require("node-telegram-bot-api");

// ===== ENV =====
const TOKEN = process.env.BOT_TOKEN; // REQUIRED
const ADMINS = [7702942505]; // add more admin IDs if needed

if (!TOKEN) {
  console.error("BOT_TOKEN is required");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== DATABASE (in-memory) =====
const users = {}; 
const coupons = {
  500: [],
  1000: [],
  2000: [],
  4000: []
};

let totalRedeems = 0;

// ===== HELPERS =====
function isAdmin(id) {
  return ADMINS.includes(id);
}

function initUser(id) {
  if (!users[id]) {
    users[id] = {
      balance: 0,
      refers: 0,
      redeemed: 0
    };
  }
}

// ===== START =====
bot.onText(/\/start(?: (\d+))?/, (msg, match) => {
  const id = msg.from.id;
  initUser(id);

  const ref = match[1];
  if (ref && ref !== String(id) && users[ref]) {
    users[ref].refers += 1;
  }

  bot.sendMessage(id,
`👋 Welcome!

💰 Balance: ${users[id].balance}
👥 Refers: ${users[id].refers}

Use /help to know how to use bot`
);
});

// ===== HELP =====
bot.onText(/\/help/, msg => {
  bot.sendMessage(msg.chat.id,
`📖 BOT HELP

👤 User Commands:
/balance – Check balance
/redeem – Redeem voucher
/stats – Bot stats

👑 Admin:
/adminpanel`
);
});

// ===== BALANCE =====
bot.onText(/\/balance/, msg => {
  initUser(msg.from.id);
  bot.sendMessage(msg.chat.id,
`💰 Your Balance: ${users[msg.from.id].balance}`);
});

// ===== STATS =====
bot.onText(/\/stats/, msg => {
  bot.sendMessage(msg.chat.id,
`📊 BOT STATS

👥 Users: ${Object.keys(users).length}
🎁 Redeems: ${totalRedeems}

🎟 Coupons:
₹500 → ${coupons[500].length}
₹1000 → ${coupons[1000].length}
₹2000 → ${coupons[2000].length}
₹4000 → ${coupons[4000].length}`
);
});

// ===== ADMIN PANEL =====
bot.onText(/\/adminpanel/, msg => {
  if (!isAdmin(msg.from.id)) return;

  bot.sendMessage(msg.chat.id,
`👑 ADMIN PANEL

/addbalance userId amount
/removebalance userId amount

/addcoupon amount
/removecoupon amount

/stats`
);
});

// ===== ADD BALANCE =====
bot.onText(/\/addbalance (\d+) (\d+)/, (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  initUser(m[1]);
  users[m[1]].balance += Number(m[2]);
  bot.sendMessage(msg.chat.id, "✅ Balance Added");
});

// ===== REMOVE BALANCE =====
bot.onText(/\/removebalance (\d+) (\d+)/, (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  initUser(m[1]);
  users[m[1]].balance -= Number(m[2]);
  if (users[m[1]].balance < 0) users[m[1]].balance = 0;
  bot.sendMessage(msg.chat.id, "✅ Balance Removed");
});

// ===== ADD COUPONS (BULK) =====
bot.onText(/\/addcoupon (\d+)/, (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  const amount = m[1];
  if (!coupons[amount]) return bot.sendMessage(msg.chat.id, "❌ Invalid amount");

  bot.sendMessage(msg.chat.id, "✍️ Send coupons (space/new line separated)");
  bot.once("message", reply => {
    const list = reply.text.split(/\s+/);
    list.forEach(c => {
      if (c.length === 15) coupons[amount].push(c);
    });
    bot.sendMessage(msg.chat.id, `✅ ${list.length} Coupons Added`);
  });
});

// ===== REMOVE COUPON =====
bot.onText(/\/removecoupon (\d+)/, (msg, m) => {
  if (!isAdmin(msg.from.id)) return;
  coupons[m[1]] = [];
  bot.sendMessage(msg.chat.id, "🗑 Coupons Removed");
});

// ===== REDEEM =====
bot.onText(/\/redeem/, msg => {
  initUser(msg.from.id);
  const kb = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "₹500", callback_data: "redeem_500" }],
        [{ text: "₹1000", callback_data: "redeem_1000" }],
        [{ text: "₹2000", callback_data: "redeem_2000" }],
        [{ text: "₹4000", callback_data: "redeem_4000" }]
      ]
    }
  };
  bot.sendMessage(msg.chat.id, "🎁 Select Voucher", kb);
});

// ===== REDEEM HANDLER =====
const rules = { 500:3, 1000:6, 2000:8, 4000:15 };

bot.on("callback_query", q => {
  const id = q.from.id;
  initUser(id);
  const amt = Number(q.data.split("_")[1]);

  if (users[id].refers < rules[amt]) {
    return bot.answerCallbackQuery(q.id, { text: "❌ Not enough refers" });
  }
  if (coupons[amt].length === 0) {
    return bot.answerCallbackQuery(q.id, { text: "❌ No coupons left" });
  }

  const code = coupons[amt].shift();
  users[id].redeemed += 1;
  totalRedeems++;

  bot.sendMessage(id,
`🎉 Redeemed Successfully!

💎 Amount: ₹${amt}
🎟 Code: ${code}`);
});
