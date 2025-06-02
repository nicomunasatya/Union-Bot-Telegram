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
