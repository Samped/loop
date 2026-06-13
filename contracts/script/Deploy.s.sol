// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StockExchange} from "../src/StockExchange.sol";

contract DeployScript is Script {
    // Arc Testnet USDC ERC-20 (6 decimals)
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        StockExchange exchange = new StockExchange(deployer, ARC_USDC);
        console2.log("StockExchange deployed at:", address(exchange));
        console2.log("Owner:", deployer);
        console2.log("USDC token:", ARC_USDC);

        vm.stopBroadcast();
    }
}
