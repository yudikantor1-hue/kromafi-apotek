import os

import requests

# Chat ID from @userinfobot
CHAT_ID = "5388443198"


def send_telegram_message(message):
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not bot_token:
        raise RuntimeError("Set the TELEGRAM_BOT_TOKEN environment variable before sending a message.")

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": message}
    response = requests.post(url, data=payload)
    return response.json()


pesan = "cek komputermu pak"


if __name__ == "__main__":
    hasil = send_telegram_message(pesan)
    if hasil.get("ok"):
        print("Pesan berhasil terkirim ke Telegram!")
    else:
        print("Gagal mengirim pesan:", hasil)