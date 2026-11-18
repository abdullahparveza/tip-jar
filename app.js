// ---------------------------------------------------------------------------
// Tip Jar — frontend config
// ---------------------------------------------------------------------------

// Deployed TipJar contract address on BSC (chainId 56).
// Deployed 2026-11-18 via the CREATE2 factory; verified on-chain.
const CONTRACT_ADDRESS = "0x5493b74ced2455434e4bf23518f2b1521c3cc44b";

const BSC_CHAIN_ID = 56;
const BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org";
const BSCSCAN_TX_URL = "https://bscscan.com/tx/";
const BSCSCAN_ADDRESS_URL = "https://bscscan.com/address/";
const AGENT_ID_REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

// Minimal TipJar ABI (from TipJar.abi.json).
const TIPJAR_ABI = [
  "function tip(string handle) payable",
  "function resolve(string handle) view returns (address)",
  "function totalReceived(address) view returns (uint256)",
  "function totalSent(address) view returns (uint256)",
  "function totalTips() view returns (uint256)",
  "function totalVolume() view returns (uint256)",
  "event Tipped(address indexed from, address indexed to, string handle, uint256 amount)",
];

// Minimal Agent ID registry ABI (ERC-721 balance check).
const REGISTRY_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

const DEPLOYED = CONTRACT_ADDRESS.toLowerCase() !== ethers.ZeroAddress;

// How far back to look for recent tips: last ~50,000 blocks (~1.7 days on
// BSC), queried in 5,000-block chunks because public RPC nodes limit the
// range of a single eth_getLogs request.
const RECENT_TIPS_BLOCKS = 50000;
const LOG_CHUNK_BLOCKS = 5000;
const MAX_RECENT_TIPS = 20;

// ---------------------------------------------------------------------------
// State & providers
// ---------------------------------------------------------------------------

const readProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
const registryRead = new ethers.Contract(
  AGENT_ID_REGISTRY,
  REGISTRY_ABI,
  readProvider
);
const tipJarRead = DEPLOYED
  ? new ethers.Contract(CONTRACT_ADDRESS, TIPJAR_ABI, readProvider)
  : null;

let browserProvider = null; // ethers.BrowserProvider, set on connect
let signer = null;
let connectedAddress = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function shortenAddress(address) {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

function formatBnb(wei) {
  // Show up to 6 significant decimals, trimming trailing zeros.
  const full = ethers.formatEther(wei);
  const trimmed = full.includes(".")
    ? full.replace(/(\.\d{6})\d+$/, "$1").replace(/\.?0+$/, "")
    : full;
  return (trimmed === "" ? "0" : trimmed) + " BNB";
}

function setTipStatus(message, kind) {
  const el = $("tip-status");
  el.textContent = message;
  el.className = "status" + (kind ? " " + kind : "");
}

function setTipStatusHtml(html, kind) {
  const el = $("tip-status");
  el.innerHTML = html;
  el.className = "status" + (kind ? " " + kind : "");
}

// ---------------------------------------------------------------------------
// Handle normalization
// ---------------------------------------------------------------------------

// The contract expects the handle WITHOUT the ".ai" suffix, lowercase.
// Users may type "abdullahparvez", "abdullahparvez.ai", or "  AbdullahParvez.AI ".
function normalizeHandle(input) {
  let handle = input.trim().toLowerCase();
  if (handle.endsWith(".ai")) handle = handle.slice(0, -3);
  return handle;
}

// ---------------------------------------------------------------------------
// Resolve: show the recipient address for the typed handle
// ---------------------------------------------------------------------------

let resolveSeq = 0;

async function resolveCurrentHandle() {
  const raw = $("handle-input").value;
  const handle = normalizeHandle(raw);
  const statusEl = $("resolve-status");

  if (!handle) {
    statusEl.textContent = "Enter a name to see the recipient address.";
    statusEl.className = "muted";
    return null;
  }

  if (!DEPLOYED) {
    statusEl.textContent =
      "The contract is not deployed yet, so names cannot be resolved.";
    statusEl.className = "muted";
    return null;
  }

  const seq = ++resolveSeq;
  statusEl.textContent = "Resolving " + handle + ".ai …";
  statusEl.className = "muted";

  try {
    const address = await tipJarRead.resolve(handle);
    if (seq !== resolveSeq) return null; // a newer lookup superseded this one
    statusEl.textContent =
      handle + ".ai → " + address + " (" + shortenAddress(address) + ")";
    statusEl.className = "resolved";
    return address;
  } catch (err) {
    if (seq !== resolveSeq) return null;
    statusEl.textContent =
      "Could not resolve " + handle + ".ai — that Agent ID does not exist.";
    statusEl.className = "error-text";
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wallet connection & network
// ---------------------------------------------------------------------------

async function updateNetworkState() {
  if (!browserProvider) return;
  const network = await browserProvider.getNetwork();
  const onBsc = Number(network.chainId) === BSC_CHAIN_ID;
  $("network-warning").hidden = onBsc;
  return onBsc;
}

async function checkHolderStatus(address) {
  const el = $("holder-status");
  try {
    const balance = await registryRead.balanceOf(address);
    const holds = balance > 0n;
    el.textContent = holds
      ? "This wallet holds an Agent ID — you can send tips."
      : "This wallet does not hold an Agent ID, so it cannot send tips yet.";
    el.className = holds ? "holder-yes" : "holder-no";
    el.hidden = false;
    return holds;
  } catch (err) {
    el.textContent = "Could not check Agent ID status.";
    el.className = "muted";
    el.hidden = false;
    return null;
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    $("wallet-status").textContent =
      "No wallet found. Install MetaMask or open this page in a wallet browser — or tip with your agent below.";
    return;
  }

  try {
    browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send("eth_requestAccounts", []);
    connectedAddress = accounts[0];
    signer = await browserProvider.getSigner();

    $("wallet-status").textContent =
      "Connected: " + shortenAddress(connectedAddress);
    $("connect-btn").textContent = "Connected";
    $("connect-btn").disabled = true;

    await updateNetworkState();
    await checkHolderStatus(connectedAddress);
    await refreshStats();
  } catch (err) {
    $("wallet-status").textContent =
      err && err.code === 4001
        ? "Connection request rejected."
        : "Could not connect wallet: " + (err.message || err);
  }
}

async function switchToBsc() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x38" }], // 56 in hex
    });
  } catch (err) {
    // 4902 = chain not added to the wallet; add BSC then.
    if (err && err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x38",
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: [BSC_RPC_URL],
            blockExplorerUrls: ["https://bscscan.com"],
          },
        ],
      });
    } else {
      setTipStatus(
        "Could not switch networks: " + (err.message || err),
        "error"
      );
      return;
    }
  }
  await updateNetworkState();
}

// ---------------------------------------------------------------------------
// Tipping
// ---------------------------------------------------------------------------

function friendlyTipError(err) {
  const msg = (err && (err.reason || err.message || "")) + "";
  if (err && err.code === 4001) return "Transaction rejected in wallet.";
  if (msg.includes("NotAgentIdHolder"))
    return "Your wallet does not hold an Agent ID, so it cannot send tips.";
  if (msg.includes("EmptyTip")) return "Tip amount must be greater than 0.";
  if (msg.includes("TransferFailed"))
    return "The transfer to the recipient failed.";
  if (
    msg.toLowerCase().includes("nonexistent token") ||
    msg.toLowerCase().includes("erc721")
  )
    return "That Agent ID does not exist.";
  if (msg.toLowerCase().includes("insufficient funds"))
    return "Insufficient funds for the tip plus gas.";
  return "Transaction failed: " + (err.shortMessage || err.message || err);
}

async function sendTip() {
  if (!DEPLOYED) {
    setTipStatus("The contract is not deployed yet.", "error");
    return;
  }
  if (!signer || !connectedAddress) {
    setTipStatus("Connect your wallet first.", "error");
    return;
  }

  const handle = normalizeHandle($("handle-input").value);
  if (!handle) {
    setTipStatus("Enter a recipient .ai name.", "error");
    return;
  }

  const amountText = $("amount-input").value;
  let value;
  try {
    value = ethers.parseEther(amountText || "0");
  } catch (err) {
    setTipStatus("Enter a valid BNB amount.", "error");
    return;
  }
  if (value <= 0n) {
    setTipStatus("Tip amount must be greater than 0.", "error");
    return;
  }

  const onBsc = await updateNetworkState();
  if (!onBsc) {
    setTipStatus("Switch to BSC (chain 56) before tipping.", "error");
    return;
  }

  // Confirm the handle resolves before sending, so the user never pays
  // gas on a tip that would revert.
  const recipient = await resolveCurrentHandle();
  if (!recipient) {
    setTipStatus("That Agent ID could not be resolved.", "error");
    return;
  }

  const tipBtn = $("tip-btn");
  tipBtn.disabled = true;
  setTipStatus("Waiting for wallet confirmation…", "pending");

  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, TIPJAR_ABI, signer);
    const tx = await contract.tip(handle, { value });
    setTipStatusHtml(
      'Transaction sent. Waiting for confirmation…<br><a href="' +
        BSCSCAN_TX_URL +
        tx.hash +
        '" target="_blank" rel="noopener">View on BscScan</a>',
      "pending"
    );
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      setTipStatusHtml(
        'Tip sent! ' +
          formatBnb(value) +
          ' to ' +
          handle +
          '.ai<br><a href="' +
          BSCSCAN_TX_URL +
          tx.hash +
          '" target="_blank" rel="noopener">View on BscScan</a>',
        "success"
      );
    } else {
      setTipStatusHtml(
        'Transaction failed on-chain.<br><a href="' +
          BSCSCAN_TX_URL +
          tx.hash +
          '" target="_blank" rel="noopener">View on BscScan</a>',
        "error"
      );
    }
    await refreshStats();
    await loadRecentTips();
  } catch (err) {
    setTipStatus(friendlyTipError(err), "error");
  } finally {
    tipBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Agent prompt: the Agentic Wallet can't connect to websites, so Agent ID
// holders tip through their agent. The prompt follows the name and amount
// typed in the tip form above.
// ---------------------------------------------------------------------------

function agentPromptText() {
  const handle = normalizeHandle($("handle-input").value) || "abdullahparvez";
  const amount = $("amount-input").value || "0.00001";
  return (
    "Tip " +
    amount +
    " BNB to " +
    handle +
    ".ai using Tip Jar on BNB Chain. Contract " +
    CONTRACT_ADDRESS +
    ", function tip(string handle). Confirm with me before sending."
  );
}

function refreshAgentPrompt() {
  $("agent-prompt").textContent = agentPromptText();
}

async function copyAgentPrompt() {
  const text = agentPromptText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Fallback for browsers without clipboard permission (e.g. some
    // in-app webviews): select-and-copy from a temporary textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  const status = $("copy-status");
  status.textContent = "Copied!";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

async function refreshStats() {
  if (!DEPLOYED) return;
  try {
    const [totalTips, totalVolume] = await Promise.all([
      tipJarRead.totalTips(),
      tipJarRead.totalVolume(),
    ]);
    $("stat-total-tips").textContent = totalTips.toString();
    $("stat-total-volume").textContent = formatBnb(totalVolume);
  } catch (err) {
    $("stat-total-tips").textContent = "—";
    $("stat-total-volume").textContent = "—";
  }

  if (connectedAddress) {
    try {
      const sent = await tipJarRead.totalSent(connectedAddress);
      $("stat-your-sent").textContent = formatBnb(sent);
    } catch (err) {
      $("stat-your-sent").textContent = "—";
    }
  } else {
    $("stat-your-sent").textContent = "Connect wallet to see";
  }
}

// ---------------------------------------------------------------------------
// Recent tips (Tipped events via eth_getLogs)
// ---------------------------------------------------------------------------

function renderRecentTips(tips) {
  const list = $("recent-tips");
  if (!tips.length) {
    list.innerHTML =
      '<li class="muted">No tips yet — be the first to send one.</li>';
    return;
  }
  list.innerHTML = tips
    .map((t) => {
      const from = shortenAddress(t.from);
      const to = shortenAddress(t.to);
      const txLink =
        '<a href="' +
        BSCSCAN_TX_URL +
        t.txHash +
        '" target="_blank" rel="noopener">tx</a>';
      return (
        "<li><strong>" +
        t.handle +
        ".ai</strong> received " +
        formatBnb(t.amount) +
        " from " +
        from +
        " → " +
        to +
        " (" +
        txLink +
        ")</li>"
      );
    })
    .join("");
}

async function loadRecentTips() {
  const list = $("recent-tips");
  if (!DEPLOYED) {
    list.innerHTML =
      '<li class="muted">The contract is not deployed yet — no tips to show.</li>';
    return;
  }

  list.innerHTML = '<li class="muted">Loading…</li>';
  try {
    const latest = await readProvider.getBlockNumber();
    const fromBlock = Math.max(0, latest - RECENT_TIPS_BLOCKS);
    const filter = tipJarRead.filters.Tipped();
    const tips = [];

    // Walk backwards in chunks so no single eth_getLogs request exceeds
    // the public node's range limit; stop once we have enough tips.
    for (
      let end = latest;
      end > fromBlock && tips.length < MAX_RECENT_TIPS;
      end -= LOG_CHUNK_BLOCKS
    ) {
      const start = Math.max(fromBlock, end - LOG_CHUNK_BLOCKS + 1);
      const events = await tipJarRead.queryFilter(filter, start, end);
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        tips.push({
          from: e.args.from,
          to: e.args.to,
          handle: e.args.handle,
          amount: e.args.amount,
          txHash: e.transactionHash,
        });
        if (tips.length >= MAX_RECENT_TIPS) break;
      }
    }

    renderRecentTips(tips);
  } catch (err) {
    list.innerHTML =
      '<li class="muted">Could not load recent tips right now. Try refreshing the page.</li>';
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init() {
  if (!DEPLOYED) {
    $("deploy-banner").hidden = false;
    $("tip-btn").disabled = true;
    $("handle-input").disabled = true;
    $("amount-input").disabled = true;
    $("stat-your-sent").textContent = "—";
  } else {
    const link = $("contract-link");
    link.href = BSCSCAN_ADDRESS_URL + CONTRACT_ADDRESS;
    link.hidden = false;
  }

  $("connect-btn").addEventListener("click", connectWallet);
  $("switch-network-btn").addEventListener("click", switchToBsc);
  $("tip-btn").addEventListener("click", sendTip);
  $("copy-prompt-btn").addEventListener("click", copyAgentPrompt);

  let resolveTimer = null;
  $("handle-input").addEventListener("input", () => {
    clearTimeout(resolveTimer);
    resolveTimer = setTimeout(resolveCurrentHandle, 500);
    refreshAgentPrompt();
  });
  $("amount-input").addEventListener("input", refreshAgentPrompt);

  // React to wallet changes without a page reload.
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (!accounts.length) {
        connectedAddress = null;
        signer = null;
        $("wallet-status").textContent = "Not connected";
        $("holder-status").hidden = true;
        $("connect-btn").textContent = "Connect wallet";
        $("connect-btn").disabled = false;
        $("stat-your-sent").textContent = "Connect wallet to see";
      } else {
        connectedAddress = accounts[0];
        $("wallet-status").textContent =
          "Connected: " + shortenAddress(connectedAddress);
        checkHolderStatus(connectedAddress);
        refreshStats();
      }
    });
    window.ethereum.on("chainChanged", () => updateNetworkState());
  }

  refreshAgentPrompt();
  refreshStats();
  loadRecentTips();
}

init();
