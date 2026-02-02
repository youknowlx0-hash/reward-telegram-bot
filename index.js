import telebot
from telebot import types
import json
from config import BOT_TOKEN, ADMINS, CHANNELS, REDEEM_POINTS

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# ---------- LOAD / SAVE ----------
def load_users():
    with open("users.json", "r") as f:
        return json.load(f)

def save_users(data):
    with open("users.json", "w") as f:
        json.dump(data, f, indent=2)

def load_vouchers():
    with open("vouchers.json", "r") as f:
        return json.load(f)

def save_vouchers(data):
    with open("vouchers.json", "w") as f:
        json.dump(data, f, indent=2)

users = load_users()
vouchers = load_vouchers()
admin_state = {}

# ---------- HELPERS ----------
def is_admin(uid):
    return uid in ADMINS

def get_user(uid):
    uid = str(uid)
    if uid not in users:
        users[uid] = {"balance": 0}
        save_users(users)
    return users[uid]

def check_join(user_id):
    for ch in CHANNELS:
        try:
            status = bot.get_chat_member(ch, user_id).status
            if status in ["left", "kicked"]:
                return False
        except:
            return False
    return True

# ---------- START ----------
@bot.message_handler(commands=["start"])
def start(msg):
    uid = msg.from_user.id
    get_user(uid)

    if not check_join(uid):
        kb = types.InlineKeyboardMarkup()
        for ch in CHANNELS:
            kb.add(types.InlineKeyboardButton(
                f"Join {ch}", url=f"https://t.me/{ch.replace('@','')}"
            ))
        kb.add(types.InlineKeyboardButton("✅ I Joined", callback_data="check_join"))
        bot.send_message(uid, "🔒 Pehle sab channels join karo:", reply_markup=kb)
        return

    menu(msg)

def menu(msg):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("👤 Profile", "🎁 Redeem")
    kb.row("🏆 Leaderboard", "📊 Stats")
    kb.row("🔗 Refer", "❓ Help")
    bot.send_message(msg.chat.id, "✅ Bot Ready", reply_markup=kb)

# ---------- CALLBACK ----------
@bot.callback_query_handler(func=lambda c: c.data=="check_join")
def joined(call):
    if check_join(call.from_user.id):
        bot.edit_message_text("✅ Verified! Menu use karo",
                              call.message.chat.id,
                              call.message.message_id)
    else:
        bot.answer_callback_query(call.id, "❌ Abhi join pending", show_alert=True)

# ---------- USER BUTTONS ----------
@bot.message_handler(func=lambda m: m.text=="👤 Profile")
def profile(msg):
    u = get_user(msg.from_user.id)
    bot.send_message(msg.chat.id,
        f"👤 <b>Your Profile</b>\n\n💎 Balance: {u['balance']}"
    )

@bot.message_handler(func=lambda m: m.text=="🔗 Refer")
def refer(msg):
    link = f"https://t.me/{bot.get_me().username}?start={msg.from_user.id}"
    bot.send_message(msg.chat.id, f"🔗 Invite Link:\n{link}")

@bot.message_handler(func=lambda m: m.text=="❓ Help")
def help_cmd(msg):
    bot.send_message(msg.chat.id,
        "ℹ️ <b>How to use</b>\n\n"
        "1️⃣ Join all channels\n"
        "2️⃣ Earn balance from admin\n"
        "3️⃣ Redeem vouchers\n"
    )

@bot.message_handler(func=lambda m: m.text=="📊 Stats")
def stats(msg):
    bot.send_message(msg.chat.id,
        f"📊 Bot Stats\n\n👥 Users: {len(users)}"
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
def redeem(msg):
    kb = types.InlineKeyboardMarkup()
    for amt, pts in REDEEM_POINTS.items():
        kb.add(types.InlineKeyboardButton(
            f"₹{amt} ({pts}💎)",
            callback_data=f"redeem_{amt}"
        ))
    bot.send_message(msg.chat.id, "🎁 Choose Voucher", reply_markup=kb)

@bot.callback_query_handler(func=lambda c: c.data.startswith("redeem_"))
def do_redeem(call):
    amt = call.data.split("_")[1]
    u = get_user(call.from_user.id)

    if u["balance"] < REDEEM_POINTS[amt]:
        bot.answer_callback_query(call.id, "❌ Insufficient balance", show_alert=True)
        return

    if not vouchers[amt]:
        bot.answer_callback_query(call.id, "❌ Out of stock", show_alert=True)
        return

    code = vouchers[amt].pop(0)
    u["balance"] -= REDEEM_POINTS[amt]
    save_users(users)
    save_vouchers(vouchers)

    bot.send_message(call.from_user.id,
        f"🎉 <b>Redeem Successful</b>\n\n₹{amt}\n🎟 Code:\n<code>{code}</code>"
    )

# ---------- ADMIN PANEL ----------
@bot.message_handler(commands=["adminpanel"])
def adminpanel(msg):
    if not is_admin(msg.from_user.id):
        return

    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("➕ Add Balance", "➖ Remove Balance")
    kb.row("🎟 Add Coupons")
    bot.send_message(msg.chat.id, "🛠 Admin Panel", reply_markup=kb)

@bot.message_handler(func=lambda m: m.text=="➕ Add Balance")
def add_bal(msg):
    if is_admin(msg.from_user.id):
        admin_state[msg.from_user.id] = "ADD_BAL"
        bot.send_message(msg.chat.id, "Send:\nUSER_ID AMOUNT")

@bot.message_handler(func=lambda m: m.text=="➖ Remove Balance")
def rem_bal(msg):
    if is_admin(msg.from_user.id):
        admin_state[msg.from_user.id] = "REM_BAL"
        bot.send_message(msg.chat.id, "Send:\nUSER_ID AMOUNT")

@bot.message_handler(func=lambda m: m.text=="🎟 Add Coupons")
def add_cp(msg):
    if is_admin(msg.from_user.id):
        admin_state[msg.from_user.id] = "ADD_CP"
        bot.send_message(msg.chat.id,
            "Send:\nAMOUNT\nCODE1\nCODE2\n(15 digit codes)"
        )

@bot.message_handler(func=lambda m: str(m.from_user.id) in map(str,admin_state.keys()))
def admin_input(msg):
    uid = msg.from_user.id
    state = admin_state.get(uid)

    if state == "ADD_BAL":
        i,a = msg.text.split()
        get_user(i)["balance"] += int(a)
        save_users(users)
        bot.send_message(uid, "✅ Balance added")

    elif state == "REM_BAL":
        i,a = msg.text.split()
        get_user(i)["balance"] = max(0, get_user(i)["balance"]-int(a))
        save_users(users)
        bot.send_message(uid, "✅ Balance removed")

    elif state == "ADD_CP":
        lines = msg.text.split("\n")
        amt = lines[0]
        for c in lines[1:]:
            if len(c)==15:
                vouchers[amt].append(c)
        save_vouchers(vouchers)
        bot.send_message(uid, "✅ Coupons added")

    admin_state.pop(uid,None)

print("🤖 Bot Running...")
bot.infinity_polling()
