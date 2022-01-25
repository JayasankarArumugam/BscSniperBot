"use strict";
const ethers = require("ethers");
const retry = require("async-retry");
const pcsAbi = new ethers.utils.Interface(require("./abi.json"));
const EXPECTED_PONG_BACK = 30000;
const KEEP_ALIVE_CHECK_INTERVAL = 15000;
const dotenv = require("dotenv");

console.log("Welcome to Jayasankar's Bots.")
console.log("Join our community: https://t.me/jayasankarbots")

console.log("     ██╗ █████╗ ██╗   ██╗ █████╗ ███████╗ █████╗ ███╗   ██╗██╗  ██╗ █████╗ ██████╗ ███████╗    ██████╗  ██████╗ ████████╗███████╗")
console.log("     ██║██╔══██╗╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗████╗  ██║██║ ██╔╝██╔══██╗██╔══██╗██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝██╔════╝")
console.log("     ██║███████║ ╚████╔╝ ███████║███████╗███████║██╔██╗ ██║█████╔╝ ███████║██████╔╝███████╗    ██████╔╝██║   ██║   ██║   ███████╗")
console.log("██   ██║██╔══██║  ╚██╔╝  ██╔══██║╚════██║██╔══██║██║╚██╗██║██╔═██╗ ██╔══██║██╔══██╗╚════██║    ██╔══██╗██║   ██║   ██║   ╚════██║")
console.log("╚█████╔╝██║  ██║   ██║   ██║  ██║███████║██║  ██║██║ ╚████║██║  ██╗██║  ██║██║  ██║███████║    ██████╔╝╚██████╔╝   ██║   ███████║")
console.log(" ╚════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   ╚══════╝")

const result = dotenv.config();
if (result.error) {
  throw result.error;
}

if (!process.env.PRIVATE_KEY) {
  throw (
    "The private key was not found in .env. Enter the private key in .env."
  );
}

if (!process.env.RECIPIENT) {
  throw (
    "The public address (RECIPIENT) was not found in .env. Enter your public address in .env."
  );
}

const tokens = {
  router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  purchaseAmount: process.env.PURCHASEAMOUNT || "0.01",
  pair: [
    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    process.env.TOKEN,
  ],
  GASLIMIT: process.env.GASLIMIT || "1000000",
  GASPRICE: process.env.GASPRICE || "5",
  buyDelay: 1,
  buyRetries: 3,
  retryMinTimeout: 250,
  retryMaxTimeout: 3000,
  deadline: 60,
};
const purchaseAmount = ethers.utils.parseUnits(tokens.purchaseAmount, "ether");

let pingTimeout = null;
let keepAliveInterval = null;
let provider;
let wallet;
let account;
let router;
let grasshopper;

async function Wait(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

const startConnection = () => {
  provider = new ethers.providers.WebSocketProvider(process.env.BSC_NODE_WSS);
  wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  account = wallet.connect(provider);
  router = new ethers.Contract(tokens.router, pcsAbi, account);
  grasshopper = 0;

  provider._websocket.on("open", () => {
    console.log(
      "Watching for liquidity pool events..."
    );
    tokens.router = ethers.utils.getAddress(tokens.router);
    keepAliveInterval = setInterval(() => {
      provider._websocket.ping();
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate();
      }, EXPECTED_PONG_BACK);
    }, KEEP_ALIVE_CHECK_INTERVAL);

    provider.on("pending", async (txHash) => {
      provider
        .getTransaction(txHash)
        .then(async (tx) => {
          if (grasshopper === 0) {
            console.log("Please wait...");
            grasshopper = 1;
          }
          if (tx && tx.to) {
            if (tx.to === tokens.router) {
              const re1 = new RegExp("^0xf305d719");
              if (re1.test(tx.data)) {
                const decodedInput = pcsAbi.parseTransaction({
                  data: tx.data,
                  value: tx.value,
                });
                if (
                  ethers.utils.getAddress(tokens.pair[1]) ===
                  decodedInput.args[0]
                ) {
                  provider.off("pending");
                  await Wait(tokens.buyDelay);
                  await BuyToken(tx);
                }
              }
            }
          }
        })
        .catch(() => { });
    });
  });

  provider._websocket.on("close", () => {
    console.log("WebSocket Closed...Reconnecting...");
    clearInterval(keepAliveInterval);
    clearTimeout(pingTimeout);
    startConnection();
  });

  provider._websocket.on("error", () => {
    console.log("Error. Attemptiing to Reconnect...");
    clearInterval(keepAliveInterval);
    clearTimeout(pingTimeout);
    startConnection();
  });

  provider._websocket.on("pong", () => {
    clearInterval(pingTimeout);
  });
};

const BuyToken = async (txLP) => {
  const tx = await retry(
    async () => {
      const amountOutMin = 0; // I don't like this but it works
      let buyConfirmation = await router.swapExactETHForTokens(
        amountOutMin,
        tokens.pair,
        process.env.RECIPIENT,
        Date.now() + 1000 * tokens.deadline,
        {
          value: purchaseAmount,
          gasLimit: tokens.gasLimit,
          gasPrice: txLP.gasPrice,
        }
      );
      return buyConfirmation;
    },
    {
      retries: tokens.buyRetries,
      minTimeout: tokens.retryMinTimeout,
      maxTimeout: tokens.retryMaxTimeout,
      onRetry: (err, number) => {
        console.log("Buy Failed - Retrying", number);
        console.log("Error", err);
        if (number === tokens.buyRetries) {
          console.log("Sniping has failed...");
          process.exit();
        }
      },
    }
  );
  console.log("Associated LP Event txHash: " + txLP.hash);
  console.log("Your [pending] txHash: " + tx.hash);
  process.exit();
};
startConnection();
