# Union-Bot-Telegram
## Complete Union Bot Telegram Installation Guide

## 1. Clone Repository Union

```bash
git clone https://github.com/nicomunasatya/Union-Bot-Telegram.git
mv Union-Bot-Telegram Union
cd Union
```

---

## 2. Instal Node Version Manager (NVM)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
```

## 3. Install Node.js Version 20

```bash
nvm install 20
nvm alias default 20
```

---

## 4. Installation Verification

```bash
node -v
npm -v
```

## 5. Install npm (if not available yet)

```bash
sudo apt install npm
```

## 6. Initialization and Installation of Dependencies

```bash
npm init -y
npm install ethers axios moment-timezone readline node-telegram-bot-api dotenv
```

## 7. Create Bot and Get Token from BotFather

1. Open Telegram.
2. Search and start chatting with [@BotFather](https://t.me/BotFather).
3. Type `/start` then type `/newbot`.
4. Enter bot name (free).
5. Enter a bot username that ends with `bot` (example: `unionnotifier_bot`).
6. Once successful, BotFather will provide a **TOKEN**, for example:

```
Use this token to access the HTTP API:
123456789:AAH4YQ8z-example-token-from-botfather
```

## 9. Run the Bot

```bash
node bot.js
```

---

## 10. Run bot.js in the Background with Screen

Install screen if you haven't already:

```bash
sudo apt install screen
```

Create a new screen session and run the bot:

```bash
screen -S unionbot
node bot.js
```

To exit screen without stopping the bot, press:

```
Ctrl + A, then press D
```

To return to screen:

```bash
screen -r unionbot
```

---
