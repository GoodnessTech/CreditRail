# CreditRail — On-Chain Revolving Credit Facility on BOT Chain

[![BOT Chain Mainnet](https://img.shields.io/badge/Network-BOT%20Chain%20Mainnet%20(677)-blue)](https://scan.botchain.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bytecode Size](https://img.shields.io/badge/Bytecode-15.54KB%20%2F%2024.57KB-emerald)](https://scan.botchain.ai/address/0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8)
[![Tests Passing](https://img.shields.io/badge/Tests-38%20Passed%2C%200%20Failed-brightgreen)](TEST_RESULTS.md)

CreditRail is an on-chain revolving credit-line primitive for approved, overcollateralized borrowers deployed natively on **BOT Chain Mainnet** (Chain ID: `677`).

The defining capability is **reusable borrowing capacity**:
1. Deposit Collateral (`stBOT`)
2. Open Credit Line
3. Draw Borrow Asset (`USDT`)
4. Accrue Deterministic Interest (8% APR)
5. Repay Debt
6. **Immediately Redraw** against the same credit line without closing or recreating the position
7. Withdraw surplus collateral when health factor permits.

---

## Verified Mainnet Contracts (BOT Chain - Chain ID 677)

| Contract | Address | Explorer Link |
| :--- | :--- | :--- |
| **CreditRailVault** | `0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8` | [View on BOTScan](https://scan.botchain.ai/address/0x1c80fee5ab55b07349b9c0a8e6376e496970c2d8) |
| **stBOT Collateral Token** | `0x2082599c9c35918774908110d0627e8b3b468152` | [View on BOTScan](https://scan.botchain.ai/address/0x2082599c9c35918774908110d0627e8b3b468152) |
| **Price Feed (stBOT / USD)**| `0x265c1fd8b34ca72d37a7b216fc52fb0dcdc29f33` | [View on BOTScan](https://scan.botchain.ai/address/0x265c1fd8b34ca72d37a7b216fc52fb0dcdc29f33) |
| **Borrow Asset (USDT)** | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` | [View on BOTScan](https://scan.botchain.ai/address/0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C) |

- **Deployment Transaction**: [`0xa9ff478ac0e53e4eac8d26574ecfe022817dc687701c3f4c9312def691f3a9b6`](https://scan.botchain.ai/tx/0xa9ff478ac0e53e4eac8d26574ecfe022817dc687701c3f4c9312def691f3a9b6)
- **Deployment Block**: `26871599`
- **Deployer Wallet**: `0x34a19B30d9edD62424802d323E81c25599A9f02e`

---

## Core Economic Parameters

- **Collateral Asset**: `stBOT` (18 Decimals)
- **Borrow Asset**: `USDT` (6 Decimals)
- **Maximum LTV**: 75.00% (`7500` bps)
- **Liquidation Threshold**: 80.00% (`8000` bps)
- **Liquidation Bonus**: 5.00% (`500` bps)
- **Borrow Interest Rate**: 8.00% APR (`800` bps)
- **Origination Draw Fee**: 0.50% (`50` bps)
- **Max Price Staleness**: 86,400 seconds (24 hours)

---

## Key Technical Highlights

1. **2-Slot Storage Packing**: Borrower position packed into two 32-byte slots, cutting gas consumption by saving 3 cold SLOADs (6,300 gas) and up to 44,000 gas on state updates.
2. **Deterministic Integer Math**: Fixed-point arithmetic with constant denominator (10,000 bps) and multiplication before division eliminates 1-wei rounding vulnerabilities and floating point issues.
3. **Strict Waterfall Accounting**: Repayments automatically extinguish pending interest before reducing principal debt, immediately releasing fresh credit capacity.
4. **Emergency Graceful Unwind**: When paused by governance, borrow and deposit actions freeze, but debt repayments remain open so borrowers can always redeem collateral.
5. **Non-Standard ERC-20 Safe Transfer**: Custom assembly routines handle tokens that omit return values (like USDT).

---

## Project Structure

```
Credit Rail/
├── contracts/
│   ├── CreditRailVault.sol           # Core revolving credit line vault
│   ├── interfaces/
│   │   ├── IERC20.sol                # ERC-20 interface
│   │   └── IPriceFeed.sol            # Chainlink AggregatorV3 interface
│   └── mocks/
│       ├── MockERC20.sol             # Configurable decimal ERC-20 token (stBOT)
│       └── MockPriceFeed.sol         # Chainlink-compatible test price feed
├── CreditRail Frontend/
│   ├── src/
│   │   ├── App.tsx                   # Full Web3 application with action console
│   │   ├── config.ts                 # Mainnet contract addresses, ABIs, and chain config
│   │   ├── styles.css                # Editorial styling (Newsreader, DM Mono)
│   │   └── main.tsx                  # React 19 entry point
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── compile.js                    # Solc 0.8.20 compiler with optimizer configuration
│   ├── test.js                       # 38 automated adversarial test cases
│   ├── benchmark.js                  # Solc optimizer benchmark (200 to 10,000 runs)
│   ├── deploy.js                     # BOT Chain Mainnet deployment script
│   └── verify_deployed.js            # RPC state verification
├── .env.example                      # Configuration template
├── .gitignore                        # Secret and artifact protection
├── ARCHITECTURE.md                   # System design and specifications
├── DEPLOYMENT.md                     # On-chain deployment proof and block receipts
├── GAS_REPORT.md                     # Measured gas benchmarks and optimizer report
├── SECURITY.md                       # Adversarial threat analysis and invariants
└── TEST_RESULTS.md                   # Automated test suite evidence
```

---

## Getting Started

### 1. Protocol Development & Testing
```bash
# Install root dependencies
npm install

# Compile smart contracts with Solc 0.8.20 (10,000 optimizer runs)
npm run compile

# Run adversarial test suite (38 test cases)
npm test

# Benchmark optimizer across 200, 1000, 5000, and 10000 runs
npm run benchmark
```

### 2. Running the Frontend
```bash
cd "CreditRail Frontend"

# Install frontend dependencies
npm install

# Start local development server
npm run dev

# Run production build validation (TypeScript + Vite)
npm run build
```

---

## Official Links
- **BOT Chain Official**: [https://www.botchain.ai](https://www.botchain.ai)
- **BOTScan Explorer**: [https://scan.botchain.ai](https://scan.botchain.ai)
- **Developer Quick Guide**: [https://dev-docs.botchain.ai](https://dev-docs.botchain.ai)
