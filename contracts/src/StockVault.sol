// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title StockVault — USDC-reserved synthetic stock ledger on Arc Testnet
/// @notice Buys deposit USDC; sells redeem USDC at oracle prices. Vault must stay solvent:
///         USDC balance >= sum(circulatingShares * price) across all tickers.
contract StockVault {
    IERC20 public immutable usdc;

    address public owner;
    address public oracle;

    /// @dev price in USDC per share (6 decimals)
    mapping(bytes32 => uint256) public prices;
    /// @dev total shares issued to users (18 decimals)
    mapping(bytes32 => uint256) public circulatingShares;
    mapping(address => mapping(bytes32 => uint256)) public holdings;

    bytes32[] private _activeTickers;
    mapping(bytes32 => bool) public isListed;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleUpdated(address indexed oracle);
    event PriceUpdated(bytes32 indexed ticker, uint256 price);
    event ReserveDeposited(address indexed from, uint256 amount);
    event Buy(address indexed user, bytes32 indexed ticker, uint256 shares, uint256 usdcPaid);
    event Sell(address indexed user, bytes32 indexed ticker, uint256 shares, uint256 usdcReceived);

    error NotOwner();
    error NotOracle();
    error ZeroAddress();
    error PriceNotSet();
    error ZeroAmount();
    error SlippageExceeded();
    error InsufficientShares();
    error InsufficientReserve();
    error NotSolvent();
    error LengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
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
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroAddress();
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function setPrice(string calldata ticker, uint256 price) external onlyOracle {
        bytes32 id = keccak256(bytes(ticker));
        prices[id] = price;
        _touchTicker(id);
        emit PriceUpdated(id, price);
    }

    function setPrices(string[] calldata tickers, uint256[] calldata newPrices) external onlyOracle {
        if (tickers.length != newPrices.length) revert LengthMismatch();
        for (uint256 i = 0; i < tickers.length; i++) {
            bytes32 id = keccak256(bytes(tickers[i]));
            prices[id] = newPrices[i];
            _touchTicker(id);
            emit PriceUpdated(id, newPrices[i]);
        }
    }

    function reserveBalance() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function totalLiabilities() public view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < _activeTickers.length; i++) {
            bytes32 id = _activeTickers[i];
            uint256 circulating = circulatingShares[id];
            uint256 price = prices[id];
            if (circulating > 0 && price > 0) {
                total += (circulating * price) / 1e18;
            }
        }
        return total;
    }

    function isSolvent() public view returns (bool) {
        return reserveBalance() >= totalLiabilities();
    }

    /// @dev Ratio scaled by 1e18 (1e18 = 100% collateralized)
    function reserveRatio() public view returns (uint256) {
        uint256 liabilities = totalLiabilities();
        if (liabilities == 0) return type(uint256).max;
        return (reserveBalance() * 1e18) / liabilities;
    }

    function activeTickerCount() external view returns (uint256) {
        return _activeTickers.length;
    }

    function depositReserve(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert ZeroAmount();
        emit ReserveDeposited(msg.sender, amount);
    }

    function buy(string calldata ticker, uint256 usdcAmount, uint256 minShares) external {
        bytes32 id = keccak256(bytes(ticker));
        uint256 price = prices[id];
        if (price == 0) revert PriceNotSet();
        if (usdcAmount == 0) revert ZeroAmount();

        uint256 shares = (usdcAmount * 1e18) / price;
        if (shares < minShares) revert SlippageExceeded();

        if (!usdc.transferFrom(msg.sender, address(this), usdcAmount)) revert ZeroAmount();

        _touchTicker(id);
        holdings[msg.sender][id] += shares;
        circulatingShares[id] += shares;

        if (!isSolvent()) revert NotSolvent();

        emit Buy(msg.sender, id, shares, usdcAmount);
    }

    function sell(string calldata ticker, uint256 shares) external {
        bytes32 id = keccak256(bytes(ticker));
        if (shares == 0) revert ZeroAmount();
        if (holdings[msg.sender][id] < shares) revert InsufficientShares();

        uint256 price = prices[id];
        if (price == 0) revert PriceNotSet();

        uint256 proceeds = (shares * price) / 1e18;
        if (reserveBalance() < proceeds) revert InsufficientReserve();

        holdings[msg.sender][id] -= shares;
        circulatingShares[id] -= shares;

        if (!usdc.transfer(msg.sender, proceeds)) revert ZeroAmount();

        emit Sell(msg.sender, id, shares, proceeds);
    }

    function getHoldings(address user, string calldata ticker) external view returns (uint256) {
        return holdings[user][keccak256(bytes(ticker))];
    }

    function _touchTicker(bytes32 id) internal {
        if (!isListed[id]) {
            isListed[id] = true;
            _activeTickers.push(id);
        }
    }
}
