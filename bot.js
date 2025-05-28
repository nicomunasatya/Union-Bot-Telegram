const fs = require('fs');
const path = require('path');
const { ethers, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const moment = require('moment-timezone');
const readline = require('readline');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Setting logger
const logger = {
  info: (msg) => console.log(`[✓] ${msg}`),
  warn: (msg) => console.log(`[⚠] ${msg}`),
  error: (msg) => console.log(`[✗] ${msg}`),
  success: (msg) => console.log(`[✅] ${msg}`),
  loading: (msg) => console.log(`[⟳] ${msg}`),
  step: (msg) => console.log(`[➤] ${msg}`),
  banner: () => {
    console.log(`---------------------------------------------`);
    console.log(`  Union Testnet Auto Bot - Script by airdropnode (https://t.me/airdrop_node)  `);
    console.log(`---------------------------------------------`);
    console.log();
  }
};
