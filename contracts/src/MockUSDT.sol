// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Mock USDT for testing
 */
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {
        _mint(msg.sender, 1_000_000_000 * 10**6); // 1 billion USDT (6 decimals)
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
