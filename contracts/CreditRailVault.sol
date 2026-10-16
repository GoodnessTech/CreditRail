// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";
import "./interfaces/IPriceFeed.sol";

/**
 * @title CreditRailVault
 * @author Lead Protocol Engineer, CreditRail
 * @notice Reusable revolving credit-line primitive for overcollateralized borrowers on BOT Chain.
 * @dev Engineered for aggressive gas optimization, integer precision, reentrancy resistance,
 *      and transparent risk controls.
 *
 * Core Lifecycle:
 * Deposit collateral -> Open credit line -> Draw funds -> Accrue interest -> Repay -> Redraw -> Withdraw eligible collateral.
 * The defining differentiator is reusable borrowing capacity: repayment immediately restores borrowing capacity
 * without closing or recreating the position.
 */
contract CreditRailVault {
    // --- Constants ---
    uint256 public constant BPS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 31_536_000;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // --- Immutable Protocol Architecture ---
    IERC20 public immutable collateralToken;
    IERC20 public immutable borrowToken;
    uint8 public immutable collateralDecimals;
    uint8 public immutable borrowDecimals;

    // --- State Variables ---
    address public owner;
    IPriceFeed public priceFeed;
    uint32 public maxPriceStaleness; // in seconds (e.g., 3600 = 1 hour)
    bool public paused;
    uint256 private _reentrancyStatus;

    // Risk Parameters (in Basis Points: 10000 = 100%)
    uint16 public maxLTVBps;                // e.g., 7500 = 75%
    uint16 public liquidationThresholdBps; // e.g., 8000 = 80%
    uint16 public liquidationBonusBps;     // e.g., 500 = 5%
    uint16 public borrowRateBps;           // e.g., 800 = 8% APR
    uint16 public originationFeeBps;       // e.g., 50 = 0.50%

    // Borrow Limits (in borrowToken units)
    uint128 public minBorrowAmount;
    uint128 public maxBorrowAmount;

    // Global Accounting (in token units)
    uint128 public totalDepositedCollateral;
    uint128 public totalPrincipalDebt;
    uint128 public totalAccruedInterest;
    uint128 public totalLendingLiquidity;
    uint128 public accumulatedFees;

    // --- Storage-Packed Credit Line ---
    // Slot 0: collateralAmount (128 bits) + principalDebt (128 bits) = 256 bits
    // Slot 1: accruedInterest (128 bits) + lastAccrualTimestamp (64 bits) + active (8 bits) = 200 bits
    struct CreditLine {
        uint128 collateralAmount;
        uint128 principalDebt;
        uint128 accruedInterest;
        uint64 lastAccrualTimestamp;
        bool active;
    }

    mapping(address => CreditLine) private _creditLines;

    // --- Custom Errors (Aggressive Gas Optimization) ---
    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error ProtocolPaused();
    error ReentrancyGuardReentrantCall();
    error PositionAlreadyActive();
    error PositionNotActive();
    error ExceedsBorrowLimit();
    error BelowMinBorrow();
    error ExceedsMaxBorrow();
    error InsufficientLendingLiquidity();
    error InsufficientCollateralForWithdrawal();
    error InsufficientCollateralDeposited();
    error PositionHealthy();
    error InvalidRiskParameters();
    error InvalidPrice();
    error StalePrice();
    error SafeTransferFailed();
    error SafeTransferFromFailed();

    // --- Events ---
    event CreditLineOpened(address indexed borrower);
    event CollateralDeposited(address indexed borrower, uint256 amount, uint256 totalCollateral);
    event CollateralWithdrawn(address indexed borrower, uint256 amount, uint256 remainingCollateral);
    event Borrowed(address indexed borrower, uint256 amount, uint256 originationFee, uint256 newPrincipalDebt);
    event Repaid(address indexed borrower, uint256 interestPaid, uint256 principalPaid, uint256 newPrincipalDebt, uint256 newAccruedInterest);
    event Redrawn(address indexed borrower, uint256 amount, uint256 newPrincipalDebt);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
    event InterestAccrued(address indexed borrower, uint256 interestAmount, uint256 newAccruedInterest);
    event LendingLiquidityDeposited(address indexed supplier, uint256 amount);
    event LendingLiquidityWithdrawn(address indexed supplier, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed recipient, uint256 amount);
    event RiskParametersUpdated(uint16 maxLTVBps, uint16 liquidationThresholdBps, uint16 liquidationBonusBps);
    event RatesUpdated(uint16 borrowRateBps, uint16 originationFeeBps);
    event BorrowLimitsUpdated(uint128 minBorrowAmount, uint128 maxBorrowAmount);
    event OracleUpdated(address indexed newPriceFeed, uint32 maxPriceStaleness);
    event Paused(bool isPaused);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ProtocolPaused();
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus == _ENTERED) revert ReentrancyGuardReentrantCall();
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // --- Constructor ---
    constructor(
        address _collateralToken,
        address _borrowToken,
        address _priceFeed,
        uint16 _maxLTVBps,
        uint16 _liquidationThresholdBps,
        uint16 _liquidationBonusBps,
        uint16 _borrowRateBps,
        uint16 _originationFeeBps,
        uint32 _maxPriceStaleness
    ) {
        if (_collateralToken == address(0) || _borrowToken == address(0) || _priceFeed == address(0)) {
            revert ZeroAddress();
        }
        if (_maxLTVBps >= _liquidationThresholdBps || _liquidationThresholdBps > BPS) {
            revert InvalidRiskParameters();
        }

        owner = msg.sender;
        collateralToken = IERC20(_collateralToken);
        borrowToken = IERC20(_borrowToken);
        collateralDecimals = IERC20(_collateralToken).decimals();
        borrowDecimals = IERC20(_borrowToken).decimals();

        priceFeed = IPriceFeed(_priceFeed);
        maxLTVBps = _maxLTVBps;
        liquidationThresholdBps = _liquidationThresholdBps;
        liquidationBonusBps = _liquidationBonusBps;
        borrowRateBps = _borrowRateBps;
        originationFeeBps = _originationFeeBps;
        maxPriceStaleness = _maxPriceStaleness;

        minBorrowAmount = 1;
        maxBorrowAmount = type(uint128).max;
        _reentrancyStatus = _NOT_ENTERED;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // =========================================================================
    //                        CORE BORROWER LIFECYCLE
    // =========================================================================

    /**
     * @notice Explicitly opens a reusable revolving credit line for the sender.
     */
    function openCreditLine() external whenNotPaused {
        CreditLine storage line = _creditLines[msg.sender];
        if (line.active) revert PositionAlreadyActive();
        line.active = true;
        line.lastAccrualTimestamp = uint64(block.timestamp);
        emit CreditLineOpened(msg.sender);
    }

    /**
     * @notice Deposits collateral into the revolving credit position.
     * @param amount The quantity of collateral tokens to deposit.
     */
    function depositCollateral(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        CreditLine storage line = _creditLines[msg.sender];
        if (!line.active) {
            line.active = true;
            line.lastAccrualTimestamp = uint64(block.timestamp);
            emit CreditLineOpened(msg.sender);
        } else {
            _accrueInterest(msg.sender, line);
        }

        uint128 depositAmount = uint128(amount);
        line.collateralAmount += depositAmount;
        totalDepositedCollateral += depositAmount;

        _safeTransferFrom(address(collateralToken), msg.sender, address(this), amount);

        emit CollateralDeposited(msg.sender, amount, line.collateralAmount);
    }

    /**
     * @notice Draws funds against the deposited collateral up to the enforced LTV limit.
     * @param amount The requested borrow amount in borrow token units.
     */
    function borrow(uint256 amount) external whenNotPaused nonReentrant {
        _borrowInternal(msg.sender, amount, false);
    }

    /**
     * @notice Redraws against previously repaid capacity without closing or recreating the position.
     * @dev Core CreditRail differentiation: immediate reusable borrowing capacity.
     * @param amount The amount to redraw in borrow token units.
     */
    function redraw(uint256 amount) external whenNotPaused nonReentrant {
        _borrowInternal(msg.sender, amount, true);
    }

    /**
     * @dev Internal shared execution for borrow and redraw.
     */
    function _borrowInternal(address borrower, uint256 amount, bool isRedraw) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount < minBorrowAmount) revert BelowMinBorrow();
        if (amount > maxBorrowAmount) revert ExceedsMaxBorrow();

        CreditLine storage line = _creditLines[borrower];
        if (!line.active) revert PositionNotActive();

        _accrueInterest(borrower, line);

        uint128 drawAmount = uint128(amount);
        uint256 fee = (amount * originationFeeBps) / BPS;
        uint256 totalDebtAfter = uint256(line.principalDebt) + uint256(line.accruedInterest) + amount;

        // Check overcollateralization against maximum allowable LTV
        uint256 maxAllowableDebt = _calculateMaxBorrow(line.collateralAmount);
        if (totalDebtAfter > maxAllowableDebt) revert ExceedsBorrowLimit();

        // Check available lending liquidity in vault
        uint256 netToTransfer = amount - fee;
        uint256 availableLiquidity = uint256(totalLendingLiquidity);
        if (netToTransfer > availableLiquidity) revert InsufficientLendingLiquidity();

        unchecked {
            line.principalDebt += drawAmount;
            totalPrincipalDebt += drawAmount;
            totalLendingLiquidity -= uint128(netToTransfer);
            accumulatedFees += uint128(fee);
        }

        _safeTransfer(address(borrowToken), borrower, netToTransfer);

        if (isRedraw) {
            emit Redrawn(borrower, amount, line.principalDebt);
        } else {
            emit Borrowed(borrower, amount, fee, line.principalDebt);
        }
    }

    /**
     * @notice Repays outstanding debt, restoring revolving borrowing capacity immediately.
     * @dev Repayment reduces accrued interest first, then outstanding principal debt.
     *      Excess payment beyond total debt is immediately returned to sender.
     * @param amount Maximum amount to repay in borrow token units.
     */
    function repay(uint256 amount) external nonReentrant returns (uint256 totalRepaid) {
        if (amount == 0) revert ZeroAmount();

        CreditLine storage line = _creditLines[msg.sender];
        if (!line.active) revert PositionNotActive();

        _accrueInterest(msg.sender, line);

        uint256 interestDebt = line.accruedInterest;
        uint256 principalDebt = line.principalDebt;
        uint256 totalDebt = interestDebt + principalDebt;

        if (totalDebt == 0) revert ZeroAmount();

        // Cap repayment at actual total debt
        uint256 toRepay = amount > totalDebt ? totalDebt : amount;
        uint256 interestPaid = 0;
        uint256 principalPaid = 0;

        if (toRepay <= interestDebt) {
            interestPaid = toRepay;
        } else {
            interestPaid = interestDebt;
            principalPaid = toRepay - interestDebt;
        }

        unchecked {
            if (interestPaid > 0) {
                line.accruedInterest -= uint128(interestPaid);
                totalAccruedInterest -= uint128(interestPaid);
                accumulatedFees += uint128(interestPaid); // earned interest belongs to protocol
            }
            if (principalPaid > 0) {
                line.principalDebt -= uint128(principalPaid);
                totalPrincipalDebt -= uint128(principalPaid);
                totalLendingLiquidity += uint128(principalPaid); // principal restored to pool liquidity
            }
        }

        _safeTransferFrom(address(borrowToken), msg.sender, address(this), toRepay);

        emit Repaid(msg.sender, interestPaid, principalPaid, line.principalDebt, line.accruedInterest);
        return toRepay;
    }

    /**
     * @notice Withdraws collateral from the position while enforcing conservative risk constraints.
     * @param amount The quantity of collateral tokens to withdraw.
     */
    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        CreditLine storage line = _creditLines[msg.sender];
        if (!line.active) revert PositionNotActive();
        if (amount > line.collateralAmount) revert InsufficientCollateralDeposited();

        _accrueInterest(msg.sender, line);

        uint128 remainingCollateral = line.collateralAmount - uint128(amount);
        uint256 currentTotalDebt = uint256(line.principalDebt) + uint256(line.accruedInterest);

        // If debt exists, remaining collateral must satisfy the maximum LTV requirement
        if (currentTotalDebt > 0) {
            uint256 maxAllowedDebtWithRemaining = _calculateMaxBorrow(remainingCollateral);
            if (currentTotalDebt > maxAllowedDebtWithRemaining) {
                revert InsufficientCollateralForWithdrawal();
            }
        }

        line.collateralAmount = remainingCollateral;
        unchecked {
            totalDepositedCollateral -= uint128(amount);
        }

        _safeTransfer(address(collateralToken), msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount, remainingCollateral);
    }

    /**
     * @notice Liquidates an unhealthy position whose collateralization breached the liquidation threshold.
     * @param borrower The borrower address with an unhealthy credit line.
     * @param debtToCover The amount of debt the liquidator will repay in borrow token units.
     */
    function liquidate(address borrower, uint256 debtToCover) external nonReentrant returns (uint256 collateralSeized) {
        if (borrower == address(0)) revert ZeroAddress();
        if (debtToCover == 0) revert ZeroAmount();

        CreditLine storage line = _creditLines[borrower];
        if (!line.active) revert PositionNotActive();

        _accrueInterest(borrower, line);

        uint256 totalDebt = uint256(line.principalDebt) + uint256(line.accruedInterest);
        if (totalDebt == 0) revert PositionHealthy();

        // Check health factor: healthFactor < 1e18 means unhealthy
        uint256 hf = _getHealthFactor(line.collateralAmount, totalDebt);
        if (hf >= 1e18) revert PositionHealthy();

        uint256 actualCover = debtToCover > totalDebt ? totalDebt : debtToCover;

        // Calculate collateral seized = (actualCover * priceDecimalsFactor * (10000 + bonus)) / (price * 10000)
        uint256 price = _getFreshPrice();
        uint8 oracleDecimals = priceFeed.decimals();
        
        // Value of debt in collateral token terms with liquidation bonus
        uint256 debtValueInCollateral = (actualCover * (10 ** collateralDecimals) * (10 ** oracleDecimals)) / 
                                        (price * (10 ** borrowDecimals));
        collateralSeized = (debtValueInCollateral * (BPS + liquidationBonusBps)) / BPS;

        // Cap at borrower's actual collateral
        if (collateralSeized > line.collateralAmount) {
            collateralSeized = line.collateralAmount;
        }

        // Apply debt reduction: interest first, then principal
        uint256 interestRepaid = 0;
        uint256 principalRepaid = 0;
        if (actualCover <= line.accruedInterest) {
            interestRepaid = actualCover;
        } else {
            interestRepaid = line.accruedInterest;
            principalRepaid = actualCover - interestRepaid;
        }

        unchecked {
            line.accruedInterest -= uint128(interestRepaid);
            line.principalDebt -= uint128(principalRepaid);
            line.collateralAmount -= uint128(collateralSeized);

            totalAccruedInterest -= uint128(interestRepaid);
            totalPrincipalDebt -= uint128(principalRepaid);
            totalDepositedCollateral -= uint128(collateralSeized);
            accumulatedFees += uint128(interestRepaid);
            totalLendingLiquidity += uint128(principalRepaid);
        }

        // Execute transfers
        _safeTransferFrom(address(borrowToken), msg.sender, address(this), actualCover);
        _safeTransfer(address(collateralToken), msg.sender, collateralSeized);

        emit Liquidated(borrower, msg.sender, actualCover, collateralSeized);
        return collateralSeized;
    }

    // =========================================================================
    //                        INTEREST ACCRUAL MODEL
    // =========================================================================

    /**
     * @notice Explicit public trigger to accrue interest for a given borrower.
     */
    function accrueInterest(address borrower) external {
        CreditLine storage line = _creditLines[borrower];
        if (line.active) {
            _accrueInterest(borrower, line);
        }
    }

    /**
     * @dev Continuous deterministic time-based interest accrual.
     *      Protects against intra-block repeated calls (elapsedSeconds == 0).
     */
    function _accrueInterest(address borrower, CreditLine storage line) internal {
        uint256 lastTs = uint256(line.lastAccrualTimestamp);
        uint256 elapsed = block.timestamp - lastTs;

        if (elapsed > 0) {
            line.lastAccrualTimestamp = uint64(block.timestamp);
            uint256 principal = line.principalDebt;
            if (principal > 0 && borrowRateBps > 0) {
                // interest = (principal * rateBps * elapsed) / (BPS * SECONDS_PER_YEAR)
                uint256 newInterest = (principal * uint256(borrowRateBps) * elapsed) / (BPS * SECONDS_PER_YEAR);
                if (newInterest > 0) {
                    uint128 interest128 = uint128(newInterest);
                    line.accruedInterest += interest128;
                    totalAccruedInterest += interest128;
                    emit InterestAccrued(borrower, newInterest, line.accruedInterest);
                }
            }
        }
    }

    // =========================================================================
    //                        FINANCIAL RISK CALCULATIONS
    // =========================================================================

    /**
     * @notice Computes maximum allowable borrow debt for a given collateral amount based on maxLTV.
     */
    function _calculateMaxBorrow(uint256 collateral) internal view returns (uint256) {
        if (collateral == 0) return 0;
        uint256 price = _getFreshPrice();
        uint8 oracleDecimals = priceFeed.decimals();

        // collateralValueInBorrowAsset = (collateral * price * 10^borrowDecimals) / (10^collateralDecimals * 10^oracleDecimals)
        uint256 collateralValue = (collateral * price * (10 ** borrowDecimals)) /
                                  ((10 ** collateralDecimals) * (10 ** oracleDecimals));

        return (collateralValue * maxLTVBps) / BPS;
    }

    /**
     * @notice Computes health factor scaled by 1e18 (WAD).
     * @return hf Health factor (1e18 = 1.0; < 1e18 = eligible for liquidation).
     */
    function _getHealthFactor(uint256 collateral, uint256 totalDebt) internal view returns (uint256) {
        if (totalDebt == 0) return type(uint256).max;
        if (collateral == 0) return 0;

        uint256 price = _getFreshPrice();
        uint8 oracleDecimals = priceFeed.decimals();

        uint256 collateralValue = (collateral * price * (10 ** borrowDecimals)) /
                                  ((10 ** collateralDecimals) * (10 ** oracleDecimals));

        // Liquidation value = (collateralValue * liquidationThresholdBps) / BPS
        uint256 liquidationValue = (collateralValue * liquidationThresholdBps) / BPS;

        // Health Factor = (liquidationValue * 1e18) / totalDebt
        return (liquidationValue * 1e18) / totalDebt;
    }

    /**
     * @dev Fetches oracle price with rigorous validation (positive, non-zero, not stale).
     */
    function _getFreshPrice() internal view returns (uint256) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (block.timestamp < updatedAt) revert StalePrice();
        if (block.timestamp - updatedAt > maxPriceStaleness) revert StalePrice();

        return uint256(answer);
    }

    // =========================================================================
    //                        VIEW & INSPECTION FUNCTIONS
    // =========================================================================

    /**
     * @notice Returns comprehensive position details for a borrower.
     */
    function getPositionOverview(address borrower)
        external
        view
        returns (
            bool active,
            uint256 collateralAmount,
            uint256 principalDebt,
            uint256 accruedInterestPending,
            uint256 totalDebt,
            uint256 availableCredit,
            uint256 healthFactor,
            uint256 collateralPrice,
            uint256 collateralValueInBorrowAsset
        )
    {
        CreditLine storage line = _creditLines[borrower];
        active = line.active;
        collateralAmount = line.collateralAmount;
        principalDebt = line.principalDebt;

        // Calculate pending interest up to now
        uint256 pendingInterest = line.accruedInterest;
        if (active && line.principalDebt > 0 && block.timestamp > line.lastAccrualTimestamp) {
            uint256 elapsed = block.timestamp - uint256(line.lastAccrualTimestamp);
            pendingInterest += (uint256(line.principalDebt) * uint256(borrowRateBps) * elapsed) /
                               (BPS * SECONDS_PER_YEAR);
        }
        accruedInterestPending = pendingInterest;
        totalDebt = principalDebt + pendingInterest;

        // Oracle values
        try this.getVerifiedPrice() returns (uint256 price, uint8 oracleDecimals) {
            collateralPrice = price;
            if (collateralAmount > 0) {
                collateralValueInBorrowAsset = (collateralAmount * price * (10 ** borrowDecimals)) /
                                               ((10 ** collateralDecimals) * (10 ** oracleDecimals));
                uint256 maxBorrow = (collateralValueInBorrowAsset * maxLTVBps) / BPS;
                if (maxBorrow > totalDebt) {
                    availableCredit = maxBorrow - totalDebt;
                } else {
                    availableCredit = 0;
                }

                uint256 thresholdValue = (collateralValueInBorrowAsset * liquidationThresholdBps) / BPS;
                if (totalDebt == 0) {
                    healthFactor = type(uint256).max;
                } else {
                    healthFactor = (thresholdValue * 1e18) / totalDebt;
                }
            } else {
                collateralValueInBorrowAsset = 0;
                availableCredit = 0;
                healthFactor = totalDebt == 0 ? type(uint256).max : 0;
            }
        } catch {
            collateralPrice = 0;
            collateralValueInBorrowAsset = 0;
            availableCredit = 0;
            healthFactor = 0;
        }
    }

    /**
     * @notice Helper to fetch and verify current oracle price.
     */
    function getVerifiedPrice() external view returns (uint256 price, uint8 oracleDecimals) {
        price = _getFreshPrice();
        oracleDecimals = priceFeed.decimals();
    }

    /**
     * @notice Returns raw storage-packed credit line.
     */
    function getCreditLine(address borrower) external view returns (CreditLine memory) {
        return _creditLines[borrower];
    }

    /**
     * @notice Returns high-level protocol metrics.
     */
    function getProtocolMetrics()
        external
        view
        returns (
            uint256 _totalDepositedCollateral,
            uint256 _totalPrincipalDebt,
            uint256 _totalAccruedInterest,
            uint256 _totalLendingLiquidity,
            uint256 _accumulatedFees,
            bool _paused
        )
    {
        return (
            totalDepositedCollateral,
            totalPrincipalDebt,
            totalAccruedInterest,
            totalLendingLiquidity,
            accumulatedFees,
            paused
        );
    }

    // =========================================================================
    //                        LIQUIDITY & FEE MANAGEMENT
    // =========================================================================

    /**
     * @notice Supplies borrow liquidity to the vault for revolving lending.
     * @param amount The amount of borrow tokens to supply.
     */
    function depositLendingLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint128 amt = uint128(amount);
        totalLendingLiquidity += amt;

        _safeTransferFrom(address(borrowToken), msg.sender, address(this), amount);
        emit LendingLiquidityDeposited(msg.sender, amount);
    }

    /**
     * @notice Owner/Lender withdrawal of available idle liquidity.
     * @dev Does not touch borrower collateral or locked funds.
     */
    function withdrawLendingLiquidity(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > totalLendingLiquidity) revert InsufficientLendingLiquidity();

        uint128 amt = uint128(amount);
        unchecked {
            totalLendingLiquidity -= amt;
        }

        _safeTransfer(address(borrowToken), msg.sender, amount);
        emit LendingLiquidityWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraws accumulated protocol fees (origination fees and interest spread).
     * @param recipient Recipient of the protocol fees.
     */
    function withdrawProtocolFees(address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 fees = accumulatedFees;
        if (fees == 0) revert ZeroAmount();

        accumulatedFees = 0;
        _safeTransfer(address(borrowToken), recipient, fees);
        emit ProtocolFeesWithdrawn(recipient, fees);
    }

    // =========================================================================
    //                        ADMINISTRATIVE CONTROLS
    // =========================================================================

    function setRiskParameters(
        uint16 _maxLTVBps,
        uint16 _liquidationThresholdBps,
        uint16 _liquidationBonusBps
    ) external onlyOwner {
        if (_maxLTVBps >= _liquidationThresholdBps || _liquidationThresholdBps > BPS) {
            revert InvalidRiskParameters();
        }
        maxLTVBps = _maxLTVBps;
        liquidationThresholdBps = _liquidationThresholdBps;
        liquidationBonusBps = _liquidationBonusBps;
        emit RiskParametersUpdated(_maxLTVBps, _liquidationThresholdBps, _liquidationBonusBps);
    }

    function setRates(uint16 _borrowRateBps, uint16 _originationFeeBps) external onlyOwner {
        if (_originationFeeBps > 1000) revert InvalidRiskParameters(); // max 10% fee
        borrowRateBps = _borrowRateBps;
        originationFeeBps = _originationFeeBps;
        emit RatesUpdated(_borrowRateBps, _originationFeeBps);
    }

    function setBorrowLimits(uint128 _minBorrow, uint128 _maxBorrow) external onlyOwner {
        if (_minBorrow > _maxBorrow) revert InvalidRiskParameters();
        minBorrowAmount = _minBorrow;
        maxBorrowAmount = _maxBorrow;
        emit BorrowLimitsUpdated(_minBorrow, _maxBorrow);
    }

    function setOracle(address _newPriceFeed, uint32 _maxStaleness) external onlyOwner {
        if (_newPriceFeed == address(0)) revert ZeroAddress();
        priceFeed = IPriceFeed(_newPriceFeed);
        maxPriceStaleness = _maxStaleness;
        emit OracleUpdated(_newPriceFeed, _maxStaleness);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Paused(false);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // =========================================================================
    //                     INTERNAL SAFE ERC-20 TRANSFERS
    // =========================================================================

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert SafeTransferFailed();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert SafeTransferFromFailed();
        }
    }
}
