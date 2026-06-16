// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title PerpEngine — Independent cash-settled perpetual futures for synthetic stocks
/// @notice Fully separate from StockVault spot. USDC margin, oracle mark prices, liquidations, funding.
contract PerpEngine {
    uint256 internal constant SHARE_UNIT = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_ORACLE_STALENESS = 5 minutes;
    uint256 internal constant FUNDING_INTERVAL = 8 hours;
    uint256 internal constant LIQUIDATION_BONUS_BPS = 250;

    uint8 internal constant SIDE_NONE = 0;
    uint8 internal constant SIDE_LONG = 1;
    uint8 internal constant SIDE_SHORT = 2;

    IERC20 public immutable usdc;

    address public owner;
    address public oracle;
    address public pendingOwner;
    bool public paused;
    uint256 internal locked;

    uint256 public insuranceFund;
    uint16 public maxPriceDeviationBps = 1500;
    uint16 public globalMaxLeverage = 20;

    struct Market {
        bool active;
        uint64 markPrice;
        uint64 indexPrice;
        uint64 lastMarkUpdate;
        uint16 maxLeverage;
        uint16 maintenanceMarginBps;
        uint64 maxOpenInterestUsd;
        int32 fundingRateBps;
        uint128 cumulativeFundingIndex;
        uint64 lastFundingTime;
        uint128 longOpenInterestShares;
        uint128 shortOpenInterestShares;
    }

    struct Position {
        uint8 side;
        uint128 size;
        uint64 margin;
        uint64 entryPrice;
        uint128 fundingIndexAtOpen;
    }

    mapping(bytes32 => Market) public markets;
    mapping(address => mapping(bytes32 => Position)) public positions;
    bytes32[] internal _marketIds;
    mapping(bytes32 => bool) public marketExists;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleUpdated(address indexed oracle);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event MarketConfigured(bytes32 indexed ticker, bool active, uint16 maxLeverage, uint16 maintenanceMarginBps);
    event MarkPriceUpdated(bytes32 indexed ticker, uint64 markPrice, uint64 indexPrice);
    event FundingApplied(bytes32 indexed ticker, int32 fundingRateBps, uint128 cumulativeFundingIndex);
    event InsuranceDeposited(address indexed from, uint256 amount);
    event PositionOpened(
        address indexed user,
        bytes32 indexed ticker,
        uint8 side,
        uint256 size,
        uint256 margin,
        uint256 entryPrice
    );
    event PositionClosed(
        address indexed user,
        bytes32 indexed ticker,
        uint8 side,
        uint256 sizeClosed,
        int256 realizedPnl,
        uint256 marginReturned
    );
    event MarginAdded(address indexed user, bytes32 indexed ticker, uint256 amount);
    event MarginRemoved(address indexed user, bytes32 indexed ticker, uint256 amount);
    event Liquidated(
        address indexed user,
        address indexed liquidator,
        bytes32 indexed ticker,
        uint256 size,
        int256 pnl,
        uint256 liquidatorBonus
    );

    error NotOwner();
    error NotOracle();
    error NotPendingOwner();
    error ZeroAddress();
    error ReentrancyGuard();
    error PausedError();
    error MarketNotActive();
    error PriceNotSet();
    error StaleOracle();
    error PriceDeviationTooHigh();
    error ZeroAmount();
    error InvalidLeverage();
    error InvalidSide();
    error PositionExists();
    error NoPosition();
    error InsufficientMargin();
    error ExcessiveLeverage();
    error OpenInterestExceeded();
    error NotLiquidatable();
    error TransferFailed();
    error LengthMismatch();
    error MarginTooLow();
    error CannotRemoveMargin();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier nonReentrant() {
        if (locked == 1) revert ReentrancyGuard();
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address initialOwner, address usdcToken, address initialOracle) {
        if (initialOwner == address(0) || usdcToken == address(0)) revert ZeroAddress();
        owner = initialOwner;
        usdc = IERC20(usdcToken);
        oracle = initialOracle == address(0) ? initialOwner : initialOracle;
        emit OwnershipTransferred(address(0), initialOwner);
        emit OracleUpdated(oracle);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroAddress();
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        if (value) emit Paused(msg.sender);
        else emit Unpaused(msg.sender);
    }

    function setMaxPriceDeviationBps(uint16 bps) external onlyOwner {
        maxPriceDeviationBps = bps;
    }

    function setGlobalMaxLeverage(uint16 leverage) external onlyOwner {
        if (leverage == 0 || leverage > 50) revert InvalidLeverage();
        globalMaxLeverage = leverage;
    }

    function configureMarket(
        string calldata ticker,
        bool active,
        uint16 maxLeverage,
        uint16 maintenanceMarginBps,
        uint64 maxOpenInterestUsd,
        int32 fundingRateBps
    ) external onlyOwner {
        if (maxLeverage == 0 || maxLeverage > globalMaxLeverage) revert InvalidLeverage();
        if (maintenanceMarginBps == 0 || maintenanceMarginBps >= BPS / 2) revert InsufficientMargin();

        bytes32 id = keccak256(bytes(ticker));
        Market storage m = markets[id];
        m.active = active;
        m.maxLeverage = maxLeverage;
        m.maintenanceMarginBps = maintenanceMarginBps;
        m.maxOpenInterestUsd = maxOpenInterestUsd;
        m.fundingRateBps = fundingRateBps;

        if (!marketExists[id]) {
            marketExists[id] = true;
            _marketIds.push(id);
        }

        emit MarketConfigured(id, active, maxLeverage, maintenanceMarginBps);
    }

    function setMarkPrice(string calldata ticker, uint64 markPrice, uint64 indexPrice) external onlyOracle {
        _setMarkPrice(keccak256(bytes(ticker)), markPrice, indexPrice);
    }

    function setMarkPrices(
        string[] calldata tickers,
        uint64[] calldata markPrices,
        uint64[] calldata indexPrices
    ) external onlyOracle {
        if (tickers.length != markPrices.length || tickers.length != indexPrices.length) revert LengthMismatch();
        for (uint256 i = 0; i < tickers.length; i++) {
            _setMarkPrice(keccak256(bytes(tickers[i])), markPrices[i], indexPrices[i]);
        }
    }

    function depositInsurance(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        insuranceFund += amount;
        emit InsuranceDeposited(msg.sender, amount);
    }

    function applyFunding(string calldata ticker) external whenNotPaused {
        bytes32 id = keccak256(bytes(ticker));
        Market storage m = markets[id];
        if (!m.active) revert MarketNotActive();
        if (block.timestamp < m.lastFundingTime + FUNDING_INTERVAL) return;

        int256 imbalance = int256(uint256(m.longOpenInterestShares)) - int256(uint256(m.shortOpenInterestShares));
        int32 appliedRate = m.fundingRateBps;
        if (imbalance > 0) appliedRate = m.fundingRateBps;
        else if (imbalance < 0) appliedRate = -m.fundingRateBps;

        m.cumulativeFundingIndex += uint128(uint256(int256(uint256(m.cumulativeFundingIndex)) + int256(appliedRate)));
        m.lastFundingTime = uint64(block.timestamp);
        emit FundingApplied(id, appliedRate, m.cumulativeFundingIndex);
    }

    function openPosition(
        string calldata ticker,
        bool isLong,
        uint256 marginAmount,
        uint256 sizeShares
    ) external whenNotPaused nonReentrant {
        if (marginAmount == 0 || sizeShares == 0) revert ZeroAmount();

        bytes32 id = keccak256(bytes(ticker));
        Market storage m = markets[id];
        if (!m.active) revert MarketNotActive();
        if (m.markPrice == 0) revert PriceNotSet();
        if (block.timestamp > m.lastMarkUpdate + MAX_ORACLE_STALENESS) revert StaleOracle();

        Position storage pos = positions[msg.sender][id];
        if (pos.side != SIDE_NONE) revert PositionExists();

        uint256 notional = _notional(sizeShares, m.markPrice);
        if (marginAmount < notional / m.maxLeverage) revert InsufficientMargin();
        if (notional / marginAmount > m.maxLeverage) revert ExcessiveLeverage();

        if (isLong) {
            if (_notional(uint256(m.longOpenInterestShares) + sizeShares, m.markPrice) > m.maxOpenInterestUsd) {
                revert OpenInterestExceeded();
            }
            m.longOpenInterestShares += uint128(sizeShares);
            pos.side = SIDE_LONG;
        } else {
            if (_notional(uint256(m.shortOpenInterestShares) + sizeShares, m.markPrice) > m.maxOpenInterestUsd) {
                revert OpenInterestExceeded();
            }
            m.shortOpenInterestShares += uint128(sizeShares);
            pos.side = SIDE_SHORT;
        }

        if (!usdc.transferFrom(msg.sender, address(this), marginAmount)) revert TransferFailed();

        pos.size = uint128(sizeShares);
        pos.margin = uint64(marginAmount);
        pos.entryPrice = m.markPrice;
        pos.fundingIndexAtOpen = m.cumulativeFundingIndex;

        emit PositionOpened(msg.sender, id, pos.side, sizeShares, marginAmount, m.markPrice);
    }

    function closePosition(string calldata ticker, uint256 sizeShares) external whenNotPaused nonReentrant {
        if (sizeShares == 0) revert ZeroAmount();

        bytes32 id = keccak256(bytes(ticker));
        Market storage m = markets[id];
        if (!m.active) revert MarketNotActive();
        if (m.markPrice == 0) revert PriceNotSet();
        if (block.timestamp > m.lastMarkUpdate + MAX_ORACLE_STALENESS) revert StaleOracle();

        Position storage pos = positions[msg.sender][id];
        if (pos.side == SIDE_NONE) revert NoPosition();
        if (sizeShares > pos.size) revert ZeroAmount();

        (int256 pnl, uint256 fundingOwed) = _positionPnl(pos, m.markPrice, m.cumulativeFundingIndex, sizeShares);
        uint256 marginReleased = (uint256(pos.margin) * sizeShares) / pos.size;

        int256 equity = int256(marginReleased) + pnl - int256(fundingOwed);
        uint256 payout = equity > 0 ? uint256(equity) : 0;
        if (equity < 0) {
            uint256 loss = uint256(-equity);
            if (loss > marginReleased) {
                uint256 shortfall = loss - marginReleased;
                if (insuranceFund >= shortfall) insuranceFund -= shortfall;
                else revert TransferFailed();
            }
            payout = 0;
        }

        _reduceOpenInterest(m, pos.side, sizeShares);

        if (payout > 0 && !usdc.transfer(msg.sender, payout)) revert TransferFailed();

        if (sizeShares == pos.size) {
            uint8 closedSide = pos.side;
            delete positions[msg.sender][id];
            emit PositionClosed(msg.sender, id, closedSide, sizeShares, pnl, payout);
        } else {
            pos.size -= uint128(sizeShares);
            pos.margin -= uint64(marginReleased);
            emit PositionClosed(msg.sender, id, pos.side, sizeShares, pnl, payout);
        }
    }

    function addMargin(string calldata ticker, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        bytes32 id = keccak256(bytes(ticker));
        Position storage pos = positions[msg.sender][id];
        if (pos.side == SIDE_NONE) revert NoPosition();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        pos.margin += uint64(amount);
        emit MarginAdded(msg.sender, id, amount);
    }

    function removeMargin(string calldata ticker, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        bytes32 id = keccak256(bytes(ticker));
        Market storage m = markets[id];
        Position storage pos = positions[msg.sender][id];
        if (pos.side == SIDE_NONE) revert NoPosition();
        if (m.markPrice == 0) revert PriceNotSet();

        (int256 pnl, uint256 fundingOwed) = _positionPnl(pos, m.markPrice, m.cumulativeFundingIndex, pos.size);
        int256 equity = int256(uint256(pos.margin)) + pnl - int256(fundingOwed);

        uint256 notional = _notional(pos.size, m.markPrice);
        uint256 minMargin = notional / m.maxLeverage;
        if (int256(uint256(pos.margin)) - int256(amount) < int256(minMargin)) revert CannotRemoveMargin();
        if (equity - int256(amount) < int256(_maintenanceRequired(notional, m.maintenanceMarginBps))) {
            revert CannotRemoveMargin();
        }

        pos.margin -= uint64(amount);
        if (!usdc.transfer(msg.sender, amount)) revert TransferFailed();
        emit MarginRemoved(msg.sender, id, amount);
    }

    function liquidate(address user, string calldata ticker) external whenNotPaused nonReentrant {
        bytes32 id = keccak256(bytes(ticker));
        Market storage m = markets[id];
        if (!m.active) revert MarketNotActive();
        if (m.markPrice == 0) revert PriceNotSet();

        Position storage pos = positions[user][id];
        if (pos.side == SIDE_NONE) revert NoPosition();

        uint256 marginLocked = uint256(pos.margin);

        (int256 pnl, uint256 fundingOwed) = _positionPnl(pos, m.markPrice, m.cumulativeFundingIndex, pos.size);
        int256 equity = int256(marginLocked) + pnl - int256(fundingOwed);
        uint256 notional = _notional(pos.size, m.markPrice);
        uint256 maintenance = _maintenanceRequired(notional, m.maintenanceMarginBps);
        if (equity >= int256(maintenance)) revert NotLiquidatable();

        uint256 bonus = (marginLocked * LIQUIDATION_BONUS_BPS) / BPS;
        uint256 remaining = marginLocked;
        if (equity > 0) remaining = uint256(equity);
        if (bonus > remaining) bonus = remaining;

        _reduceOpenInterest(m, pos.side, pos.size);

        uint8 closedSide = pos.side;
        uint256 closedSize = pos.size;
        delete positions[user][id];

        if (bonus > 0 && !usdc.transfer(msg.sender, bonus)) revert TransferFailed();

        uint256 toInsurance = marginLocked > bonus ? marginLocked - bonus : 0;
        if (toInsurance > 0) insuranceFund += toInsurance;

        if (equity < 0) {
            uint256 loss = uint256(-equity);
            if (loss > insuranceFund) revert TransferFailed();
            insuranceFund -= loss;
        }

        emit Liquidated(user, msg.sender, id, closedSize, pnl, bonus);
        emit PositionClosed(user, id, closedSide, closedSize, pnl, 0);
    }

    function getPosition(address user, string calldata ticker)
        external
        view
        returns (
            uint8 side,
            uint256 size,
            uint256 margin,
            uint256 entryPrice,
            int256 unrealizedPnl,
            int256 equity,
            uint256 liquidationPrice
        )
    {
        bytes32 id = keccak256(bytes(ticker));
        Position memory pos = positions[user][id];
        Market memory m = markets[id];
        side = pos.side;
        size = pos.size;
        margin = pos.margin;
        entryPrice = pos.entryPrice;

        if (pos.side == SIDE_NONE || m.markPrice == 0) {
            return (side, size, margin, entryPrice, 0, int256(margin), 0);
        }

        (int256 pnl, uint256 fundingOwed) = _positionPnl(pos, m.markPrice, m.cumulativeFundingIndex, pos.size);
        unrealizedPnl = pnl;
        equity = int256(uint256(margin)) + pnl - int256(fundingOwed);
        liquidationPrice = _liquidationPrice(pos, m.maintenanceMarginBps);
    }

    function marketCount() external view returns (uint256) {
        return _marketIds.length;
    }

    function poolBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function _setMarkPrice(bytes32 id, uint64 markPrice, uint64 indexPrice) internal {
        if (markPrice == 0) revert PriceNotSet();
        Market storage m = markets[id];
        if (m.markPrice != 0) {
            uint256 deviation = markPrice > m.markPrice
                ? ((markPrice - m.markPrice) * BPS) / m.markPrice
                : ((m.markPrice - markPrice) * BPS) / m.markPrice;
            if (deviation > maxPriceDeviationBps) revert PriceDeviationTooHigh();
        }
        m.markPrice = markPrice;
        m.indexPrice = indexPrice;
        m.lastMarkUpdate = uint64(block.timestamp);
        emit MarkPriceUpdated(id, markPrice, indexPrice);
    }

    function _notional(uint256 sizeShares, uint64 price) internal pure returns (uint256) {
        return (sizeShares * price) / SHARE_UNIT;
    }

    function _maintenanceRequired(uint256 notional, uint16 maintenanceBps) internal pure returns (uint256) {
        return (notional * maintenanceBps) / BPS;
    }

    function _positionPnl(
        Position memory pos,
        uint64 markPrice,
        uint128 cumulativeFundingIndex,
        uint256 sizeShares
    ) internal pure returns (int256 pnl, uint256 fundingOwed) {
        if (pos.side == SIDE_LONG) {
            pnl = (int256(uint256(markPrice)) - int256(uint256(pos.entryPrice))) * int256(sizeShares) / int256(SHARE_UNIT);
        } else if (pos.side == SIDE_SHORT) {
            pnl = (int256(uint256(pos.entryPrice)) - int256(uint256(markPrice))) * int256(sizeShares) / int256(SHARE_UNIT);
        }

        if (cumulativeFundingIndex > pos.fundingIndexAtOpen) {
            uint256 indexDelta = uint256(cumulativeFundingIndex) - uint256(pos.fundingIndexAtOpen);
            fundingOwed = (sizeShares * indexDelta) / SHARE_UNIT / BPS;
        }
    }

    function _liquidationPrice(Position memory pos, uint16 maintenanceBps) internal pure returns (uint256) {
        if (pos.side == SIDE_NONE || pos.size == 0) return 0;

        uint256 sz = pos.size;
        uint256 e = pos.entryPrice;
        uint256 m = pos.margin;

        if (pos.side == SIDE_LONG) {
            uint256 esz = e * sz;
            uint256 mScaled = m * SHARE_UNIT;
            if (esz <= mScaled) return 0;
            uint256 denom = sz * (BPS - maintenanceBps);
            if (denom == 0) return 0;
            return (esz - mScaled) * BPS / denom;
        }

        uint256 shortNum = m * SHARE_UNIT + e * sz;
        uint256 shortDenom = sz * (BPS + maintenanceBps);
        return shortNum * BPS / shortDenom;
    }

    function _reduceOpenInterest(Market storage m, uint8 side, uint256 sizeShares) internal {
        if (side == SIDE_LONG) {
            m.longOpenInterestShares = uint128(uint256(m.longOpenInterestShares) - sizeShares);
        } else if (side == SIDE_SHORT) {
            m.shortOpenInterestShares = uint128(uint256(m.shortOpenInterestShares) - sizeShares);
        }
    }
}
