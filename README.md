<div align="center">

# Veyl

**A private launch & trading terminal on Starknet.**

Trade and launch tokens without your wallet becoming a target — funded through the [STRK20](https://strk20-by-example.org/what-is-strk20) privacy pool, executed from identities nobody can link back to you.

[![Live](https://img.shields.io/badge/live-veyl--tau.vercel.app-FF5A2E)](https://veyl-tau.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Built with Next.js](https://img.shields.io/badge/built%20with-Next.js%2016-black)](https://nextjs.org)
[![Network](https://img.shields.io/badge/network-Starknet%20Mainnet-29296e)](https://www.starknet.io)
[![STRK20 Private Sprint](https://img.shields.io/badge/STRK20-Private%20Sprint-c97b5f)](https://github.com/starkience/strk20-hackathon)

**[veyl-tau.vercel.app →](https://veyl-tau.vercel.app)**

</div>

## Table of contents

- [The problem](#the-problem)
- [What Veyl does](#what-veyl-does)
- [How it works](#how-it-works)
- [Status](#status)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [STRK20 integration](#strk20-integration)
- [Roadmap](#roadmap)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## The problem

Every wallet that trades onchain leaks a full history of intent. On memecoin terminals and launch platforms, that history gets copy-traded, sniped, and front-run in real time — the moment a wallet with a track record moves, bots move first. There is no version of "trade actively on a public chain" that doesn't currently mean "publish your strategy to everyone watching."

## What Veyl does

Veyl is a trading and launch terminal where the *positions* are public — prices, volume, launches — but the *trader* isn't:

- **Shielded funding.** Deposit into the STRK20 privacy pool, then trade from an execution identity that isn't linkable back to your funding wallet or your other positions.
- **Sealed-bid fair launches.** New token launches clear through a sealed-bid round instead of a first-block gas war — bids are real, escrowed STRK20 notes, revealed only at settlement. No sniping bots racing on priority fee.
- **Private transfers & balances**, straight from the underlying STRK20 primitives — shield, unshield, and move value without exposing the link between the two ends.

## How it works

```
 fund             shield              trade / launch            settle
┌──────┐        ┌──────────┐        ┌────────────────────┐    ┌─────────┐
│wallet│ ──────▶ │STRK20    │ ─────▶ │unlinkable execution │──▶│on-chain │
│      │ deposit │privacy   │ note   │identity per trade   │   │fill,    │
└──────┘        │pool      │        └────────────────────┘    │no link  │
                └──────────┘                                   │to wallet│
                                                                 └─────────┘
```

Funding and settlement amounts are visible on Starknet, same as any deposit/withdrawal — that's inherent to how the pool works. What's hidden is the link between them: which funding wallet is behind which trade, and which trades belong to the same person.

## Status

🚧 **Actively building for the STRK20 Private Sprint (14–31 Aug 2026).** Live at [veyl-tau.vercel.app](https://veyl-tau.vercel.app) (auto-deployed from `main`). This repo currently ships the wallet-connect / shield / unshield / private-transfer base (via [`strk20-starter-kit`](https://github.com/Akashneelesh/strk20-starter-kit)) plus the full landing/terminal UI. The fair-launch sealed-bid contract and unlinkable-execution-wallet backend are in active development — see [`strk20.json`](./strk20.json) for live mainnet transactions and deployed contracts as they land.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Zustand
- **Chain:** Starknet Mainnet (`SN_MAIN`), via `starknet.js` v10 / `WalletAccountV6`
- **Privacy layer:** [STRK20](https://strk20-by-example.org/what-is-strk20) — shielded notes, viewing keys, `InvokeExternal` anonymizer contracts
- **Contracts:** Cairo (Scarb)

## Getting started

```bash
npm install
cp .env.example .env.local     # add your own Alchemy Starknet RPC key
npm run dev                    # http://localhost:3000
```

You'll need:
- A free [Alchemy](https://alchemy.com) Starknet RPC key, set as `NEXT_PUBLIC_PROVIDER_URL` in `.env.local` — **never commit this file.**
- A privacy-enabled Starknet wallet (e.g. Ready) on Mainnet or Sepolia.

## STRK20 integration

Veyl integrates directly against the STRK20 privacy pool on Starknet Mainnet:

```
Pool contract: 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

- Shield / unshield / private transfer through `WalletAccountV6` — the app never touches a viewing key directly.
- Fair-launch settlement runs through a `privacy_invoke` anonymizer contract (`cairo/`), following the pool's phased balance-sheet transaction model.
- See [`strk20.json`](./strk20.json) for the running list of mainnet transactions and deployed contract addresses as this ships.

## Roadmap

- [x] Wallet connect, shield, unshield, private transfer (base)
- [ ] Unlinkable execution-wallet generation per trade
- [ ] Sealed-bid fair-launch anonymizer contract
- [ ] Veyl terminal UI (launch + trade)
- [ ] Mainnet demo + video

## Acknowledgements

Bootstrapped from [`Akashneelesh/strk20-starter-kit`](https://github.com/Akashneelesh/strk20-starter-kit), itself built on [`PhilippeR26/Starknet-WalletAccount`](https://github.com/PhilippeR26/Starknet-WalletAccount). Built against the [STRK20 protocol](https://strk20-by-example.org/) for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon).

## License

[MIT](./LICENSE)
