// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * MostBoxWallet - 链上钱包合约
 * 
 * 功能：
 * - 用户充值 USDT，合约记录内部余额
 * - 用户间内部转账（零 gas）
 * - 前端签名提现到外部地址
 */
contract MostBoxWallet is EIP712, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    IERC20 public immutable usdt;
    
    // 用户余额映射
    mapping(address => uint256) public balances;
    
    // 提现 nonce（防重放）
    mapping(address => uint256) public nonces;
    
    // 单笔提现限额
    uint256 public maxWithdrawalPerTx;
    
    // 提现手续费（基点，10000 = 100%）
    uint256 public withdrawalFeeBps;
    
    // 手续费累积
    uint256 public accumulatedFees;
    
    // 合约暂停状态
    bool public paused;
    
    // 事件
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, address indexed to, uint256 amount, uint256 fee);
    event InternalTransfer(address indexed from, address indexed to, uint256 amount);
    event FeeWithdrawn(address indexed owner, uint256 amount);
    event MaxWithdrawalUpdated(uint256 newLimit);
    event FeeUpdated(uint256 newFeeBps);
    event PausedStateChanged(bool paused);

    constructor(address _usdt, uint256 _maxWithdrawalPerTx, uint256 _withdrawalFeeBps) 
        EIP712("MostBoxWallet", "1") 
        Ownable(msg.sender)
    {
        require(_usdt != address(0), "Invalid USDT address");
        usdt = IERC20(_usdt);
        maxWithdrawalPerTx = _maxWithdrawalPerTx;
        withdrawalFeeBps = _withdrawalFeeBps;
    }

    /**
     * 充值 USDT
     * 用户先 approve 本合约，然后调用此函数
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        
        bool success = usdt.transferFrom(msg.sender, address(this), amount);
        require(success, "USDT transfer failed");
        
        balances[msg.sender] += amount;
        
        emit Deposited(msg.sender, amount);
    }

    /**
     * 提现 USDT（签名验证）
     * 前端用用户私钥签名 {to, amount, nonce, contractAddress}
     */
    function withdraw(
        address to,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant whenNotPaused {
        require(to != address(0), "Invalid recipient");
        require(to != address(this), "Cannot withdraw to self");
        require(amount > 0, "Amount must be > 0");
        require(amount <= maxWithdrawalPerTx, "Exceeds max withdrawal");
        
        // 验证签名
        bytes32 messageHash = _hashWithdrawMessage(to, amount, nonce);
        address signer = messageHash.recover(signature);
        require(signer == msg.sender, "Invalid signature");
        
        // 防重放
        require(nonce == nonces[msg.sender], "Invalid nonce");
        nonces[msg.sender]++;
        
        // 验证余额
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // 计算手续费
        uint256 fee = (amount * withdrawalFeeBps) / 10000;
        uint256 amountAfterFee = amount - fee;
        
        // 扣减余额
        balances[msg.sender] -= amount;
        accumulatedFees += fee;
        
        // 发送 USDT
        bool success = usdt.transfer(to, amountAfterFee);
        require(success, "USDT transfer failed");
        
        emit Withdrawn(msg.sender, to, amountAfterFee, fee);
    }

    /**
     * 内部转账（零 gas，只改合约状态）
     */
    function internalTransfer(address to, uint256 amount) external nonReentrant whenNotPaused {
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot transfer to self");
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        balances[msg.sender] -= amount;
        balances[to] += amount;
        
        emit InternalTransfer(msg.sender, to, amount);
    }

    /**
     * 提取累积的手续费（仅 owner）
     */
    function withdrawFees() external onlyOwner {
        require(accumulatedFees > 0, "No fees to withdraw");
        
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        
        bool success = usdt.transfer(owner(), amount);
        require(success, "USDT transfer failed");
        
        emit FeeWithdrawn(owner(), amount);
    }

    /**
     * 设置单笔提现限额（仅 owner）
     */
    function setMaxWithdrawal(uint256 newLimit) external onlyOwner {
        require(newLimit > 0, "Invalid limit");
        maxWithdrawalPerTx = newLimit;
        emit MaxWithdrawalUpdated(newLimit);
    }

    /**
     * 设置提现手续费（仅 owner）
     */
    function setWithdrawalFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high"); // 最高 10%
        withdrawalFeeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    /**
     * 暂停/恢复合约（仅 owner）
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedStateChanged(_paused);
    }

    /**
     * 验证签名（前端可用此函数预检查）
     */
    function verifySignature(
        address user,
        address to,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external view returns (bool) {
        bytes32 messageHash = _hashWithdrawMessage(to, amount, nonce);
        address signer = messageHash.recover(signature);
        return signer == user;
    }

    /**
     * 获取提现消息哈希（用于前端签名）
     */
    function getWithdrawMessageHash(
        address to,
        uint256 amount,
        uint256 nonce
    ) external view returns (bytes32) {
        return _hashWithdrawMessage(to, amount, nonce);
    }

    /**
     * 内部函数：生成提现消息哈希
     */
    function _hashWithdrawMessage(
        address to,
        uint256 amount,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Withdraw(address to,uint256 amount,uint256 nonce)"),
                to,
                amount,
                nonce
            )
        );
        return _hashTypedDataV4(structHash);
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
}
