import telebot
from telebot import types
import json, os
from config import ADMINS, CHANNELS, REDEEM_POINTS

BOT_TOKEN = os.getenv("BOT_TOKEN")
bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# ---------- LOAD / SAVE ----------
def load_json(file, default):
    if not os.path.exists(file):
        with open(file, "w") as f:
            json.dump(default, f)
    with open(file) as f:
        return json.load(f)

def save_json(file, data):
    with open(file, "w") as f:
        json.dump(data, f, indent=2)

users = load_json("users.json", {})
vouchers = load_json("vouchers.json", {
    "500": [], "1000": [], "2000": [], "4000": []
})

admin_state = {}

# ---------- HELPERS ----------
def get_user(uid):
    uid = str(uid)
    if uid not in users:
        users[uid] = {"balance": 0}
        save_json("users.json", users)
    return users[uid]

def is_admin(uid):
    return uid in ADMINS

def check_join(uid):
    for ch in CHANNELS:
        try:
            status = bot.get_chat_member(ch, uid).status
            if status in ["left", "kicked"]:
                return False
        except:
            return False
    return True

def send_menu(chat_id):
    menu = types.ReplyKeyboardMarkup(resize_keyboard=True)
    menu.row("👤 Profile", "🎁 Redeem")
    menu.row("🏆 Leaderboard", "📊 Stats")
    menu.row("🔗 Refer", "❓ Help")
    bot.send_message(chat_id, "✅ Bot Ready", reply_markup=menu)

# ---------- START ----------
@bot.message_handler(commands=["start"])
def start(msg):
    uid = msg.from_user.id
    get_user(uid)

    if not check_join(uid):
        kb = types.InlineKeyboardMarkup()
        for c in CHANNELS:
            kb.add(types.InlineKeyboardButton(f"Join {c}", url=f"https://t.me/{c.replace('@','')}"))
        kb.add(types.InlineKeyboardButton("✅ I Joined", callback_data="check_join"))
        bot.send_message(uid, "🔒 Pehle sab channels join karo aur active ho jao Telegram me:", reply_markup=kb)
        return

    send_menu(uid)

# ---------- VERIFICATION CALLBACK ----------
@bot.callback_query_handler(func=lambda c: c.data=="check_join")
def joined_verification(c):
    uid = c.from_user.id
    if check_join(uid):
        bot.answer_callback_query(c.id, "✅ Verified & Active!")
        send_menu(uid)  # Menu only show if user joined
    else:
        bot.answer_callback_query(c.id, "❌ Join all channels first", True)

# ---------- USER BUTTONS ----------
@bot.message_handler(func=lambda m: m.text=="👤 Profile")
def profile(msg):
    u = get_user(msg.from_user.id)
    bot.send_message(msg.chat.id,
        f"👤 <b>Profile</b>\n\n💎 Balance: {u['balance']}"
    )

@bot.message_handler(func=lambda m: m.text=="🔗 Refer")
def refer(msg):
    bot.send_message(msg.chat.id,
        f"🔗 Invite Link:\nhttps://t.me/{bot.get_me().username}?start={msg.from_user.id}"
    )

@bot.message_handler(func=lambda m: m.text=="📊 Stats")
def stats(msg):
    bot.send_message(msg.chat.id,
        f"📊 Users: {len(users)}\n🎟 Total Coupons:\n" +
        "\n".join([f"₹{k}: {len(v)}" for k,v in vouchers.items()])
    )

@bot.message_handler(func=lambda m: m.text=="❓ Help")
def help_(msg):
    bot.send_message(msg.chat.id,
        "ℹ️ <b>How to use</b>\n"
        "1️⃣ Join all channels\n"
        "2️⃣ Earn balance from admin\n"
        "3️⃣ Redeem vouchers"
    )

@bot.message_handler(func=lambda m: m.text=="🏆 Leaderboard")
def leaderboard(msg):
    top = sorted(users.items(), key=lambda x: x[1]["balance"], reverse=True)[:10]
    text = "🏆 <b>Leaderboard</b>\n\n"
    for i,(uid,data) in enumerate(top,1):
        text += f"{i}. {uid} — 💎 {data['balance']}\n"
    bot.send_message(msg.chat.id, text)

# ---------- REDEEM ----------
@bot.message_handler(func=lambda m: m.text=="🎁 Redeem")
def redeem_menu(msg):
    kb = types.InlineKeyboardMarkup()
    for amt, pts in REDEEM_POINTS.items():
        kb.add(types.InlineKeyboardButton(f"₹{amt} – {pts}💎", callback_data=f"redeem_{amt}"))
    bot.send_message(msg.chat.id, "🎁 Select voucher", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("redeem_"))
def redeem(c):
    amt = c.data.split("_")[1]
    u = get_user(c.from_user.id)
    need = REDEEM_POINTS[int(amt)]

    if u["balance"] < need:
        bot.answer_callback_query(c.id, "❌ Insufficient balance", True)
        return

    if not vouchers[amt]:
        bot.answer_callback_query(c.id, "❌ Out of stock", True)
        return

    code = vouchers[amt].pop(0)
    u["balance"] -= need
    save_json("users.json", users)
    save_json("vouchers.json", vouchers)

    bot.send_message(c.from_user.id,
        f"🎉 Redeemed ₹{amt}\n\n🎟 Coupon:\n<code>{code}</code>"
    )

# ---------- ADMIN PANEL ----------
@bot.message_handler(commands=["adminpanel"])
def adminpanel(msg):
    if not is_admin(msg.from_user.id): return
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("➕ Add Balance", "➖ Remove Balance")
    kb.row("🎟 Add Coupons")
    bot.send_message(msg.chat.id, "🛠 Admin Panel", reply_markup=kb)

@bot.message_handler(func=lambda m: m.text=="➕ Add Balance")
def addbal(msg):
    if not is_admin(msg.from_user.id): return
    admin_state[msg.from_user.id] = "ADD_BAL"
    bot.send_message(msg.chat.id, "Send: USER_ID AMOUNT")

@bot.message_handler(func=lambda m: m.text=="➖ Remove Balance")
def rembal(msg):
    if not is_admin(msg.from_user.id): return
    admin_state[msg.from_user.id] = "REM_BAL"
    bot.send_message(msg.chat.id, "Send: USER_ID AMOUNT")

@bot.message_handler(func=lambda m: m.text=="🎟 Add Coupons")
def addcp(msg):
    if not is_admin(msg.from_user.id): return
    admin_state[msg.from_user.id] = "ADD_CP"
    bot.send_message(msg.chat.id, "Send:\nAMOUNT\nCODE1\nCODE2...")

@bot.message_handler(func=lambda m: m.from_user.id in admin_state)
def admin_input(msg):
    uid = msg.from_user.id
    state = admin_state.get(uid)

    if state == "ADD_BAL":
        i,a = msg.text.split()
        get_user(i)["balance"] += int(a)
        save_json("users.json", users)

    elif state == "REM_BAL":
        i,a = msg.text.split()
        get_user(i)["balance"] = max(0,get_user(i)["balance"]-int(a))
        save_json("users.json", users)

    elif state == "ADD_CP":
        lines = msg.text.splitlines()
        amt = lines[0]
        for c in lines[1:]:
            if len(c)==15:
                vouchers[amt].append(c)
        save_json("vouchers.json", vouchers)

    admin_state.pop(uid,None)
    bot.send_message(uid, "✅ Done")

print("🤖 Bot running")
bot.infinity_polling()
