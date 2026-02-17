import telebot
from telebot import types
import sqlite3
import config
import datetime

bot = telebot.TeleBot(config.BOT_TOKEN, parse_mode="HTML")

conn = sqlite3.connect("data.db", check_same_thread=False)
cur = conn.cursor()

# ---------------- DATABASE ----------------

cur.execute("""
CREATE TABLE IF NOT EXISTS users(
    user_id TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    referred_by TEXT,
    joined INTEGER DEFAULT 1
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS vouchers(
    amount TEXT,
    code TEXT
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS tasks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    reward INTEGER
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS submissions(
    user_id TEXT,
    task_id INTEGER,
    status TEXT
)
""")

conn.commit()

# ---------------- UTIL ----------------

def is_admin(uid):
    return uid in config.ADMINS

def check_join(uid):
    for ch in config.CHANNELS:
        try:
            member = bot.get_chat_member(ch, uid)
            if member.status in ["left", "kicked"]:
                return False
        except:
            return False
    return True

def force_join(chat_id):
    kb = types.InlineKeyboardMarkup()
    for ch in config.CHANNELS:
        kb.add(types.InlineKeyboardButton("Join Channel", url=f"https://t.me/{ch.replace('@','')}"))
    kb.add(types.InlineKeyboardButton("Verify", callback_data="verify"))
    bot.send_message(chat_id, "⚠️ Join channel first.", reply_markup=kb)

def main_menu(chat_id):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("👤 Profile","🔗 Refer")
    kb.row("🎁 Redeem","📋 Task & Earn")
    kb.row("📊 Bot Stats","❓ Help")
    bot.send_message(chat_id,"<b>⚡ HACKER REWARD SYSTEM ⚡</b>",reply_markup=kb)

# ---------------- START ----------------

@bot.message_handler(commands=['start'])
def start(m):
    uid = str(m.from_user.id)
    args = m.text.split()

    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    cur.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)",(uid,))
    conn.commit()

    # Referral
    if len(args) > 1:
        ref = args[1]
        if ref != uid:
            cur.execute("SELECT referred_by FROM users WHERE user_id=?", (uid,))
            if cur.fetchone()[0] is None:
                cur.execute("UPDATE users SET referred_by=? WHERE user_id=?", (ref, uid))
                cur.execute("UPDATE users SET balance=balance+1 WHERE user_id=?", (ref,))
                conn.commit()
                try:
                    bot.send_message(ref,"🎉 You earned 1 💎 from referral!")
                except:
                    pass

    main_menu(m.chat.id)

# ---------------- PROFILE ----------------

@bot.message_handler(func=lambda m: m.text=="👤 Profile")
def profile(m):
    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    uid=str(m.from_user.id)
    cur.execute("SELECT balance FROM users WHERE user_id=?", (uid,))
    bal=cur.fetchone()[0]
    bot.send_message(m.chat.id,f"👤 ID: {uid}\n💎 Points: {bal}")

# ---------------- REFER ----------------

@bot.message_handler(func=lambda m: m.text=="🔗 Refer")
def refer(m):
    uid=str(m.from_user.id)
    link=f"https://t.me/{bot.get_me().username}?start={uid}"
    bot.send_message(m.chat.id,f"🔗 Your Referral Link:\n{link}")

# ---------------- REDEEM ----------------

@bot.message_handler(func=lambda m: m.text=="🎁 Redeem")
def redeem_menu(m):
    if not check_join(m.from_user.id):
        force_join(m.chat.id)
        return

    kb=types.InlineKeyboardMarkup()
    for amt,cost in config.VOUCHER_COST.items():
        kb.add(types.InlineKeyboardButton(
            f"₹{amt} - {cost} 💎",
            callback_data=f"redeem_{amt}"
        ))
    bot.send_message(m.chat.id,"Select voucher:",reply_markup=kb)

@bot.callback_query_handler(func=lambda c:c.data.startswith("redeem_"))
def redeem(c):
    amt=c.data.split("_")[1]
    uid=str(c.from_user.id)

    cur.execute("SELECT balance FROM users WHERE user_id=?", (uid,))
    bal=cur.fetchone()[0]

    cost=config.VOUCHER_COST[amt]

    if bal < cost:
        bot.answer_callback_query(c.id,"Need minimum points!",True)
        return

    cur.execute("SELECT code FROM vouchers WHERE amount=? LIMIT 1",(amt,))
    data=cur.fetchone()

    if not data:
        bot.answer_callback_query(c.id,"Out of Stock!",True)
        return

    code=data[0]

    cur.execute("DELETE FROM vouchers WHERE code=?",(code,))
    cur.execute("UPDATE users SET balance=balance-? WHERE user_id=?",(cost,uid))
    conn.commit()

    bot.send_message(uid,f"🎉 Voucher ₹{amt}\nCode: {code}")

# ---------------- TASK SYSTEM ----------------

@bot.message_handler(func=lambda m: m.text=="📋 Task & Earn")
def task_list(m):
    cur.execute("SELECT id,text,reward FROM tasks")
    tasks=cur.fetchall()

    if not tasks:
        bot.send_message(m.chat.id,"No tasks available.")
        return

    for t in tasks:
        kb=types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton("Submit",callback_data=f"task_{t[0]}"))
        bot.send_message(m.chat.id,f"{t[1]}\nReward: {t[2]} 💎",reply_markup=kb)

# ---------------- ADMIN PANEL ----------------

@bot.message_handler(commands=['admin'])
def admin(m):
    if not is_admin(m.from_user.id): return

    kb=types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("Add Balance","Remove Balance")
    kb.row("Add Voucher","Voucher Stats")
    kb.row("Broadcast","Add Task")
    bot.send_message(m.chat.id,"Admin Panel",reply_markup=kb)

# (Admin handlers yahan add kar sakte ho similar pattern se)

# ---------------- BOT STATS ----------------

@bot.message_handler(func=lambda m:m.text=="📊 Bot Stats")
def stats(m):
    cur.execute("SELECT COUNT(*) FROM users")
    total=cur.fetchone()[0]
    bot.send_message(m.chat.id,f"Total Users: {total}")

# ---------------- VERIFY ----------------

@bot.callback_query_handler(func=lambda c:c.data=="verify")
def verify(c):
    if check_join(c.from_user.id):
        bot.answer_callback_query(c.id,"Access Granted")
        main_menu(c.from_user.id)
    else:
        bot.answer_callback_query(c.id,"Join first!",True)

print("Bot Running...")
bot.infinity_polling()
