# Tip Jar — dApp website

Static single-page frontend for the Tip Jar hackathon project. No build
step: serve the files as-is (any static host works).

## Files

- `index.html` — page structure
- `app.js` — wallet connection, name resolution, tipping, stats, recent tips
- `styles.css` — styling
- `README.md` — this file

The site loads ethers.js v6 from a CDN
(`cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js`), so it needs
an internet connection to run.

## How it works

- **Connect wallet:** uses `window.ethereum` (MetaMask / wallet browser).
  Offers a switch to BSC (chainId 56) when the wallet is on another network,
  and checks whether the connected wallet holds an Agent ID
  (`balanceOf` on the registry
  `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).
- **Tip:** the user types a `.ai` name (e.g. `abdullahparvez.ai`). The name
  is normalized in JS (lowercase, trailing `.ai` stripped) and resolved via
  the contract's `resolve()` so the recipient address is shown before any
  transaction. The Tip button calls `tip(handle)` with the BNB amount as
  wei, shows pending/confirmed/error status, and links the tx hash to
  BscScan.
- **Stats:** `totalTips`, `totalVolume` (formatted BNB), and the connected
  wallet's `totalSent`, read from the public BSC RPC.
- **Recent tips:** `Tipped` events fetched with `eth_getLogs` over the last
  ~50,000 blocks, in 5,000-block chunks (newest first, max 20 shown).

Tips go directly to the recipient — the contract never holds funds.

## Before launch

1. Deploy the TipJar contract (see `../tipjar/`), then set the real address
   in `app.js`:
   `const CONTRACT_ADDRESS = "0x...";` (top of the file, marked
   "FILL IN AFTER DEPLOYMENT"). Until then the site shows a "not deployed
   yet" banner and tipping/stats are disabled.
2. Publish the folder as a static site.

## Testing done (2026-11-18, contract not yet deployed)

- `node --check app.js` — syntax OK.
- All three files served locally and fetched over HTTP — load OK.
- Registry read verified live on BSC: `ownerOf(keccak256("abdullahparvez"))`
  on the Agent ID registry returns
  `0xb8cA90A93990Ce7443316dD8a8Ad02C3704EA3B2`, and
  `balanceOf` for that address is > 0 — the same on-chain resolution the
  contract uses, confirmed working.
- `resolve()`, `tip()`, stats, and the recent-tips list could NOT be tested
  yet because the contract is not deployed (the site correctly shows the
  "not deployed yet" banner and disables the form).

## Still to test after deployment

1. Set `CONTRACT_ADDRESS` in `app.js` and reload: the banner should
   disappear and the form should enable.
2. Type `abdullahparvez.ai` — the resolved address should appear.
3. Connect a wallet holding an Agent ID, switch to BSC, and send a small
   test tip; confirm the status flow (pending → confirmed, BscScan link)
   and that stats and the recent-tips list update.
4. Negative cases: a non-existent handle should show the "does not exist"
   message without sending a transaction; a wallet without an Agent ID
   should see the holder warning.
5. Check the page on a mobile wallet browser.
