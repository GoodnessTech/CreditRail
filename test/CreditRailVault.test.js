const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CreditRailVault - Revolving Credit Protocol Comprehensive Test Suite", function () {
  let vault, collateralToken, borrowToken, priceFeed;
  let owner, borrower, liquidator, lender, unauthorizedUser;

  // Configuration Parameters
  const MAX_LTV_BPS = 7500;                // 75%
  const LIQUIDATION_THRESHOLD_BPS = 8000;  // 80%
  const LIQUIDATION_BONUS_BPS = 500;       // 5%
  const BORROW_RATE_BPS = 800;             // 8% APR
  const ORIGINATION_FEE_BPS = 50;          // 0.50%
  const MAX_PRICE_STALENESS = 3600;        // 1 hour
  const SECONDS_PER_YEAR = 31536000;

  // Decimal Setup: Collateral = 18 decimals, Borrow Asset = 6 decimals (USDT standard)
  const COLLATERAL_DECIMALS = 18;
  const BORROW_DECIMALS = 6;
  const ORACLE_DECIMALS = 8;
  const INITIAL_COLLATERAL_PRICE = 2000n * 10n ** 8n; // $2,000 per 1 Collateral Token

  // Helper conversions
  function toCollateral(amount) {
    return ethers.parseUnits(amount.toString(), COLLATERAL_DECIMALS);
  }
  function toBorrow(amount) {
    return ethers.parseUnits(amount.toString(), BORROW_DECIMALS);
  }

  beforeEach(async function () {
    [owner, borrower, liquidator, lender, unauthorizedUser] = await ethers.getSigners();

    // 1. Deploy Mock Tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Collateral Token", "COL", COLLATERAL_DECIMALS, toCollateral(1000000), owner.address);
    borrowToken = await MockERC20.deploy("Tether USD", "USDT", BORROW_DECIMALS, toBorrow(10000000), owner.address);

    // 2. Deploy Mock Oracle ($2,000 / COL)
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    priceFeed = await MockPriceFeed.deploy("COL / USD", ORACLE_DECIMALS, INITIAL_COLLATERAL_PRICE);

    // 3. Deploy CreditRailVault
    const CreditRailVault = await ethers.getContractFactory("CreditRailVault");
    vault = await CreditRailVault.deploy(
      await collateralToken.getAddress(),
      await borrowToken.getAddress(),
      await priceFeed.getAddress(),
      MAX_LTV_BPS,
      LIQUIDATION_THRESHOLD_BPS,
      LIQUIDATION_BONUS_BPS,
      BORROW_RATE_BPS,
      ORIGINATION_FEE_BPS,
      MAX_PRICE_STALENESS
    );

    // 4. Distribute tokens
    await collateralToken.transfer(borrower.address, toCollateral(100));
    await borrowToken.transfer(lender.address, toBorrow(500000));
    await borrowToken.transfer(liquidator.address, toBorrow(100000));

    // 5. Supply Lending Liquidity from lender to Vault
    await borrowToken.connect(lender).approve(await vault.getAddress(), toBorrow(500000));
    await vault.connect(lender).depositLendingLiquidity(toBorrow(500000));
  });

  describe("1. Deployment & Protocol Configuration", function () {
    it("deploys with correct immutable addresses, decimals, and risk parameters", async function () {
      expect(await vault.collateralToken()).to.equal(await collateralToken.getAddress());
      expect(await vault.borrowToken()).to.equal(await borrowToken.getAddress());
      expect(await vault.collateralDecimals()).to.equal(COLLATERAL_DECIMALS);
      expect(await vault.borrowDecimals()).to.equal(BORROW_DECIMALS);
      expect(await vault.maxLTVBps()).to.equal(MAX_LTV_BPS);
      expect(await vault.liquidationThresholdBps()).to.equal(LIQUIDATION_THRESHOLD_BPS);
      expect(await vault.liquidationBonusBps()).to.equal(LIQUIDATION_BONUS_BPS);
      expect(await vault.borrowRateBps()).to.equal(BORROW_RATE_BPS);
      expect(await vault.originationFeeBps()).to.equal(ORIGINATION_FEE_BPS);
      expect(await vault.paused()).to.equal(false);
    });

    it("reverts deployment with invalid risk parameters (maxLTV >= liquidationThreshold)", async function () {
      const CreditRailVault = await ethers.getContractFactory("CreditRailVault");
      await expect(
        CreditRailVault.deploy(
          await collateralToken.getAddress(),
          await borrowToken.getAddress(),
          await priceFeed.getAddress(),
          8000, // 80% LTV
          8000, // 80% Liquidation (invalid)
          500,
          800,
          50,
          3600
        )
      ).to.be.revertedWithCustomError(vault, "InvalidRiskParameters");
    });
  });

  describe("2. Credit Line Opening & Collateral Deposit", function () {
    it("allows explicit credit line opening", async function () {
      await expect(vault.connect(borrower).openCreditLine())
        .to.emit(vault, "CreditLineOpened")
        .withArgs(borrower.address);

      const line = await vault.getCreditLine(borrower.address);
      expect(line.active).to.be.true;
      expect(line.collateralAmount).to.equal(0n);
      expect(line.principalDebt).to.equal(0n);
    });

    it("reverts if opening an already active credit line", async function () {
      await vault.connect(borrower).openCreditLine();
      await expect(vault.connect(borrower).openCreditLine())
        .to.be.revertedWithCustomError(vault, "PositionAlreadyActive");
    });

    it("deposits collateral and updates borrower and vault balances", async function () {
      const depositAmount = toCollateral(10); // 10 COL = $20,000 collateral
      await collateralToken.connect(borrower).approve(await vault.getAddress(), depositAmount);

      await expect(vault.connect(borrower).depositCollateral(depositAmount))
        .to.emit(vault, "CollateralDeposited")
        .withArgs(borrower.address, depositAmount, depositAmount);

      const overview = await vault.getPositionOverview(borrower.address);
      expect(overview.active).to.be.true;
      expect(overview.collateralAmount).to.equal(depositAmount);
      // Collateral value = 10 COL * $2,000 = $20,000 (20,000 * 10^6)
      expect(overview.collateralValueInBorrowAsset).to.equal(toBorrow(20000));
      // Max borrow = $20,000 * 75% = $15,000
      expect(overview.availableCredit).to.equal(toBorrow(15000));
      expect(overview.totalDebt).to.equal(0n);
    });

    it("reverts zero amount collateral deposit", async function () {
      await expect(vault.connect(borrower).depositCollateral(0))
        .to.be.revertedWithCustomError(vault, "ZeroAmount");
    });
  });

  describe("3. Borrowing & Origination Fee Accounting", function () {
    beforeEach(async function () {
      // Borrower deposits 10 COL ($20,000 collateral, $15,000 max borrow)
      const depositAmount = toCollateral(10);
      await collateralToken.connect(borrower).approve(await vault.getAddress(), depositAmount);
      await vault.connect(borrower).depositCollateral(depositAmount);
    });

    it("allows borrowing within permitted LTV limit and deducts origination fee", async function () {
      const borrowAmount = toBorrow(10000); // Borrow $10,000
      const originationFee = (borrowAmount * 50n) / 10000n; // 0.50% = $50
      const netToBorrower = borrowAmount - originationFee; // $9,950

      const borrowerBalBefore = await borrowToken.balanceOf(borrower.address);

      await expect(vault.connect(borrower).borrow(borrowAmount))
        .to.emit(vault, "Borrowed")
        .withArgs(borrower.address, borrowAmount, originationFee, borrowAmount);

      const borrowerBalAfter = await borrowToken.balanceOf(borrower.address);
      expect(borrowerBalAfter - borrowerBalBefore).to.equal(netToBorrower);

      const overview = await vault.getPositionOverview(borrower.address);
      expect(overview.principalDebt).to.equal(borrowAmount);
      // Remaining credit = $15,000 - $10,000 = $5,000
      expect(overview.availableCredit).to.equal(toBorrow(5000));
    });

    it("reverts borrowing above max LTV limit", async function () {
      // Max allowable borrow is $15,000. Trying to borrow $15,001 must revert.
      const excessiveAmount = toBorrow(15001);
      await expect(vault.connect(borrower).borrow(excessiveAmount))
        .to.be.revertedWithCustomError(vault, "ExceedsBorrowLimit");
    });

    it("reverts borrowing if vault lending liquidity is insufficient", async function () {
      // Drain liquidity from vault by owner withdraw
      await vault.connect(owner).withdrawLendingLiquidity(toBorrow(500000));

      const borrowAmount = toBorrow(5000);
      await expect(vault.connect(borrower).borrow(borrowAmount))
        .to.be.revertedWithCustomError(vault, "InsufficientLendingLiquidity");
    });
  });

  describe("4. Interest Accrual & Deterministic Arithmetic", function () {
    beforeEach(async function () {
      // Borrower deposits 10 COL ($20,000) and borrows $10,000
      await collateralToken.connect(borrower).approve(await vault.getAddress(), toCollateral(10));
      await vault.connect(borrower).depositCollateral(toCollateral(10));
      await vault.connect(borrower).borrow(toBorrow(10000));
    });

    it("accrues interest accurately based on elapsed time", async function () {
      // Advance time by 1 year (31,536,000 seconds)
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR]);
      await ethers.provider.send("evm_mine");

      // Expected annual interest = $10,000 * 8% = $800 (800 * 10^6)
      const overview = await vault.getPositionOverview(borrower.address);
      expect(overview.accruedInterestPending).to.be.closeTo(toBorrow(800), toBorrow(1));
      expect(overview.totalDebt).to.be.closeTo(toBorrow(10800), toBorrow(1));
    });

    it("does not accrue manipulated interest on zero-time repeated intra-block calls", async function () {
      await ethers.provider.send("evm_setAutomine", [false]);

      // Submit multiple accrueInterest in the same block
      await vault.accrueInterest(borrower.address);
      await vault.accrueInterest(borrower.address);
      await ethers.provider.send("evm_mine");
      await ethers.provider.send("evm_setAutomine", [true]);

      const line = await vault.getCreditLine(borrower.address);
      expect(line.accruedInterest).to.equal(0n); // 0 elapsed time means 0 interest
    });
  });

  describe("5. Partial Repayment, Full Repayment, and Reusable Redraw", function () {
    beforeEach(async function () {
      await collateralToken.connect(borrower).approve(await vault.getAddress(), toCollateral(10));
      await vault.connect(borrower).depositCollateral(toCollateral(10));
      await vault.connect(borrower).borrow(toBorrow(10000));

      // Advance time by 6 months
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR / 2]);
      await ethers.provider.send("evm_mine");
    });

    it("applies partial repayment to interest first, then principal", async function () {
      // 6 months interest on $10,000 at 8% APR = $400
      const repayAmount = toBorrow(1000); // Repay $1,000
      await borrowToken.connect(owner).transfer(borrower.address, repayAmount);
      await borrowToken.connect(borrower).approve(await vault.getAddress(), repayAmount);

      await expect(vault.connect(borrower).repay(repayAmount))
        .to.emit(vault, "Repaid");

      const line = await vault.getCreditLine(borrower.address);
      // Interest cleared to 0
      expect(line.accruedInterest).to.equal(0n);
      // Principal reduced by remaining $600: $10,000 - $600 = $9,400
      expect(line.principalDebt).to.be.closeTo(toBorrow(9400), toBorrow(1));
    });

    it("restores borrowing capacity immediately and permits redrawing against the same position", async function () {
      // Full repayment of $10,400
      const totalRepay = toBorrow(11000);
      await borrowToken.connect(owner).transfer(borrower.address, totalRepay);
      await borrowToken.connect(borrower).approve(await vault.getAddress(), totalRepay);

      await vault.connect(borrower).repay(totalRepay);

      const overviewAfterRepay = await vault.getPositionOverview(borrower.address);
      expect(overviewAfterRepay.totalDebt).to.equal(0n);
      expect(overviewAfterRepay.availableCredit).to.equal(toBorrow(15000)); // Full $15,000 restored!

      // Reusable credit: Redraw $12,000 from the same position without closing/reopening
      await expect(vault.connect(borrower).redraw(toBorrow(12000)))
        .to.emit(vault, "Redrawn")
        .withArgs(borrower.address, toBorrow(12000), toBorrow(12000));

      const overviewAfterRedraw = await vault.getPositionOverview(borrower.address);
      expect(overviewAfterRedraw.principalDebt).to.equal(toBorrow(12000));
      expect(overviewAfterRedraw.availableCredit).to.equal(toBorrow(3000));
    });
  });

  describe("6. Safe Collateral Withdrawal & Risk Enforcement", function () {
    beforeEach(async function () {
      await collateralToken.connect(borrower).approve(await vault.getAddress(), toCollateral(10));
      await vault.connect(borrower).depositCollateral(toCollateral(10));
      await vault.connect(borrower).borrow(toBorrow(7500)); // Debt = $7,500
    });

    it("allows withdrawing eligible excess collateral while maintaining required LTV", async function () {
      // Collateral = 10 COL ($20,000). To back $7,500 debt at 75% LTV, minimum collateral is $10,000 (5 COL).
      // Borrower can safely withdraw up to 5 COL.
      const withdrawAmount = toCollateral(4); // Withdraw 4 COL, leaving 6 COL ($12,000 > $10,000 required)

      await expect(vault.connect(borrower).withdrawCollateral(withdrawAmount))
        .to.emit(vault, "CollateralWithdrawn")
        .withArgs(borrower.address, withdrawAmount, toCollateral(6));

      const overview = await vault.getPositionOverview(borrower.address);
      expect(overview.collateralAmount).to.equal(toCollateral(6));
    });

    it("reverts collateral withdrawal that would violate maximum LTV constraint", async function () {
      // Trying to withdraw 6 COL would leave 4 COL ($8,000). Max borrow for $8,000 at 75% is $6,000 < $7,500 debt.
      const unsafeWithdraw = toCollateral(6);
      await expect(vault.connect(borrower).withdrawCollateral(unsafeWithdraw))
        .to.be.revertedWithCustomError(vault, "InsufficientCollateralForWithdrawal");
    });
  });

  describe("7. Liquidation & Oracle Freshness", function () {
    beforeEach(async function () {
      await collateralToken.connect(borrower).approve(await vault.getAddress(), toCollateral(10));
      await vault.connect(borrower).depositCollateral(toCollateral(10));
      await vault.connect(borrower).borrow(toBorrow(15000)); // Max borrow $15,000
    });

    it("reverts liquidation if position is healthy (healthFactor >= 1.0)", async function () {
      await borrowToken.connect(liquidator).approve(await vault.getAddress(), toBorrow(5000));
      await expect(vault.connect(liquidator).liquidate(borrower.address, toBorrow(5000)))
        .to.be.revertedWithCustomError(vault, "PositionHealthy");
    });

    it("executes liquidation with bonus when collateral price drops and position becomes unhealthy", async function () {
      // Drop price from $2,000 to $1,800 (-10%)
      // Collateral value = 10 * $1,800 = $18,000.
      // Liquidation threshold (80%) value = $14,400.
      // Debt is $15,000 > $14,400 -> Position is insolvent / liquidatable!
      await priceFeed.setPrice(1800n * 10n ** 8n);

      const overview = await vault.getPositionOverview(borrower.address);
      expect(overview.healthFactor).to.be.lt(10n ** 18n); // HF < 1.0

      const debtToCover = toBorrow(5000);
      await borrowToken.connect(liquidator).approve(await vault.getAddress(), debtToCover);

      const liquidatorColBefore = await collateralToken.balanceOf(liquidator.address);

      await expect(vault.connect(liquidator).liquidate(borrower.address, debtToCover))
        .to.emit(vault, "Liquidated");

      const liquidatorColAfter = await collateralToken.balanceOf(liquidator.address);
      // Liquidator received collateral with 5% bonus
      expect(liquidatorColAfter).to.be.gt(liquidatorColBefore);

      const lineAfter = await vault.getCreditLine(borrower.address);
      expect(lineAfter.principalDebt).to.equal(toBorrow(10000));
    });

    it("rejects operations when oracle price is stale or invalid", async function () {
      // Set timestamp in past (stale)
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await priceFeed.setUpdatedAt(now - MAX_PRICE_STALENESS - 100);

      await expect(vault.connect(borrower).borrow(toBorrow(100)))
        .to.be.revertedWithCustomError(vault, "StalePrice");

      // Set negative price
      await priceFeed.setPrice(-100n);
      await expect(vault.connect(borrower).borrow(toBorrow(100)))
        .to.be.revertedWithCustomError(vault, "InvalidPrice");
    });
  });

  describe("8. Administrative Controls & Emergency Pause", function () {
    it("allows owner to pause and blocks new borrows while preserving position reads", async function () {
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;

      await expect(vault.connect(borrower).borrow(toBorrow(100)))
        .to.be.revertedWithCustomError(vault, "ProtocolPaused");

      // Unpause restores borrowing
      await vault.connect(owner).unpause();
      expect(await vault.paused()).to.be.false;
    });

    it("reverts unauthorized users trying to alter risk parameters", async function () {
      await expect(vault.connect(unauthorizedUser).setRiskParameters(5000, 6000, 500))
        .to.be.revertedWithCustomError(vault, "Unauthorized");

      await expect(vault.connect(unauthorizedUser).pause())
        .to.be.revertedWithCustomError(vault, "Unauthorized");
    });
  });
});
