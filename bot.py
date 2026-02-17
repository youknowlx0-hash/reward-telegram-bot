import telebot
from telebot import types
import sqlite3
import os
from config import ADMINS, CHANNELS, REDEEM_POINTS

BOT_TOKEN = os.getenv("BOT_TOKEN")
bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# ---------------- DATABASE ----------------

conn = sqlite3.connect("database.db", check_same_thread=False)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    referred_by TEXT,
    redeemed INTEGER DEFAULT 0
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS referrals (
    referrer TEXT,
    referred TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS vouchers (
    amount TEXT,
    code TEXT
)
""")

conn.commit()

# ---------------- USER SYSTEM ----------------

def get_user(uid):
    uid = str(uid)
    cursor.execute("SELECT * FROM users WHERE user_id=?", (uid,))
    user = cursor.fetchone()

    if not user:
        cursor.execute("INSERT INTO users (user_id) VALUES (?)", (uid,))
        conn.commit()

    cursor.execute("SELECT * FROM users WHERE user_id=?", (uid,))
    return cursor.fetchone()

def is_admin(uid):
    return int(uid) in ADMINS

# ---------------- CHANNEL CHECK ----------------

def check_join(uid):
    for ch in CHANNELS:
        try:
            member = bot.get_chat_member(ch, uid)
            if member.status in ["left", "kicked"]:
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
        "Join all channels to continue.",
        reply_markup=kb
    )

# ---------------- MENU ----------------

def menu(chat_id):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("👤 My Profile","🎁 Redeem")
    kb.row("🔗 Invite","📊 Stats")
    bot.send_message(chat_id, "Select option:", reply_markup=kb)

# ---------------- START ----------------

@bot.message_handler(commands=["start"])
def start(m):
    uid = str(m.from_user.id)
    args = m.text.split()

    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    get_user(uid)

    if len(args) > 1:
        ref_id = args[1]

        if ref_id != uid:
            cursor.execute("SELECT referred_by FROM users WHERE user_id=?", (uid,))
            already = cursor.fetchone()[0]

            if already is None:
                cursor.execute("UPDATE users SET referred_by=? WHERE user_id=?", (ref_id, uid))
                cursor.execute("INSERT INTO referrals (referrer,referred) VALUES (?,?)", (ref_id, uid))
                cursor.execute("UPDATE users SET balance=balance+1 WHERE user_id=?", (ref_id,))
                conn.commit()

    menu(m.chat.id)

# ---------------- PROFILE ----------------

@bot.message_handler(func=lambda m:m.text=="👤 My Profile")
def profile(m):
    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    uid = str(m.from_user.id)
    cursor.execute("SELECT balance, redeemed FROM users WHERE user_id=?", (uid,))
    data = cursor.fetchone()

    cursor.execute("SELECT COUNT(*) FROM referrals WHERE referrer=?", (uid,))
    ref_count = cursor.fetchone()[0]

    bot.send_message(
        m.chat.id,
        f"Points: {data[0]}\n"
        f"Referrals: {ref_count}\n"
        f"Redeemed: {data[1]}\n\n"
        f"https://t.me/{bot.get_me().username}?start={uid}"
    )

# ---------------- REDEEM ----------------

@bot.message_handler(func=lambda m:m.text=="🎁 Redeem")
def redeem_menu(m):
    kb = types.InlineKeyboardMarkup()
    for amt,pts in REDEEM_POINTS.items():
        kb.add(types.InlineKeyboardButton(
            f"₹{amt} - {pts} pts",
            callback_data=f"redeem_{amt}"
        ))
    bot.send_message(m.chat.id,"Select reward:",reply_markup=kb)

@bot.callback_query_handler(func=lambda c:c.data.startswith("redeem_"))
def redeem(c):
    if not check_join(c.from_user.id):
        bot.answer_callback_query(c.id,"Join first",True)
        return

    amt = c.data.split("_")[1]
    uid = str(c.from_user.id)

    need = REDEEM_POINTS[int(amt)]

    cursor.execute("SELECT balance FROM users WHERE user_id=?", (uid,))
    balance = cursor.fetchone()[0]

    if balance < need:
        bot.answer_callback_query(c.id,"Not enough points",True)
        return

    cursor.execute("SELECT code FROM vouchers WHERE amount=? LIMIT 1", (amt,))
    row = cursor.fetchone()

    if not row:
        bot.answer_callback_query(c.id,"Out of stock",True)
        return

    code = row[0]

    cursor.execute("DELETE FROM vouchers WHERE code=?", (code,))
    cursor.execute("UPDATE users SET balance=balance-?, redeemed=redeemed+1 WHERE user_id=?", (need, uid))
    conn.commit()

    bot.send_message(c.from_user.id,f"Your Code:\n<code>{code}</code>")

# ---------------- ADMIN ADD CODE ----------------

@bot.message_handler(commands=["addcode"])
def addcode(m):
    if not is_admin(m.from_user.id):
        return

    try:
        _, amt, code = m.text.split(maxsplit=2)
        cursor.execute("INSERT INTO vouchers (amount,code) VALUES (?,?)", (amt, code))
        conn.commit()
        bot.reply_to(m,"Added ✅")
    except:
        bot.reply_to(m,"Usage: /addcode 500 CODE123")

# ---------------- RUN ----------------

print("Bot Running...")
bot.infinity_polling(skip_pending=True)
