// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title StockExchange — on-chain portfolio ledger for Arc Testnet
/// @notice Users buy/sell fractional stock shares using ERC-20 USDC (6 decimals).
///         Prices are set by the owner from off-chain market data (e.g. SoSoValue).
contract StockExchange {
    address public owner;
    IERC20 public immutable usdc;

    /// @dev shares per user per ticker (18-decimal fractional shares)
    mapping(address => mapping(bytes32 => uint256)) public holdings;
    /// @dev price in USDC per share (6 decimals, e.g. $120.15 = 120_150_000)
    mapping(bytes32 => uint256) public prices;

    event Buy(address indexed user, bytes32 indexed ticker, uint256 shares, uint256 usdcPaid);
    event Sell(address indexed user, bytes32 indexed ticker, uint256 shares, uint256 usdcReceived);
    event PriceUpdated(bytes32 indexed ticker, uint256 price);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner, address usdcToken) {
        require(initialOwner != address(0), "Zero owner");
        require(usdcToken != address(0), "Zero USDC");
        owner = initialOwner;
        usdc = IERC20(usdcToken);
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPrice(string calldata ticker, uint256 price) external onlyOwner {
        bytes32 id = keccak256(bytes(ticker));
        prices[id] = price;
        emit PriceUpdated(id, price);
    }

    function setPrices(string[] calldata tickers, uint256[] calldata newPrices) external onlyOwner {
        require(tickers.length == newPrices.length, "Length mismatch");
        for (uint256 i = 0; i < tickers.length; i++) {
            bytes32 id = keccak256(bytes(tickers[i]));
            prices[id] = newPrices[i];
            emit PriceUpdated(id, newPrices[i]);
        }
    }

    function buy(string calldata ticker, uint256 usdcAmount, uint256 minShares) external {
        bytes32 id = keccak256(bytes(ticker));
        uint256 price = prices[id];
        require(price > 0, "Price not set");
        require(usdcAmount > 0, "Zero amount");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");
        uint256 shares = (usdcAmount * 1e18) / price;
        require(shares >= minShares, "Slippage exceeded");
        holdings[msg.sender][id] += shares;
        emit Buy(msg.sender, id, shares, usdcAmount);
    }

    function sell(string calldata ticker, uint256 shares) external {
        bytes32 id = keccak256(bytes(ticker));
        require(holdings[msg.sender][id] >= shares, "Insufficient shares");
        uint256 price = prices[id];
        require(price > 0, "Price not set");
        holdings[msg.sender][id] -= shares;
        uint256 proceeds = (shares * price) / 1e18;
        require(usdc.transfer(msg.sender, proceeds), "USDC transfer failed");
        emit Sell(msg.sender, id, shares, proceeds);
    }

    function getHoldings(address user, string calldata ticker) external view returns (uint256) {
        return holdings[user][keccak256(bytes(ticker))];
    }
}
