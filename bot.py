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
            f"Join {ch}",
            url=f"https://t.me/{ch.replace('@','')}"
        ))
    kb.add(types.InlineKeyboardButton("✅ I Joined", callback_data="verify"))
    bot.send_message(chat_id,"🔒 Please join all channels:", reply_markup=kb)

# ---------------- MENU ----------------
def menu(chat_id):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("👤 Profile","🎁 Redeem")
    kb.row("🔗 Refer","📊 Stats")
    kb.row("❓ Help")
    bot.send_message(chat_id,"✅ Bot Ready",reply_markup=kb)

# ---------------- START ----------------
@bot.message_handler(commands=["start"])
def start(m):
    uid = str(m.from_user.id)
    user = get_user(uid)
    args = m.text.split()

    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    # Referral Logic
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
                        f"🎉 New Referral!\n👤 {m.from_user.first_name}\n💎 +1 Point"
                    )
                except:
                    pass

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

# ---------------- JOIN DECORATOR ----------------
def join_required(func):
    def wrapper(m):
        if not check_join(m.from_user.id):
            force_join(m.chat.id)
            return
        return func(m)
    return wrapper

# ---------------- PROFILE ----------------
@bot.message_handler(func=lambda m:m.text=="👤 Profile")
@join_required
def profile(m):
    u = get_user(m.from_user.id)

    bot.send_message(
        m.chat.id,
        f"👤 Profile\n\n"
        f"💎 Balance: {u['balance']}\n"
        f"👥 Refers: {len(u['refers'])}\n"
        f"🎁 Redeemed: {u['redeemed']}\n\n"
        f"🔗 Referral:\n"
        f"https://t.me/{bot.get_me().username}?start={m.from_user.id}"
    )

# ---------------- REFER ----------------
@bot.message_handler(func=lambda m:m.text=="🔗 Refer")
@join_required
def refer(m):
    bot.send_message(
        m.chat.id,
        f"Invite Link:\nhttps://t.me/{bot.get_me().username}?start={m.from_user.id}"
    )

# ---------------- PUBLIC STATS ----------------
@bot.message_handler(func=lambda m:m.text=="📊 Stats")
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
        f"📊 BOT STATS\n\n"
        f"👥 Total Users: {total_users}\n"
        f"🎁 Total Vouchers Redeemed: {total_redeemed}\n"
        f"👤 Users Redeemed: {users_redeemed}"
    )

# ---------------- HELP ----------------
@bot.message_handler(func=lambda m:m.text=="❓ Help")
@join_required
def help_(m):
    bot.send_message(m.chat.id,"Refer friends and redeem vouchers.")

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
    u["redeemed"] += 1

    save("users.json",users)
    save("vouchers.json",vouchers)

    bot.send_message(
        c.from_user.id,
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

print("Bot Running...")
bot.infinity_polling()
