import telebot
from telebot import types
import json, os
from config import ADMINS, CHANNELS, REDEEM_POINTS

BOT_TOKEN = os.getenv("BOT_TOKEN")
bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# ---------------- FILE SYSTEM ----------------
def load(file, default):
    if not os.path.exists(file):
        with open(file,"w") as f:
            json.dump(default,f)
    with open(file) as f:
        return json.load(f)

def save(file,data):
    with open(file,"w") as f:
        json.dump(data,f,indent=2)

users = load("users.json", {})
vouchers = load("vouchers.json", {"500":[],"1000":[],"2000":[],"4000":[]})
admin_state = {}

# ---------------- USER SYSTEM ----------------
def get_user(uid):
    uid = str(uid)
    if uid not in users:
        users[uid] = {
            "balance":0,
            "refers":[],
            "referred_by":None,
            "redeemed":0
        }
        save("users.json", users)
    return users[uid]

def is_admin(uid):
    return int(uid) in ADMINS

# ---------------- CHANNEL CHECK ----------------
def check_join(uid):
    for ch in CHANNELS:
        try:
            member = bot.get_chat_member(ch, uid)
            if member.status in ["left","kicked"]:
                return False
        except:
            return False
    return True

def force_join(chat_id):
    kb = types.InlineKeyboardMarkup()
    for ch in CHANNELS:
        kb.add(types.InlineKeyboardButton(
            f"🟢 JOIN {ch}",
            url=f"https://t.me/{ch.replace('@','')}"
        ))
    kb.add(types.InlineKeyboardButton("⚡ VERIFY ACCESS", callback_data="verify"))
    bot.send_message(
        chat_id,
        "🌑 <b>NEON ACCESS LOCKED</b>\n\n"
        "🟢 Join all official channels to unlock the system.",
        reply_markup=kb
    )

# ---------------- MENU ----------------
def menu(chat_id):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("👤 ᴍʏ ᴘʀᴏꜰɪʟᴇ","🎁 ʀᴇᴅᴇᴇᴍ")
    kb.row("🔗 ɪɴᴠɪᴛᴇ","📊 ꜱᴛᴀᴛꜱ")
    kb.row("❓ ꜱᴜᴘᴘᴏʀᴛ")
    bot.send_message(
        chat_id,
        "🌑 <b>DARK NEON REWARDS SYSTEM</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "🟢 Status: <b>ONLINE</b>\n"
        "⚡ Select command below:",
        reply_markup=kb
    )

# ---------------- START ----------------
@bot.message_handler(commands=["start"])
def start(m):
    uid = str(m.from_user.id)
    user = get_user(uid)
    args = m.text.split()

    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    if len(args) > 1:
        ref_id = args[1]

        if ref_id != uid and user["referred_by"] is None:
            ref_user = get_user(ref_id)

            if uid not in ref_user["refers"]:
                user["referred_by"] = ref_id
                ref_user["refers"].append(uid)
                ref_user["balance"] += 1

                save("users.json", users)

                try:
                    bot.send_message(
                        int(ref_id),
                        f"🟢 <b>NEW REFERRAL DETECTED</b>\n"
                        f"👤 {m.from_user.first_name}\n"
                        f"⚡ +1 POINT ADDED"
                    )
                except:
                    pass

    save("users.json", users)
    menu(m.chat.id)

# ---------------- VERIFY ----------------
@bot.callback_query_handler(func=lambda c:c.data=="verify")
def verify(c):
    if check_join(c.from_user.id):
        bot.answer_callback_query(c.id,"🟢 ACCESS GRANTED")
        menu(c.from_user.id)
    else:
        bot.answer_callback_query(c.id,"🔴 ACCESS DENIED",True)

# ---------------- JOIN DECORATOR ----------------
def join_required(func):
    def wrapper(m):
        if not check_join(m.from_user.id):
            force_join(m.chat.id)
            return
        return func(m)
    return wrapper

# ---------------- PROFILE ----------------
@bot.message_handler(func=lambda m:m.text=="👤 ᴍʏ ᴘʀᴏꜰɪʟᴇ")
@join_required
def profile(m):
    u = get_user(m.from_user.id)

    bot.send_message(
        m.chat.id,
        "🌑 <b>USER TERMINAL</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"🟢 POINTS: <b>{u['balance']}</b>\n"
        f"👥 REFERRALS: <b>{len(u['refers'])}</b>\n"
        f"🎁 REDEEMED: <b>{u['redeemed']}</b>\n\n"
        "🔗 INVITE LINK:\n"
        f"https://t.me/{bot.get_me().username}?start={m.from_user.id}"
    )

# ---------------- REFER ----------------
@bot.message_handler(func=lambda m:m.text=="🔗 ɪɴᴠɪᴛᴇ")
@join_required
def refer(m):
    bot.send_message(
        m.chat.id,
        "⚡ <b>INVITE PROTOCOL ACTIVE</b>\n\n"
        "Share link to earn points:\n"
        f"https://t.me/{bot.get_me().username}?start={m.from_user.id}"
    )

# ---------------- STATS ----------------
@bot.message_handler(func=lambda m:m.text=="📊 ꜱᴛᴀᴛꜱ")
@join_required
def stats(m):
    total_users = len(users)
    total_redeemed = 0
    users_redeemed = 0

    for u in users.values():
        if u.get("redeemed",0) > 0:
            users_redeemed += 1
            total_redeemed += u.get("redeemed",0)

    bot.send_message(
        m.chat.id,
        "🌑 <b>GLOBAL SYSTEM STATS</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👥 USERS: <b>{total_users}</b>\n"
        f"🎁 TOTAL REDEEMED: <b>{total_redeemed}</b>\n"
        f"🟢 ACTIVE REDEEMERS: <b>{users_redeemed}</b>"
    )

# ---------------- REDEEM ----------------
@bot.message_handler(func=lambda m:m.text=="🎁 ʀᴇᴅᴇᴇᴍ")
@join_required
def redeem_menu(m):
    kb = types.InlineKeyboardMarkup()
    for amt,pts in REDEEM_POINTS.items():
        kb.add(types.InlineKeyboardButton(
            f"🟢 ₹{amt}  ⚡ {pts} PTS",
            callback_data=f"redeem_{amt}"
        ))
    bot.send_message(
        m.chat.id,
        "🎁 <b>SELECT REWARD MODULE</b>",
        reply_markup=kb
    )

@bot.callback_query_handler(func=lambda c:c.data.startswith("redeem_"))
def redeem(c):

    if not check_join(c.from_user.id):
        bot.answer_callback_query(c.id,"Join channels first",True)
        return

    amt = c.data.split("_")[1]
    u = get_user(c.from_user.id)
    need = REDEEM_POINTS[int(amt)]

    if u["balance"] < need:
        bot.answer_callback_query(c.id,"🔴 INSUFFICIENT POINTS",True)
        return

    if len(vouchers[amt]) == 0:
        bot.answer_callback_query(c.id,"⚠ OUT OF STOCK",True)
        return

    code = vouchers[amt].pop(0)
    u["balance"] -= need
    u["redeemed"] += 1

    save("users.json",users)
    save("vouchers.json",vouchers)

    bot.send_message(
        c.from_user.id,
        "🟢 <b>REWARD UNLOCKED</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"💳 AMOUNT: ₹{amt}\n"
        f"🎟 CODE:\n<code>{code}</code>"
    )

print("Dark Neon Bot Running...")
bot.infinity_polling()
