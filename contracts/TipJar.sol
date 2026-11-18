// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TipJar
/// @notice Tip any Agent ID holder by their .ai handle.
/// @dev Tips forward immediately to the recipient; this contract never
///      holds funds. There is no owner, no pause, no mint, and no
///      withdraw function: nothing can change the rules after deploy.
///
///      Resolution is fully on-chain. The Agent ID registry mints one
///      non-transferable token per handle, with
///      tokenId = uint256(keccak256(bytes(handle))). The recipient of a
///      tip is resolved via ownerOf(tokenId), so a tip can only ever go
///      to a real Agent ID holder.
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract TipJar {
    /// @notice SPACE ID Agent ID registry on BNB Chain (chainId 56).
    address public constant AGENT_ID_REGISTRY =
        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    /// @notice Total tips received by an address, in wei.
    mapping(address => uint256) public totalReceived;
    /// @notice Total tips sent by an address, in wei.
    mapping(address => uint256) public totalSent;
    /// @notice Total number of tips sent through this contract.
    uint256 public totalTips;
    /// @notice Total volume tipped through this contract, in wei.
    uint256 public totalVolume;

    /// @notice Emitted when a tip is sent.
    event Tipped(
        address indexed from,
        address indexed to,
        string handle,
        uint256 amount
    );

    error NotAgentIdHolder();
    error EmptyTip();
    error TransferFailed();

    /// @notice Tip the holder of an Agent ID handle.
    /// @param handle The recipient's Agent ID handle WITHOUT the ".ai"
    ///               suffix, e.g. "abdullahparvez". Handles are
    ///               case-sensitive; the frontend normalizes input
    ///               (lowercase, strip ".ai") before calling.
    /// @dev The sender must hold an Agent ID (balanceOf > 0). The
    ///      recipient is resolved on-chain from the handle, so the
    ///      recipient holds an Agent ID by construction. Reverts if
    ///      the handle does not exist; no funds move in that case.
    ///      Funds move directly to the recipient; nothing stays in
    ///      this contract.
    function tip(string calldata handle) external payable {
        if (msg.value == 0) revert EmptyTip();
        IAgentIdRegistry registry = IAgentIdRegistry(AGENT_ID_REGISTRY);
        if (registry.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        address recipient = registry.ownerOf(
            uint256(keccak256(bytes(handle)))
        );

        totalReceived[recipient] += msg.value;
        totalSent[msg.sender] += msg.value;
        totalTips += 1;
        totalVolume += msg.value;

        emit Tipped(msg.sender, recipient, handle, msg.value);

        (bool ok, ) = recipient.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Resolve an Agent ID handle to its holder address.
    /// @param handle The handle WITHOUT the ".ai" suffix.
    /// @return The address holding that Agent ID. Reverts if the
    ///         handle does not exist.
    function resolve(
        string calldata handle
    ) external view returns (address) {
        return
            IAgentIdRegistry(AGENT_ID_REGISTRY).ownerOf(
                uint256(keccak256(bytes(handle)))
            );
    }
}
