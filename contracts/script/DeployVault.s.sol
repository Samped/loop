// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StockVault} from "../src/StockVault.sol";

contract DeployVaultScript is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        StockVault vault = new StockVault(deployer, ARC_USDC, deployer);
        console2.log("StockVault deployed at:", address(vault));
        console2.log("Owner / Oracle:", deployer);
        console2.log("USDC token:", ARC_USDC);

        vm.stopBroadcast();
    }
}
