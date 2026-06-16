// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpEngine} from "../src/PerpEngine.sol";

contract DeployPerpScript is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        PerpEngine engine = new PerpEngine(deployer, ARC_USDC, deployer);
        console2.log("PerpEngine deployed at:", address(engine));

        engine.configureMarket("MSTR", true, 20, 50, 50_000_000_000, 10);
        engine.configureMarket("COIN", true, 20, 50, 50_000_000_000, 10);
        engine.configureMarket("HOOD", true, 15, 50, 30_000_000_000, 10);
        engine.configureMarket("MARA", true, 15, 50, 30_000_000_000, 10);
        engine.configureMarket("RIOT", true, 15, 50, 30_000_000_000, 10);

        console2.log("Configured 5 perp markets");
        console2.log("Owner / Oracle:", deployer);

        vm.stopBroadcast();
    }
}
