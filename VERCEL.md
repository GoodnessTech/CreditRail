# CreditRail — Vercel Deployment Guide

This repository is pre-configured for seamless zero-config deployment on [Vercel](https://vercel.com).

---

## 1. Quick Deploy Steps

1. **Import Git Repository**:
   - Go to your Vercel Dashboard: [vercel.com/new](https://vercel.com/new)
   - Select your repository: `GoodnessTech/CreditRail`
2. **Build and Output Settings** (Pre-configured via `vercel.json`):
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (or `CreditRail Frontend` if deploying frontend only)
   - **Build Command**: `cd "CreditRail Frontend" && npm install && npm run build` (automatic)
   - **Output Directory**: `CreditRail Frontend/dist` (automatic)
3. **Configure Environment Variables** (see below).
4. **Deploy**: Click **Deploy**.

---

## 2. Required Environment Variables for Vercel

Under **Project Settings → Environment Variables**, add the following 6 variables:

| Variable Name | Production Value | Description |
| :--- | :--- | :--- |
| `VITE_VAULT_ADDRESS` | `0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8` | Deployed CreditRailVault address on BOT Chain |
| `VITE_COLLATERAL_TOKEN_ADDRESS` | `0x2082599c9c35918774908110d0627e8b3b468152` | Staked BOT Collateral Token (`stBOT`, 18 decimals) |
| `VITE_BORROW_TOKEN_ADDRESS` | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` | Tether USD (`USDT`, 6 decimals) on BOT Chain |
| `VITE_PRICE_FEED_ADDRESS` | `0x265c1fd8b34ca72d37a7b216fc52fb0dcdc29f33` | Chainlink-compatible price feed ($2,000 / stBOT) |
| `VITE_BOTCHAIN_RPC` | `https://rpc.botchain.ai` | Official BOT Chain Mainnet RPC endpoint |
| `VITE_CHAIN_ID` | `677` | BOT Chain Mainnet EVM Chain ID |

> [!NOTE]
> Even if environment variables are omitted, the application code in `src/config.ts` includes built-in fallback values for all verified BOT Chain Mainnet contract addresses.

---

## 3. Local Verification

To test the Vercel build output locally:
```bash
npm run build
```
This builds the production assets into `CreditRail Frontend/dist`.
