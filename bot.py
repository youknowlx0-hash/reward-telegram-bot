import telebot
from telebot import types
import json, os, time
from config import ADMINS, CHANNELS, REDEEM_POINTS

BOT_TOKEN = os.getenv("BOT_TOKEN")
bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# ---------------- FILE HANDLING ----------------
def load(file, default):
    if not os.path.exists(file):
        with open(file,"w") as f:
            json.dump(default,f)
    with open(file) as f:
        return json.load(f)

def save(file, data):
    with open(file,"w") as f:
        json.dump(data,f,indent=2)

users = load("users.json", {})
vouchers = load("vouchers.json", {"500":[],"1000":[],"2000":[],"4000":[]})
admin_state = {}

# ---------------- HELPERS ----------------
def get_user(uid):
    uid = str(uid)
    if uid not in users:
        users[uid] = {
            "balance":0,
            "refers":[],
            "started":False,
            "referred_by":None
        }
        save("users.json", users)
    return users[uid]

def is_admin(uid):
    return int(uid) in ADMINS

def check_join(uid):
    for ch in CHANNELS:
        try:
            status = bot.get_chat_member(ch, uid).status
            if status in ["left","kicked"]:
                return False
        except:
            return False
    return True

def force_join(chat_id):
    kb = types.InlineKeyboardMarkup()
    for c in CHANNELS:
        kb.add(types.InlineKeyboardButton(
            f"Join {c}",
            url=f"https://t.me/{c.replace('@','')}"
        ))
    kb.add(types.InlineKeyboardButton("✅ I Joined",callback_data="verify"))
    bot.send_message(chat_id,"🔒 Join all channels first:",reply_markup=kb)

def menu(chat_id):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("👤 Profile","🎁 Redeem")
    kb.row("🔗 Refer","❓ Help")
    bot.send_message(chat_id,"✅ Bot Ready",reply_markup=kb)

# ---------------- START ----------------
@bot.message_handler(commands=["start"])
def start(m):
    uid = str(m.from_user.id)
    u = get_user(uid)
    args = m.text.split()

    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    # First time referral only
    if not u["started"]:
        u["started"] = True

        if len(args) > 1:
            ref_id = args[1]
            if ref_id != uid and ref_id in users:
                if u["referred_by"] is None:
                    u["referred_by"] = ref_id
                    ref_user = get_user(ref_id)
                    ref_user["balance"] += 1
                    ref_user["refers"].append(uid)

                    bot.send_message(int(ref_id),
                        f"🎉 New Valid Referral!\n👤 {m.from_user.first_name}\n💎 +1 Point"
                    )
    else:
        bot.send_message(m.chat.id,
            "⚠️ You already used this bot.\nBut you can continue using it."
        )

    save("users.json", users)
    menu(m.chat.id)

# ---------------- VERIFY ----------------
@bot.callback_query_handler(func=lambda c:c.data=="verify")
def verify(c):
    if check_join(c.from_user.id):
        bot.answer_callback_query(c.id,"✅ Verified")
        menu(c.from_user.id)
    else:
        bot.answer_callback_query(c.id,"❌ Join all channels",True)

# ---------------- JOIN CHECK ----------------
def join_required(func):
    def wrapper(m):
        if not check_join(m.from_user.id):
            force_join(m.chat.id)
            return
        return func(m)
    return wrapper

# ---------------- USER ----------------
@bot.message_handler(func=lambda m:m.text=="👤 Profile")
@join_required
def profile(m):
    u = get_user(m.from_user.id)
    bot.send_message(m.chat.id,
        f"👤 Profile\n\n"
        f"💎 Balance: {u['balance']}\n"
        f"👥 Refers: {len(u['refers'])}\n\n"
        f"🔗 Referral:\n"
        f"https://t.me/{bot.get_me().username}?start={m.from_user.id}"
    )

@bot.message_handler(func=lambda m:m.text=="🔗 Refer")
@join_required
def refer(m):
    bot.send_message(m.chat.id,
        f"Invite:\nhttps://t.me/{bot.get_me().username}?start={m.from_user.id}"
    )

@bot.message_handler(func=lambda m:m.text=="❓ Help")
@join_required
def help_(m):
    bot.send_message(m.chat.id,
        "1️⃣ Join channels\n2️⃣ Refer friends\n3️⃣ Redeem vouchers"
    )

# ---------------- REDEEM ----------------
@bot.message_handler(func=lambda m:m.text=="🎁 Redeem")
@join_required
def redeem_menu(m):
    kb = types.InlineKeyboardMarkup()
    for amt,pts in REDEEM_POINTS.items():
        kb.add(types.InlineKeyboardButton(
            f"₹{amt} – {pts}💎",
            callback_data=f"redeem_{amt}"
        ))
    bot.send_message(m.chat.id,"Choose voucher:",reply_markup=kb)

@bot.callback_query_handler(func=lambda c:c.data.startswith("redeem_"))
def redeem(c):
    if not check_join(c.from_user.id):
        bot.answer_callback_query(c.id,"Join channels first",True)
        return

    amt = c.data.split("_")[1]
    u = get_user(c.from_user.id)
    need = REDEEM_POINTS[int(amt)]

    if u["balance"] < need:
        bot.answer_callback_query(c.id,"Insufficient balance",True)
        return

    if len(vouchers[amt]) == 0:
        bot.answer_callback_query(c.id,"Out of stock",True)
        return

    code = vouchers[amt].pop(0)
    u["balance"] -= need

    save("users.json",users)
    save("vouchers.json",vouchers)

    bot.send_message(c.from_user.id,
        f"🎉 Redeemed ₹{amt}\n🎟 <code>{code}</code>"
    )

# ---------------- ADMIN PANEL ----------------
@bot.message_handler(commands=["adminpanel"])
def adminpanel(m):
    if not is_admin(m.from_user.id): return

    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("➕ Add Balance","➖ Remove Balance")
    kb.row("🎟 Add Coupons","📊 Voucher Stats")
    kb.row("📈 Leaderboard","📢 Broadcast")

    bot.send_message(m.chat.id,"🛠 Admin Panel",reply_markup=kb)

# -------- ADMIN COMMANDS --------
@bot.message_handler(func=lambda m:m.text=="➕ Add Balance")
def add_balance(m):
    if not is_admin(m.from_user.id): return
    admin_state[m.from_user.id] = "ADD_BAL"
    bot.send_message(m.chat.id,"Send: USER_ID AMOUNT")

@bot.message_handler(func=lambda m:m.text=="➖ Remove Balance")
def remove_balance(m):
    if not is_admin(m.from_user.id): return
    admin_state[m.from_user.id] = "REM_BAL"
    bot.send_message(m.chat.id,"Send: USER_ID AMOUNT")

@bot.message_handler(func=lambda m:m.text=="🎟 Add Coupons")
def add_coupons(m):
    if not is_admin(m.from_user.id): return
    admin_state[m.from_user.id] = "ADD_CP"
    bot.send_message(m.chat.id,"Send:\nAMOUNT\nCOUPON1\nCOUPON2...")

@bot.message_handler(func=lambda m:m.text=="📈 Leaderboard")
def leaderboard(m):
    if not is_admin(m.from_user.id): return
    top = sorted(users.items(),
                 key=lambda x: x[1]["balance"],
                 reverse=True)[:10]

    text = "🏆 Leaderboard\n\n"
    for i,(uid,data) in enumerate(top,1):
        text += f"{i}. {uid} — 💎 {data['balance']}\n"

    bot.send_message(m.chat.id,text)

@bot.message_handler(func=lambda m:m.text=="📊 Voucher Stats")
def voucher_stats(m):
    if not is_admin(m.from_user.id): return
    text = "Voucher Stock:\n\n"
    for k,v in vouchers.items():
        text += f"₹{k}: {len(v)}\n"
    bot.send_message(m.chat.id,text)

@bot.message_handler(func=lambda m:m.text=="📢 Broadcast")
def broadcast(m):
    if not is_admin(m.from_user.id): return
    admin_state[m.from_user.id] = "BC"
    bot.send_message(m.chat.id,"Send broadcast message")

# -------- ADMIN INPUT HANDLER --------
@bot.message_handler(func=lambda m:m.from_user.id in admin_state)
def admin_input(m):
    state = admin_state[m.from_user.id]

    if state == "ADD_BAL":
        uid, amt = m.text.split()
        get_user(uid)["balance"] += int(amt)
        save("users.json",users)

    elif state == "REM_BAL":
        uid, amt = m.text.split()
        get_user(uid)["balance"] = max(
            0,
            get_user(uid)["balance"] - int(amt)
        )
        save("users.json",users)

    elif state == "ADD_CP":
        lines = m.text.splitlines()
        amt = lines[0]
        for c in lines[1:]:
            vouchers[amt].append(c.strip())
        save("vouchers.json",vouchers)

    elif state == "BC":
        for uid in users:
            try:
                bot.send_message(uid,m.text)
            except:
                pass

    admin_state.pop(m.from_user.id)
    bot.send_message(m.chat.id,"✅ Done")

print("Bot Running...")
bot.infinity_polling()
