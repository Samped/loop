// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StockVault} from "../src/StockVault.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract StockVaultTest is Test {
    StockVault vault;
    MockUSDC usdc;

    address owner = address(1);
    address user = address(2);

    function setUp() public {
        usdc = new MockUSDC();
        vault = new StockVault(owner, address(usdc), owner);
        usdc.mint(user, 1_000_000_000); // 1000 USDC (6 decimals)
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _setAaplPrice() internal {
        string[] memory tickers = new string[](1);
        tickers[0] = "AAPL";
        uint256[] memory prices_ = new uint256[](1);
        prices_[0] = 200_000_000;
        vm.prank(owner);
        vault.setPrices(tickers, prices_);
    }

    function test_buy_mints_without_backing_cap() public {
        _setAaplPrice();

        vm.prank(user);
        vault.buy("AAPL", 200_000_000, 0);

        assertEq(vault.getHoldings(user, "AAPL"), 1e18);
        assertEq(vault.circulatingShares(keccak256(bytes("AAPL"))), 1e18);
        assertTrue(vault.isSolvent());
        assertEq(vault.reserveBalance(), 200_000_000);
        assertEq(vault.totalLiabilities(), 200_000_000);
    }

    function test_sell_returns_usdc_and_reduces_circulating() public {
        _setAaplPrice();

        vm.prank(user);
        vault.buy("AAPL", 400_000_000, 0);

        vm.prank(user);
        vault.sell("AAPL", 5e17);

        assertEq(vault.getHoldings(user, "AAPL"), 15e17);
        assertEq(vault.circulatingShares(keccak256(bytes("AAPL"))), 15e17);
        assertTrue(vault.isSolvent());
    }

    function test_price_increase_can_block_buys_until_reserve_topped_up() public {
        _setAaplPrice();

        vm.prank(user);
        vault.buy("AAPL", 200_000_000, 0);

        string[] memory tickers = new string[](1);
        tickers[0] = "AAPL";
        uint256[] memory prices_ = new uint256[](1);
        prices_[0] = 400_000_000;
        vm.prank(owner);
        vault.setPrices(tickers, prices_);

        assertFalse(vault.isSolvent());

        vm.prank(user);
        vm.expectRevert(StockVault.NotSolvent.selector);
        vault.buy("AAPL", 100_000_000, 0);

        usdc.mint(owner, 200_000_000);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        vault.depositReserve(200_000_000);

        assertTrue(vault.isSolvent());

        vm.prank(user);
        vault.buy("AAPL", 400_000_000, 0);
        assertEq(vault.getHoldings(user, "AAPL"), 2e18);
    }

    function test_deposit_reserve_increases_balance() public {
        usdc.mint(owner, 500_000_000);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);

        vm.prank(owner);
        vault.depositReserve(500_000_000);

        assertEq(vault.reserveBalance(), 500_000_000);
    }
}
