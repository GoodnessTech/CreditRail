// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IERC20.sol";

/**
 * @title MockERC20
 * @notice Highly optimized, clean ERC-20 implementation for CreditRail testing,
 *         supporting arbitrary decimals (e.g., 18 for WBOT/ETH, 6 for USDC) and permissioned/open minting.
 */
contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable override decimals;
    uint256 public override totalSupply;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply,
        address _recipient
    ) {
        if (_recipient == address(0)) revert ZeroAddress();
        name = _name;
        symbol = _symbol;
        decimals = _decimals;

        if (_initialSupply > 0) {
            totalSupply = _initialSupply;
            balanceOf[_recipient] = _initialSupply;
            emit Transfer(address(0), _recipient, _initialSupply);
        }
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 senderBal = balanceOf[msg.sender];
        if (senderBal < amount) revert InsufficientBalance();

        unchecked {
            balanceOf[msg.sender] = senderBal - amount;
            balanceOf[recipient] += amount;
        }

        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 currentAllowance = allowance[sender][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) revert InsufficientAllowance();
            unchecked {
                allowance[sender][msg.sender] = currentAllowance - amount;
            }
        }

        uint256 senderBal = balanceOf[sender];
        if (senderBal < amount) revert InsufficientBalance();

        unchecked {
            balanceOf[sender] = senderBal - amount;
            balanceOf[recipient] += amount;
        }

        emit Transfer(sender, recipient, amount);
        return true;
    }

    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }
}
