# CreditRail — BOT Chain Mainnet Deployment Evidence

## Network & Infrastructure
- **Network Name**: BOT Chain Mainnet
- **Chain ID**: `677` (`0x2a5`)
- **Native Currency**: `BOT` (18 decimals)
- **RPC Endpoint**: `https://rpc.botchain.ai`
- **Block Explorer**: [BOTScan](https://scan.botchain.ai)
- **Official Documentation**: [BOT Chain Developer Docs](https://dev-docs.botchain.ai)

---

## Deployed Contract Registry

| Contract | Address | Block | Tx Hash | Gas Used | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CreditRailVault** | [`0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8`](https://scan.botchain.ai/address/0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8) | `26871599` | [`0xa9ff478ac0e53e4eac8d26574ecfe022817dc687701c3f4c9312def691f3a9b6`](https://scan.botchain.ai/tx/0xa9ff478ac0e53e4eac8d26574ecfe022817dc687701c3f4c9312def691f3a9b6) | 3,522,604 | **Verified & Active** |
| **CreditRail Staked Collateral (stBOT)** | [`0x2082599c9c35918774908110d0627e8b3b468152`](https://scan.botchain.ai/address/0x2082599c9c35918774908110d0627e8b3b468152) | `26871585` | [`0xdee7d6eafa95c1fbb180ca27b506854181897ee52df83d554e2bb2fd8aa09798`](https://scan.botchain.ai/tx/0xdee7d6eafa95c1fbb180ca27b506854181897ee52df83d554e2bb2fd8aa09798) | 704,432 | **Verified & Active** |
| **Price Feed (stBOT / USD)** | [`0x265c1fd8b34ca72d37a7b216fc52fb0dcdc29f33`](https://scan.botchain.ai/address/0x265c1fd8b34ca72d37a7b216fc52fb0dcdc29f33) | `26871591` | [`0xd39d93b401f400810eae6d40353f21ba0a61a8a113dbd98ee1588b1aba6fa0eb`](https://scan.botchain.ai/tx/0xd39d93b401f400810eae6d40353f21ba0a61a8a113dbd98ee1588b1aba6fa0eb) | 443,008 | **Verified & Active** |
| **Borrow Asset (USDT)** | [`0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C`](https://scan.botchain.ai/address/0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C) | Verified | Native BOT Chain Tether USD | 6 Decimals | **Verified On-Chain** |

---

## Deployer Wallet Evidence
- **Operator Address**: `0x34a19B30d9edD62424802d323E81c25599A9f02e`
- **Initial Balance at Gate**: `0.2194 BOT`
- **Balance Post-Deployment**: `0.1174 BOT`
- **Total Deployment Gas Expended**: 4,670,044 gas
- **Total Network Cost in BOT**: `0.1020 BOT` (at ~21.8 Gwei effective gas price)

---

## On-Chain Parameter Verification (Queried directly via RPC)
Direct queries executed against `0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8` at block `26871599`:
- `owner()`: `0x34a19B30d9edD62424802d323E81c25599A9f02e` (Matches Deployer)
- `collateralToken()`: `0x2082599c9c35918774908110d0627e8b3b468152` (stBOT)
- `borrowToken()`: `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` (USDT)
- `priceFeed()`: `0x265c1fd8b34ca72d37a7b216fc52fb0dcdc29f33` (stBOT / USD)
- `maxLTVBps()`: `7500` (75.00% Maximum Borrow Margin)
- `liquidationThresholdBps()`: `8000` (80.00% Liquidation Trigger)
- `liquidationBonusBps()`: `500` (5.00% Liquidator Incentive)
- `borrowRateBps()`: `800` (8.00% APR Interest Rate)
- `originationFeeBps()`: `50` (0.50% Draw Fee)
- `paused()`: `false`
- `getProtocolMetrics()`:
  * Total Collateral: `0`
  * Total Principal Debt: `0`
  * Total Accrued Interest: `0`
  * Total Lending Liquidity: `0`
  * Accumulated Fees: `0`
  * Paused: `false`
