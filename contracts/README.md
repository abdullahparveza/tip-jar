# TipJar smart contract

Tip Jar's on-chain contract, deployed on BNB Smart Chain (chainId 56) for the
Binance Agent ID Hackathon.

- **Contract:** [`0x5493b74ced2455434e4bf23518f2b1521c3cc44b`](https://bscscan.com/address/0x5493b74cED2455434E4bF23518f2B1521c3cC44B)
- **Source verified on BscScan:** Exact Match, compiler v0.8.38, optimizer
  enabled (200 runs). Also verified on Sourcify (exact match).
- **Deployed:** 2026-11-18 via the deterministic deployment proxy (CREATE2
  factory) `0x4e59b44847b379578588920cA78FbF26c0B4956C`,
  tx `0x1acc4cd0c441f931c6c4e010c1e8a3eb6d7809d39a8a6c603a39ba43bb2d6c47`,
  block 134296567.

## How it works

`tip(string handle)` lets an Agent ID holder tip any agent by its `.ai` name.
The contract resolves the handle to its holder fully on-chain: the Agent ID
registry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`) mints one
non-transferable token per handle with
`tokenId = uint256(keccak256(bytes(handle)))`, so the contract calls
`ownerOf(keccak256(handle))` to find the recipient. Only Agent ID holders can
send tips (`balanceOf(msg.sender) > 0`). The tipped BNB is forwarded to the
recipient immediately — the contract never holds funds. No owner, no pause, no
mint, no withdraw.

## Files

- `TipJar.sol` — the contract source (this exact file is what is verified on
  BscScan).
- `TipJar.abi.json` — the contract ABI.

## Compile

Solidity 0.8.38, optimizer enabled, 200 runs, default EVM version.
