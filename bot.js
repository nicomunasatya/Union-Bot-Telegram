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
  logger.warn(`Tidak ada hash paket ditemukan setelah ${retries} percobaan.`);
  return null;
}
