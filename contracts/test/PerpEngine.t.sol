// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerpEngine} from "../src/PerpEngine.sol";

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

contract PerpEngineTest is Test {
    PerpEngine engine;
    MockUSDC usdc;

    address owner = address(1);
    address trader = address(2);
    address liquidator = address(3);

    uint64 constant MSTR_PRICE = 400_000_000; // $400

    function setUp() public {
        usdc = new MockUSDC();
        engine = new PerpEngine(owner, address(usdc), owner);

        vm.startPrank(owner);
        engine.configureMarket("MSTR", true, 10, 500, 10_000_000_000_000, 10);
        engine.setMarkPrice("MSTR", MSTR_PRICE, MSTR_PRICE);
        vm.stopPrank();

        usdc.mint(trader, 100_000_000_000);
        usdc.mint(owner, 100_000_000_000);
        vm.prank(trader);
        usdc.approve(address(engine), type(uint256).max);

        vm.prank(owner);
        usdc.approve(address(engine), type(uint256).max);
        vm.prank(owner);
        engine.depositInsurance(1_000_000_000);
    }

    function test_open_long_and_close_with_profit() public {
        uint256 margin = 40_000_000; // $40
        uint256 size = 1e18; // 1 share @ $400 = $400 notional = 10x

        uint256 traderBefore = usdc.balanceOf(trader);
        uint256 poolBefore = usdc.balanceOf(address(engine));

        vm.prank(trader);
        engine.openPosition("MSTR", true, margin, size);

        assertEq(usdc.balanceOf(trader), traderBefore - margin);
        assertEq(usdc.balanceOf(address(engine)), poolBefore + margin);

        vm.prank(owner);
        engine.setMarkPrice("MSTR", 440_000_000, 440_000_000);

        uint256 before = usdc.balanceOf(trader);
        vm.prank(trader);
        engine.closePosition("MSTR", size);

        assertGt(usdc.balanceOf(trader), before);
        (uint8 side,,,,,,) = engine.getPosition(trader, "MSTR");
        assertEq(side, 0);
    }

    function test_open_short_and_close_with_profit() public {
        uint256 margin = 40_000_000;
        uint256 size = 1e18;

        vm.prank(trader);
        engine.openPosition("MSTR", false, margin, size);

        vm.prank(owner);
        engine.setMarkPrice("MSTR", 360_000_000, 360_000_000);

        uint256 before = usdc.balanceOf(trader);
        vm.prank(trader);
        engine.closePosition("MSTR", size);

        assertGt(usdc.balanceOf(trader), before);
    }

    function test_rejects_excessive_leverage() public {
        vm.prank(trader);
        vm.expectRevert(PerpEngine.InsufficientMargin.selector);
        engine.openPosition("MSTR", true, 25_000_000, 1e18);
    }

    function test_liquidates_underwater_long() public {
        uint256 margin = 40_000_000;
        uint256 size = 1e18;

        vm.prank(trader);
        engine.openPosition("MSTR", true, margin, size);

        vm.prank(owner);
        engine.setMarkPrice("MSTR", 360_000_000, 360_000_000);
        vm.prank(owner);
        engine.setMarkPrice("MSTR", 320_000_000, 320_000_000);

        uint256 before = usdc.balanceOf(liquidator);
        vm.prank(liquidator);
        engine.liquidate(trader, "MSTR");

        assertGt(usdc.balanceOf(liquidator), before);
        (uint8 side,,,,,,) = engine.getPosition(trader, "MSTR");
        assertEq(side, 0);
        assertGt(engine.poolBalance(), 0);
    }

    function test_blocks_trade_on_stale_oracle() public {
        vm.warp(block.timestamp + 6 minutes);

        vm.prank(trader);
        vm.expectRevert(PerpEngine.StaleOracle.selector);
        engine.openPosition("MSTR", true, 40_000_000, 1e18);
    }

    function test_blocks_extreme_price_deviation() public {
        vm.prank(owner);
        vm.expectRevert(PerpEngine.PriceDeviationTooHigh.selector);
        engine.setMarkPrice("MSTR", 600_000_000, 600_000_000);
    }

    function test_liquidation_price_long_and_short() public {
        uint256 margin = 40_000_000;
        uint256 size = 1e18;

        vm.prank(trader);
        engine.openPosition("MSTR", true, margin, size);

        (,,,,,, uint256 longLiq) = engine.getPosition(trader, "MSTR");
        assertGt(longLiq, 0);
        assertLt(longLiq, MSTR_PRICE);

        vm.prank(trader);
        engine.closePosition("MSTR", size);

        vm.prank(trader);
        engine.openPosition("MSTR", false, margin, size);

        (,,,,,, uint256 shortLiq) = engine.getPosition(trader, "MSTR");
        assertGt(shortLiq, MSTR_PRICE);
    }

    function test_add_margin_improves_health() public {
        vm.prank(trader);
        engine.openPosition("MSTR", true, 40_000_000, 1e18);

        vm.prank(trader);
        engine.addMargin("MSTR", 20_000_000);

        (,, uint256 margin,,, int256 equity,) = engine.getPosition(trader, "MSTR");
        assertEq(margin, 60_000_000);
        assertGe(equity, int256(60_000_000));
    }

    function test_pause_blocks_trading() public {
        vm.prank(owner);
        engine.setPaused(true);

        vm.prank(trader);
        vm.expectRevert(PerpEngine.PausedError.selector);
        engine.openPosition("MSTR", true, 40_000_000, 1e18);
    }
}
