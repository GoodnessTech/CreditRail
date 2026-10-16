# CreditRail Protocol - Automated Test Results

**Execution Timestamp:** 2026-10-16T07:58:14.651Z
**Target Network:** BOT Chain Mainnet (Chain ID 677)
**Total Tests Run:** 38
**Passed:** 38
**Failed:** 0
**Status:** ALL TESTS PASSED

## Test Execution Log

| Test Scenario | Status | Result |
| :--- | :---: | :--- |
| CreditRailVault artifact exists | **PASSED** | Verified correct on-chain invariant |
| Bytecode size within EIP-170 limit (15540 bytes / 24576 max, 63.2%) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes depositCollateral(uint256) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes borrow(uint256) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes repay(uint256) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes redraw(uint256) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes withdrawCollateral(uint256) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes liquidate(address,uint256) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes getPositionOverview(address) | **PASSED** | Verified correct on-chain invariant |
| Vault exposes getProtocolMetrics() | **PASSED** | Verified correct on-chain invariant |
| Vault defines custom error ExceedsBorrowLimit() | **PASSED** | Verified correct on-chain invariant |
| Vault defines custom error InsufficientCollateralForWithdrawal() | **PASSED** | Verified correct on-chain invariant |
| Vault defines custom error PositionHealthy() | **PASSED** | Verified correct on-chain invariant |
| Vault defines custom error ProtocolPaused() | **PASSED** | Verified correct on-chain invariant |
| Collateral value accurately converts 18-dec to 6-dec ($20,000 USDT) | **PASSED** | Verified correct on-chain invariant |
| Max borrow at 75% LTV equals $15,000 USDT | **PASSED** | Verified correct on-chain invariant |
| Origination fee is exactly $50 USDT (0.50%) | **PASSED** | Verified correct on-chain invariant |
| Net drawn funds received by borrower is $9,950 USDT | **PASSED** | Verified correct on-chain invariant |
| Annual interest accrual on $10,000 at 8% equals exactly $800 USDT | **PASSED** | Verified correct on-chain invariant |
| Intra-block interest accrual is strictly zero | **PASSED** | Verified correct on-chain invariant |
| Total debt equals principal + accrued interest ($10,800 USDT) | **PASSED** | Verified correct on-chain invariant |
| Repayment correctly cleared $800 accrued interest first | **PASSED** | Verified correct on-chain invariant |
| Repayment reduced principal debt by $200 | **PASSED** | Verified correct on-chain invariant |
| Remaining principal debt is $9,800 USDT | **PASSED** | Verified correct on-chain invariant |
| Total debt is now $9,800 USDT | **PASSED** | Verified correct on-chain invariant |
| Borrowing capacity restored to $5,200 USDT without closing position | **PASSED** | Verified correct on-chain invariant |
| Redraw amount is within restored capacity | **PASSED** | Verified correct on-chain invariant |
| Redraw increased principal debt to $12,800 USDT against same position | **PASSED** | Verified correct on-chain invariant |
| Unsafe collateral withdrawal correctly identified as violating max LTV | **PASSED** | Verified correct on-chain invariant |
| Safe collateral withdrawal correctly permitted (9 COL backs $12,800 debt) | **PASSED** | Verified correct on-chain invariant |
| Healthy position has HF = 1.25 (> 1.0, not liquidatable) | **PASSED** | Verified correct on-chain invariant |
| Price shock drops Health Factor to 0.9375 (< 1.0, eligible for liquidation) | **PASSED** | Verified correct on-chain invariant |
| Liquidator receives exactly 3.50 COL ($5,250 value for $5,000 repaid = 5% incentive) | **PASSED** | Verified correct on-chain invariant |
| Slot 0 is 100% tightly packed to 256 bits (zero wasted storage) | **PASSED** | Verified correct on-chain invariant |
| Slot 1 fits in a single 256-bit slot (200 bits total) | **PASSED** | Verified correct on-chain invariant |
| Complete borrower state requires only 2 storage slots (saving 50% vs 4-slot unpacked layout) | **PASSED** | Verified correct on-chain invariant |
| Connected to BOT Chain Mainnet (Chain ID: 677) | **PASSED** | Verified correct on-chain invariant |
| Latest block number retrieved: 26870772 | **PASSED** | Verified correct on-chain invariant |
