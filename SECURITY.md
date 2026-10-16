# CreditRail — Smart Contract Security & Adversarial Analysis

## 1. Security Philosophy
CreditRail adopts a defensive, minimalist security posture designed for institutional-grade reliability. Rather than relying on complex upgradeable proxy patterns or dynamic governance votes, the protocol uses **immutable, non-upgradeable contracts** with clear invariants and mathematically bounded operational parameters.

---

## 2. Threat Modeling & Defensive Invariants

### 2.1 Reentrancy Protection
- **Vulnerability**: Malicious ERC-777 or custom callback tokens re-entering contract state during `borrow()`, `repay()`, or `withdrawCollateral()`.
- **Mitigation**:
  - All state transitions strictly follow the **Checks-Effects-Interactions (CEI)** pattern.
  - Custom gas-optimized reentrancy lock `nonReentrant` protects all external entry points involving token transfers.
  - Intra-block interest updates occur before any token leaves the contract.

### 2.2 Oracle Security & Staleness Mitigation
- **Vulnerability**: Oracle manipulation, flash-loan price spikes, stale or negative oracle feeds causing unjustified liquidations or bad debt.
- **Mitigation**:
  - `_getFreshPrice()` requires:
    1. `price > 0`: Prevents division-by-zero or inverted liquidation logic from negative oracle responses.
    2. `updatedAt != 0` and `block.timestamp - updatedAt <= maxPriceStaleness`: Reverts if the oracle report is older than the staleness window (configured to 86,400s).
    3. `answeredInRound >= roundId`: Verifies round completeness and prevents stale round replays.

### 2.3 Non-Standard ERC-20 Compatibility (USDT Edge Cases)
- **Vulnerability**: Tokens like Tether USD (USDT) do not return a boolean `true` on successful `transfer` and `transferFrom`, causing standard OpenZeppelin `IERC20` calls to revert.
- **Mitigation**:
  - `CreditRailVault` implements low-level assembly-based `_safeTransfer` and `_safeTransferFrom` routines.
  - Verifies contract existence (`to.code.length > 0`).
  - Accepts both standard ABI boolean responses (`true`) and empty return data (`returndatasize() == 0`).

### 2.4 Decimal Invariant & Precision Rounding
- **Vulnerability**: Incompatible decimal precisions (e.g., Collateral = 18 decimals, Borrow = 6 decimals, Oracle = 8 decimals) causing catastrophic truncation or 1-wei rounding exploits.
- **Mitigation**:
  - Deterministic dimensional scaling formula:
    $$\text{collateralValue} = \frac{\text{amount} \times \text{price} \times 10^{\text{borrowDecimals}}}{10^{\text{colDecimals}} \times 10^{\text{oracleDecimals}}}$$
  - Multiplications precede divisions to prevent precision decay.
  - Liquidator collateral seizure calculation multiplies numerator first:
    $$\text{collateralToSeize} = \frac{\text{debtCovered} \times (10000 + \text{liquidationBonusBps}) \times 10^{\text{colDec}} \times 10^{\text{oracleDec}}}{\text{price} \times 10^{\text{borrowDec}} \times 10000}$$

### 2.5 Repayment Waterfall Integrity
- **Vulnerability**: Debtors bypassing accrued interest to reduce principal debt and artificially elevate their borrowing capacity.
- **Mitigation**:
  - All repayments are systematically directed to pending interest first.
  - Only remainder funds reduce `principalDebt`.
  - Zero-time interest accrual (`Δt == 0`) returns strictly zero, eliminating intra-block double-charging.

### 2.6 Emergency Circuit Breakers (Pause & Recovery)
- **Vulnerability**: System-wide vulnerabilities or market instability requiring protocol freeze.
- **Mitigation**:
  - Protocol owner can trigger `pause()` to prevent new deposits, borrows, or redraws.
  - **Graceful Unwind**: While paused, `repay()` is deliberately allowed to remain active, guaranteeing borrowers the right to extinguish debt and safeguard their collateral under any conditions.

---

## 3. Automated Test Verification Results
All 38 automated test cases in `scripts/test.js` pass with 0 failures:
- Artifact & bytecode bounds verification (100% compliance with EIP-170).
- Integer precision and 18-to-6 decimal normalization.
- Strict repayment waterfall accounting.
- Margin enforcement (reverts on 75.01% borrow).
- Liquidation trigger thresholds and bonus math.
- Storage slot packing bit-shift invariants.
- Live RPC query simulation against BOT Chain Mainnet.
