import telebot
from telebot import types
import sqlite3
from config import *

bot = telebot.TeleBot(BOT_TOKEN)

conn = sqlite3.connect("data.db", check_same_thread=False)
cursor = conn.cursor()

# ---------------- DATABASE ----------------

cursor.execute("""CREATE TABLE IF NOT EXISTS users(
    user_id INTEGER PRIMARY KEY,
    points INTEGER DEFAULT 0,
    referrals INTEGER DEFAULT 0,
    referred_by INTEGER DEFAULT 0
)""")

cursor.execute("""CREATE TABLE IF NOT EXISTS vouchers(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount INTEGER,
    code TEXT,
    used INTEGER DEFAULT 0
)""")

cursor.execute("""CREATE TABLE IF NOT EXISTS tasks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT
)""")

conn.commit()

# ---------------- FORCE JOIN ----------------

def check_join(user_id):
    try:
        member = bot.get_chat_member(CHANNEL_USERNAME, user_id)
        return member.status in ["member", "administrator", "creator"]
    except:
        return False

# ---------------- START ----------------

@bot.message_handler(commands=['start'])
def start(message):
    user_id = message.from_user.id
    args = message.text.split()

    if not check_join(user_id):
        markup = types.InlineKeyboardMarkup()
        markup.add(types.InlineKeyboardButton("🔗 JOIN CHANNEL", url=f"https://t.me/{CHANNEL_USERNAME.replace('@','')}"))
        bot.send_message(user_id, "⚠ Join Channel First To Use Bot", reply_markup=markup)
        return

    cursor.execute("SELECT * FROM users WHERE user_id=?", (user_id,))
    if not cursor.fetchone():
        referred_by = 0
        if len(args) > 1:
            ref_id = int(args[1])
            if ref_id != user_id:
                cursor.execute("SELECT * FROM users WHERE user_id=?", (ref_id,))
                if cursor.fetchone():
                    referred_by = ref_id
                    cursor.execute("UPDATE users SET points=points+1, referrals=referrals+1 WHERE user_id=?", (ref_id,))
                    bot.send_message(ref_id, "🎉 New Referral Joined! +1 💎")

        cursor.execute("INSERT INTO users(user_id, referred_by) VALUES(?,?)", (user_id, referred_by))
        conn.commit()

    main_menu(message)

# ---------------- MAIN MENU ----------------

def main_menu(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row("👤 Profile", "👥 Refer")
    markup.row("🎁 Redeem", "📊 Bot Stats")
    markup.row("📋 Task", "❓ Help")

    if message.from_user.id in ADMINS:
        markup.row("⚙ Admin Panel")

    bot.send_message(message.chat.id, "👾 WELCOME TO DARK REWARD SYSTEM 👾", reply_markup=markup)

# ---------------- PROFILE ----------------

@bot.message_handler(func=lambda m: m.text == "👤 Profile")
def profile(message):
    if not check_join(message.from_user.id):
        bot.send_message(message.chat.id, "Join Channel First ⚠")
        return

    cursor.execute("SELECT points, referrals FROM users WHERE user_id=?", (message.from_user.id,))
    data = cursor.fetchone()

    bot.send_message(message.chat.id, f"""
👾 DARK PROFILE 👾
━━━━━━━━━━━━━━
💎 Points: {data[0]}
👥 Total Refers: {data[1]}
🆔 User ID: {message.from_user.id}
━━━━━━━━━━━━━━
""")

# ---------------- REFER ----------------

@bot.message_handler(func=lambda m: m.text == "👥 Refer")
def refer(message):
    link = f"https://t.me/{bot.get_me().username}?start={message.from_user.id}"
    bot.send_message(message.chat.id, f"""
👾 INVITE & EARN 💎

Your Link:
{link}

Earn 1 💎 Per Referral
""")

# ---------------- REDEEM ----------------

@bot.message_handler(func=lambda m: m.text == "🎁 Redeem")
def redeem(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row("₹500 (4💎)")
    markup.row("₹1000 (10💎)")
    markup.row("₹2000 (20💎)")
    markup.row("₹4000 (40💎)")
    markup.row("🔙 Back")
    bot.send_message(message.chat.id, "Select Voucher:", reply_markup=markup)

voucher_prices = {
    500:4,
    1000:10,
    2000:20,
    4000:40
}

@bot.message_handler(func=lambda m: "₹" in m.text)
def process_redeem(message):
    amount = int(m.text.split("₹")[1].split()[0])
    cost = voucher_prices[amount]

    cursor.execute("SELECT points FROM users WHERE user_id=?", (message.from_user.id,))
    points = cursor.fetchone()[0]

    if points < cost:
        bot.send_message(message.chat.id, "❌ Need Minimum Points!")
        return

    cursor.execute("SELECT id, code FROM vouchers WHERE amount=? AND used=0 LIMIT 1", (amount,))
    voucher = cursor.fetchone()

    if not voucher:
        bot.send_message(message.chat.id, "❌ Out Of Stock!")
        return

    cursor.execute("UPDATE vouchers SET used=1 WHERE id=?", (voucher[0],))
    cursor.execute("UPDATE users SET points=points-? WHERE user_id=?", (cost, message.from_user.id))
    conn.commit()

    bot.send_message(message.chat.id, f"🎉 Voucher Redeemed!\nCode: `{voucher[1]}`", parse_mode="Markdown")

# ---------------- ADMIN PANEL ----------------

@bot.message_handler(func=lambda m: m.text == "⚙ Admin Panel")
def admin_panel(message):
    if message.from_user.id not in ADMINS:
        return

    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row("➕ Add Balance", "➖ Remove Balance")
    markup.row("🎫 Add Voucher", "📦 Voucher Stats")
    markup.row("📢 Broadcast", "➕ Add Task")
    markup.row("🔙 Back")

    bot.send_message(message.chat.id, "ADMIN CONTROL PANEL", reply_markup=markup)

# -------- ADD BALANCE --------

@bot.message_handler(func=lambda m: m.text == "➕ Add Balance")
def add_balance(message):
    msg = bot.send_message(message.chat.id, "Send: user_id amount")
    bot.register_next_step_handler(msg, process_add_balance)

def process_add_balance(message):
    user_id, amount = map(int, message.text.split())
    cursor.execute("UPDATE users SET points=points+? WHERE user_id=?", (amount, user_id))
    conn.commit()
    bot.send_message(message.chat.id, "Balance Added ✅")

# -------- REMOVE BALANCE --------

@bot.message_handler(func=lambda m: m.text == "➖ Remove Balance")
def remove_balance(message):
    msg = bot.send_message(message.chat.id, "Send: user_id amount")
    bot.register_next_step_handler(msg, process_remove_balance)

def process_remove_balance(message):
    user_id, amount = map(int, message.text.split())
    cursor.execute("UPDATE users SET points=points-? WHERE user_id=?", (amount, user_id))
    conn.commit()
    bot.send_message(message.chat.id, "Balance Removed ✅")

# -------- ADD VOUCHER --------

@bot.message_handler(func=lambda m: m.text == "🎫 Add Voucher")
def add_voucher(message):
    msg = bot.send_message(message.chat.id, "Send: amount code")
    bot.register_next_step_handler(msg, process_add_voucher)

def process_add_voucher(message):
    amount, code = message.text.split()
    cursor.execute("INSERT INTO vouchers(amount, code) VALUES(?,?)", (int(amount), code))
    conn.commit()
    bot.send_message(message.chat.id, "Voucher Added ✅")

# -------- VOUCHER STATS --------

@bot.message_handler(func=lambda m: m.text == "📦 Voucher Stats")
def voucher_stats(message):
    cursor.execute("SELECT amount, COUNT(*) FROM vouchers WHERE used=0 GROUP BY amount")
    data = cursor.fetchall()
    text = "📊 Voucher Stats\n"
    for row in data:
        text += f"₹{row[0]} : {row[1]} codes\n"
    bot.send_message(message.chat.id, text)

# -------- BROADCAST --------

@bot.message_handler(func=lambda m: m.text == "📢 Broadcast")
def broadcast(message):
    msg = bot.send_message(message.chat.id, "Send Broadcast Message")
    bot.register_next_step_handler(msg, process_broadcast)

def process_broadcast(message):
    cursor.execute("SELECT user_id FROM users")
    users = cursor.fetchall()
    for user in users:
        try:
            bot.send_message(user[0], message.text)
        except:
            pass
    bot.send_message(message.chat.id, "Broadcast Sent ✅")

# -------- HELP --------

@bot.message_handler(func=lambda m: m.text == "❓ Help")
def help_menu(message):
    bot.send_message(message.chat.id, """
👾 HOW TO USE BOT 👾

1️⃣ Join Channel
2️⃣ Refer Friends
3️⃣ Earn 💎 Points
4️⃣ Redeem Rewards

Stay Active & Earn More 😈
""")

# ---------------- RUN ----------------

print("Bot Running...")
bot.infinity_polling()
