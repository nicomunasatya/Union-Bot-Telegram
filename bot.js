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
    console.log(`  Union Testnet Auto Bot - Script by Nico Munasatya  `);
    console.log(`---------------------------------------------`);
    console.log();
  }
};

// ABI contract
const UCS03_ABI = [
  {
    inputs: [
      { internalType: 'uint32', name: 'channelId', type: 'uint32' },
      { internalType: 'uint64', name: 'timeoutHeight', type: 'uint64' },
      { internalType: 'uint64', name: 'timeoutTimestamp', type: 'uint64' },
      { internalType: 'bytes32', name: 'salt', type: 'bytes32' },
      {
        components: [
          { internalType: 'uint8', name: 'version', type: 'uint8' },
          { internalType: 'uint8', name: 'opcode', type: 'uint8' },
          { internalType: 'bytes', name: 'operand', type: 'bytes' },
        ],
        internalType: 'struct Instruction',
        name: 'instruction',
        type: 'tuple',
      },
    ],
    name: 'send',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const USDC_ABI = [
  {
    constant: true,
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  },
  {
    constant: true,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
    stateMutability: 'view',
  },
  {
    constant: false,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
    stateMutability: 'nonpayable',
  },
];

// Constant setting
const contractAddress = '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03';
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const graphqlEndpoint = 'https://graphql.union.build/v1/graphql';
const baseExplorerUrl = 'https://sepolia.etherscan.io';
const unionUrl = 'https://app.union.build/explorer';
const telegramLink = 'https://t.me/airdrop_node';

const rpcProviders = [new JsonRpcProvider('https://eth-sepolia.public.blastapi.io')];
let currentRpcProviderIndex = 0;

function provider() {
  return rpcProviders[currentRpcProviderIndex];
}

function rotateRpcProvider() {
  currentRpcProviderIndex = (currentRpcProviderIndex + 1) % rpcProviders.length;
  return provider();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const explorer = {
  tx: (txHash) => `${baseExplorerUrl}/tx/${txHash}`,
  address: (address) => `${baseExplorerUrl}/address/${address}`,
};

const union = {
  tx: (txHash) => `${unionUrl}/transfers/${txHash}`,
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to generate a random time between 30 seconds (30,000 ms) and 120 seconds (120,000 ms)
function getRandomDelay() {
  const min = 30000; // 30 detik
  const max = 120000; // 120 detik
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function timelog() {
  return moment().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
}

function header() {
  process.stdout.write('\x1Bc');
  logger.banner();
}

// File path to save the wallet
const WALLET_FILE = path.join(__dirname, 'wallets.json');

// Function to load wallet from file
function loadWallets() {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    }
    return [];
  } catch (err) {
    logger.error(`Gagal memuat dompet: ${err.message}`);
    return [];
  }
}

// Function to save wallet to file
function saveWallets(wallets) {
  try {
    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
    logger.success('Dompet disimpan ke wallets.json');
  } catch (err) {
    logger.error(`Gagal menyimpan dompet: ${err.message}`);
  }
}

// Function to check balance and approve USDC
async function checkBalanceAndApprove(wallet, usdcAddress, spenderAddress) {
  const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, wallet);
  const balance = await usdcContract.balanceOf(wallet.address);
  if (balance === 0n) {
    logger.error(`${wallet.address} tidak memiliki cukup USDC. Isi dompet Anda terlebih dahulu!`);
    return false;
  }

  const allowance = await usdcContract.allowance(wallet.address, spenderAddress);
  if (allowance === 0n) {
    logger.loading(`USDC belum disetujui. Mengirim transaksi persetujuan...`);
    const approveAmount = ethers.MaxUint256;
    try {
      const tx = await usdcContract.approve(spenderAddress, approveAmount);
      const receipt = await tx.wait();
      logger.success(`Persetujuan dikonfirmasi: ${explorer.tx(receipt.hash)}`);
      await delay(3000);
    } catch (err) {
      logger.error(`Persetujuan gagal: ${err.message}`);
      return false;
    }
  }
  return true;
}

// Function to retrieve packet hash
async function pollPacketHash(txHash, retries = 50, intervalMs = 5000) {
  const headers = {
    accept: 'application/graphql-response+json, application/json',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'content-type': 'application/json',
    origin: 'https://app-union.build',
    referer: 'https://app.union.build/',
    'user-agent': 'Mozilla/5.0',
  };
  const data = {
    query: `
      query ($submission_tx_hash: String!) {
        v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
          packet_hash
        }
      }
    `,
    variables: {
      submission_tx_hash: txHash.startsWith('0x') ? txHash : `0x${txHash}`,
    },
  };

  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post(graphqlEndpoint, data, { headers });
      const result = res.data?.data?.v2_transfers;
      if (result && result.length > 0 && result[0].packet_hash) {
        return result[0].packet_hash;
      }
    } catch (e) {
      logger.error(`Kesalahan paket: ${e.message}`);
    }
    await delay(intervalMs);
  }
  logger.warn(`No package hash found after ${retries} test.`);
  return null;
}

// Function to send transactions from wallet
async function sendFromWallet(walletInfo, maxTransaction, destination, telegramBot = null, chatId = null) {
  const wallet = new Wallet(walletInfo.privateKey, provider()); // Menggunakan Wallet dari ethers
  let recipientAddress, destinationName, channelId, operand;

  if (destination === 'babylon') {
    recipientAddress = walletInfo.babylonAddress;
    destinationName = 'Babylon';
    channelId = 7;
    if (!recipientAddress) {
      const logMsg = `Melewati dompet '${walletInfo.name || 'Tanpa Nama'}': Alamat Babylon tidak ada.`; // Ganti nama variabel
      logger.warn(logMsg);
      if (telegramBot && chatId) telegramBot.sendMessage(chatId, logMsg);
      return;
    }
  } else if (destination === 'holesky') {
    recipientAddress = wallet.address;
    destinationName = 'Holesky';
    channelId = 8;
  } else {
    const logMsg = `Tujuan tidak valid: ${destination}`; // Ganti nama variabel
    logger.error(logMsg);
    if (telegramBot && chatId) telegramBot.sendMessage(chatId, logMsg);
    return;
  }
  const contract = new ethers.Contract(contractAddress, UCS03_ABI, wallet);
  const senderHex = wallet.address.slice(2).toLowerCase();
  const recipientHex = destination === 'babylon' ? Buffer.from(recipientAddress, "utf8").toString("hex") : senderHex;
  const timeoutHeight = 0;

  if (destination === 'babylon') {
    operand = `0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001e00000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002600000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000014${senderHex}000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a${recipientHex}0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000141c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000000000000000000000000000000000000000000000000000000000000000000004555344430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553444300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e62626e317a7372763233616b6b6778646e77756c3732736674677632786a74356b68736e743377776a687030666668363833687a7035617135613068366e0000`;
  } else {
    operand = `0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000014${senderHex}0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014${senderHex}00000000000000000000000000000000000000000000000000000000000000000000000000000000000000141c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000000000000000000000000000000000000000000000000000000000000000000004555344430000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553444300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001457978bfe465ad9b1c0bf80f6c1539d300705ea50000000000000000000000000`;
  }

  for (let i = 1; i <= maxTransaction; i++) {
    logger.step((walletInfo.name || 'Tanpa Nama') + ' | Transaksi ' + i + '/' + maxTransaction);
    const now = BigInt(Date.now()) * 1_000_000n;
    const oneDayNs = 86_400_000_000_000n;
    const timeoutTimestamp = (now + oneDayNs).toString();
    const timestampNow = Math.floor(Date.now() / 1000);

    // FIX: Menggunakan solidityPacked dengan argumen yang benar dan keccak256
    const salt = keccak256(solidityPacked(['address', 'uint256'], [wallet.address, timestampNow]));

    // FIX: Menggunakan nilai numerik untuk version dan opcode
    const instruction = {
      version: 0,
      opcode: 2, // 0x02 dalam hex adalah 2 dalam desimal
      operand,
    };

    try {
      const tx = await contract.send(channelId, timeoutHeight, timeoutTimestamp, salt, instruction);
      await tx.wait(1);
      const successMsg = `${timelog()} | ${walletInfo.name || 'Tanpa Nama'} | Transaksi Dikonfirmasi: ${explorer.tx(tx.hash)}`;
      logger.success(successMsg);
      if (telegramBot && chatId) telegramBot.sendMessage(chatId, successMsg);
      const txHash = tx.hash.startsWith('0x') ? tx.hash : `0x${tx.hash}`;
      const packetHash = await pollPacketHash(txHash);
      if (packetHash) {
        const packetMsg = `${timelog()} | ${walletInfo.name || 'Tanpa Nama'} | Paket Dikirim: ${union.tx(packetHash)}`;
        logger.success(packetMsg);
        if (telegramBot && chatId) telegramBot.sendMessage(chatId, packetMsg);
      }
    } catch (err) {
      const errMsg = `Gagal untuk ${wallet.address}: ${err.message}`;
      logger.error(errMsg);
      if (telegramBot && chatId) telegramBot.sendMessage(chatId, errMsg);
    }

    if (i < maxTransaction) {
      const randomDelay = getRandomDelay();
      logger.info(`Menunggu ${randomDelay / 1000} detik sebelum transaksi berikutnya...`);
      if (telegramBot && chatId) telegramBot.sendMessage(chatId, `Menunggu ${randomDelay / 1000} detik sebelum transaksi berikutnya...`);
      await delay(randomDelay);
    }
  }
}

// Main function for console mode
async function mainConsole() {
  header();

  let wallets = loadWallets();
  if (wallets.length === 0) {
    wallets = [];
    let index = 1;
    while (true) {
      const privateKey = process.env[`PRIVATE_KEY_${index}`]; // Using privateKey (capital letters)
      const babylonAddress = process.env[`BABYLON_ADDRESS_${index}`];
      if (!privateKey) break;
      wallets.push({
        name: `Dompet${index}`,
        privateKey: privateKey, // Using privateKey (capital letters)
        babylonAddress: babylonAddress || ''
      });
      index++;
    }
    saveWallets(wallets);
  }

  if (wallets.length === 0) {
    logger.error(`No wallets found in .env or wallets.json. Please provide at least one PRIVATE_KEY_X.`);
    rl.close();
    process.exit(1);
  }

  while (true) {
    console.log(`Menu (Script by airdropnode - ${telegramLink}):`);
    console.log(`1. Sepolia - Holesky`);
    console.log(`2. Sepolia - Babylon`);
    console.log(`3. Random (Holesky dan Babylon)`);
    console.log(`4. Keluar`);
    const menuChoice = await askQuestion(`[?] Select a menu option (1-4): `);
    const choice = parseInt(menuChoice.trim());

    if (choice === 4) {
      logger.info(`Exit the program.`);
      rl.close();
      process.exit(0);
    }

    if (![1, 2, 3].includes(choice)) {
      logger.error(`Invalid option. Please select 1, 2, 3, or 4.`);
      continue;
    }

    const maxTransactionInput = await askQuestion(`[?] Enter the number of transactions per wallet: `);
    const maxTransaction = parseInt(maxTransactionInput.trim());

    if (isNaN(maxTransaction) || maxTransaction <= 0) {
      logger.error(`Invalid number. Please enter a positive number.`);
      continue;
    }

    for (const walletInfo of wallets) {
      if (!walletInfo.privateKey) { // Menggunakan privateKey (huruf kapital)
        logger.warn(`Passing the wallet '${walletInfo.name}': The private key is missing.`);
        continue;
      }
      if (!walletInfo.privateKey.startsWith('0x')) { // Menggunakan privateKey (huruf kapital)
        logger.warn(`Passing the wallet '${walletInfo.name}': The private key must start with '0x'.`);
        continue;
      }
      if (!/^(0x)[0-9a-fA-F]{64}$/.test(walletInfo.privateKey)) { // Menggunakan privateKey (huruf kapital)
        logger.warn(`Passing the wallet '${walletInfo.name}': The private key is not a valid 64 character hexadecimal string.`);
        continue;
      }

      if (choice === 1) {
        await sendFromWallet(walletInfo, maxTransaction, 'holesky');
      } else if (choice === 2) {
        await sendFromWallet(walletInfo, maxTransaction, 'babylon');
      } else if (choice === 3) {
        const destinations = ['holesky', 'babylon'].filter(dest => dest !== 'babylon' || walletInfo.babylonAddress);
        if (destinations.length === 0) {
          logger.warn(`Passing the wallet '${walletInfo.name}': There are no valid destinations (Babylon address does not exist).`);
          continue;
        }
        for (let i = 0; i < maxTransaction; i++) {
          const randomDest = destinations[Math.floor(Math.random() * destinations.length)];
          await sendFromWallet(walletInfo, 1, randomDest);
        }
      }
    }

    if (wallets.length === 0) {
      logger.warn(`No wallet processing. Check .env or wallets.json for valid entries.`);
    }
  }
}

// Main functions for Telegram mode
function mainTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !allowedChatId) {
    logger.warn('Telegram bot is not configured: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not found in .env. Starts in console mode.');
    return mainConsole();
  }

  const bot = new TelegramBot(token, { polling: true });
  const userState = {}; // To store user status

  // Tombol menu utama
  const mainMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Add Wallet', callback_data: 'add_wallet' }],
        [{ text: 'Wallet List', callback_data: 'list_wallets' }],
        [{ text: 'Execute Transaction', callback_data: 'run_transactions' }],
        [{ text: 'Help', callback_data: 'help' }],
        [{ text: 'Join Telegram (airdropnode)', url: telegramLink }],
      ],
    },
  };

  // Return to home button
  const backToHomeButton = [{ text: 'Return to Home', callback_data: 'home' }];

  // Function to display the main menu
  function showMainMenu(chatId, message = `Welcome to Union Testnet Auto Bot! (Select option:`) {
    delete userState[chatId]; // Delete user state
    bot.sendMessage(chatId, message, mainMenu);
  }

// Handles the /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== allowedChatId) {
      bot.sendMessage(chatId, 'Access is not permitted.');
      return;
    }
    showMainMenu(chatId);
  });

// Handle buttons
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    if (chatId !== allowedChatId) {
      bot.sendMessage(chatId, 'Access not permitted.');
      bot.answerCallbackQuery(query.id);
      return;
    }

    const data = query.data;
    bot.answerCallbackQuery(query.id);

    // Back to main menu
    if (data === 'home') {
      showMainMenu(chatId, 'Back to main menu.');
      return;
    }

    // Displays the main menu
    if (data === 'start') {
      showMainMenu(chatId);
      return;
    }

    // Display help
    if (data === 'help') {
      bot.sendMessage(chatId, 'Available actions:\n- Add Wallet: Add a new wallet\n- List Wallet: View all wallets\n- Execute Transaction: Execute a transaction\n- Help: Show this message', {
        reply_markup: {
          inline_keyboard: [backToHomeButton],
        },
      });
      return;
    }

    // Add wallet
    if (data === 'add_wallet') {
      userState[chatId] = { step: 'add_wallet_input' };
      bot.sendMessage(chatId, 'Please enter wallet details in the format:\nname: <wallet_name>\nprivate_key: <private_key>\babylon_address: <babylon_address> (optional)', {
        reply_markup: {
          inline_keyboard: [backToHomeButton],
        },
      });
      return;
    }

    // Wallet list
    if (data === 'list_wallets') {
      const wallets = loadWallets();
      if (wallets.length === 0) {
        bot.sendMessage(chatId, 'No wallet found.', {
          reply_markup: {
            inline_keyboard: [backToHomeButton],
          },
        });
        return;
      }
      const walletList = wallets.map(w => `Name: ${w.name}\nAddress: ${new ethers.Wallet(w.privatekey).address}\nBabylon Address: ${w.babylonAddress || 'Nothing'}`).join('\n\n');
      bot.sendMessage(chatId, `Dompet:\n\n${walletList}`, {
        reply_markup: {
          inline_keyboard: [backToHomeButton],
        },
      });
      return;
    }
