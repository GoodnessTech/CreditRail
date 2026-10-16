// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPriceFeed.sol";

/**
 * @title MockPriceFeed
 * @notice Chainlink AggregatorV3 compatible mock oracle for adversarial and stress testing,
 *         permitting testing of price fluctuations, liquidation triggers, and stale/invalid price responses.
 */
contract MockPriceFeed is IPriceFeed {
    uint8 public override decimals;
    string public override description;
    uint256 public override version;

    int256 public price;
    uint256 public updatedAt;
    uint80 public roundId;

    constructor(
        string memory _description,
        uint8 _decimals,
        int256 _initialPrice
    ) {
        description = _description;
        decimals = _decimals;
        price = _initialPrice;
        updatedAt = block.timestamp;
        roundId = 1;
        version = 1;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return (roundId, price, updatedAt, updatedAt, roundId);
    }

    function setPrice(int256 _newPrice) external {
        price = _newPrice;
        updatedAt = block.timestamp;
        roundId++;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function setPriceAndTimestamp(int256 _newPrice, uint256 _updatedAt) external {
        price = _newPrice;
        updatedAt = _updatedAt;
        roundId++;
    }
}
