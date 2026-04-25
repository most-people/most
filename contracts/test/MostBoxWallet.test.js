const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("MostBoxWallet", function () {
  let wallet
  let mockUSDT
  let owner
  let user1
  let user2
  let user3

  const USDT_DECIMALS = 6n
  const ONE_USDT = 10n ** USDT_DECIMALS
  const MAX_WITHDRAWAL = 1000n * ONE_USDT
  const FEE_BPS = 50n // 0.5%

  beforeEach(async function () {
    ;[owner, user1, user2, user3] = await ethers.getSigners()

    // Deploy Mock USDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT")
    mockUSDT = await MockUSDT.deploy()
    await mockUSDT.waitForDeployment()

    // Deploy MostBoxWallet
    const MostBoxWallet = await ethers.getContractFactory("MostBoxWallet")
    wallet = await MostBoxWallet.deploy(
      await mockUSDT.getAddress(),
      MAX_WITHDRAWAL,
      FEE_BPS
    )
    await wallet.waitForDeployment()

    // Fund users with USDT
    await mockUSDT.mint(await user1.address, 10000n * ONE_USDT)
    await mockUSDT.mint(await user2.address, 10000n * ONE_USDT)
  })

  describe("Deployment", function () {
    it("Should set the correct USDT address", async function () {
      expect(await wallet.usdt()).to.equal(await mockUSDT.getAddress())
    })

    it("Should set the correct owner", async function () {
      expect(await wallet.owner()).to.equal(await owner.address)
    })

    it("Should set correct max withdrawal and fee", async function () {
      expect(await wallet.maxWithdrawalPerTx()).to.equal(MAX_WITHDRAWAL)
      expect(await wallet.withdrawalFeeBps()).to.equal(FEE_BPS)
    })
  })

  describe("Deposit", function () {
    it("Should accept USDT deposit and update balance", async function () {
      const depositAmount = 100n * ONE_USDT

      await mockUSDT
        .connect(user1)
        .approve(await wallet.getAddress(), depositAmount)
      await wallet.connect(user1).deposit(depositAmount)

      expect(await wallet.balances(await user1.address)).to.equal(
        depositAmount
      )
    })

    it("Should emit Deposited event", async function () {
      const depositAmount = 50n * ONE_USDT

      await mockUSDT
        .connect(user1)
        .approve(await wallet.getAddress(), depositAmount)

      await expect(wallet.connect(user1).deposit(depositAmount))
        .to.emit(wallet, "Deposited")
        .withArgs(await user1.address, depositAmount)
    })

    it("Should fail if amount is 0", async function () {
      await expect(wallet.connect(user1).deposit(0)).to.be.revertedWith(
        "Amount must be > 0"
      )
    })

    it("Should fail if not approved", async function () {
      await expect(
        wallet.connect(user1).deposit(100n * ONE_USDT)
      ).to.be.reverted
    })
  })

  describe("Withdraw", function () {
    let depositAmount
    let withdrawAmount

    beforeEach(async function () {
      depositAmount = 500n * ONE_USDT
      withdrawAmount = 100n * ONE_USDT

      await mockUSDT
        .connect(user1)
        .approve(await wallet.getAddress(), depositAmount)
      await wallet.connect(user1).deposit(depositAmount)
    })

    it("Should allow withdrawal with valid signature", async function () {
      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address

      // Build EIP-712 message
      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      const value = {
        to,
        amount: withdrawAmount,
        nonce: Number(nonce),
      }

      const signature = await user1.signTypedData(domain, types, value)

      const balanceBefore = await mockUSDT.balanceOf(to)

      await wallet
        .connect(user1)
        .withdraw(to, withdrawAmount, nonce, signature)

      const balanceAfter = await mockUSDT.balanceOf(to)
      const fee = (withdrawAmount * FEE_BPS) / 10000n
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount - fee)
    })

    it("Should increment nonce after withdrawal", async function () {
      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address

      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      const value = {
        to,
        amount: withdrawAmount,
        nonce: Number(nonce),
      }

      const signature = await user1.signTypedData(domain, types, value)

      await wallet
        .connect(user1)
        .withdraw(to, withdrawAmount, nonce, signature)

      expect(await wallet.nonces(await user1.address)).to.equal(nonce + 1n)
    })

    it("Should reject invalid signature", async function () {
      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address

      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      // Sign with wrong key (user2 instead of user1)
      const value = {
        to,
        amount: withdrawAmount,
        nonce: Number(nonce),
      }
      const signature = await user2.signTypedData(domain, types, value)

      await expect(
        wallet.connect(user1).withdraw(to, withdrawAmount, nonce, signature)
      ).to.be.revertedWith("Invalid signature")
    })

    it("Should reject replay attack (same nonce twice)", async function () {
      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address

      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      const value = {
        to,
        amount: withdrawAmount,
        nonce: Number(nonce),
      }
      const signature = await user1.signTypedData(domain, types, value)

      await wallet
        .connect(user1)
        .withdraw(to, withdrawAmount, nonce, signature)

      // Try to replay with same nonce
      await expect(
        wallet.connect(user1).withdraw(to, withdrawAmount, nonce, signature)
      ).to.be.revertedWith("Invalid nonce")
    })

    it("Should reject if balance insufficient", async function () {
      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address
      // 设置一个大于余额但小于 maxWithdrawal 的值
      const tooMuch = 600n * ONE_USDT

      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      const value = {
        to,
        amount: tooMuch,
        nonce: Number(nonce),
      }
      const signature = await user1.signTypedData(domain, types, value)

      await expect(
        wallet.connect(user1).withdraw(to, tooMuch, nonce, signature)
      ).to.be.revertedWith("Insufficient balance")
    })

    it("Should reject if exceeds max withdrawal", async function () {
      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address
      const tooMuch = MAX_WITHDRAWAL + 1n

      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      const value = {
        to,
        amount: tooMuch,
        nonce: Number(nonce),
      }
      const signature = await user1.signTypedData(domain, types, value)

      await expect(
        wallet.connect(user1).withdraw(to, tooMuch, nonce, signature)
      ).to.be.revertedWith("Exceeds max withdrawal")
    })
  })

  describe("Internal Transfer", function () {
    beforeEach(async function () {
      const depositAmount = 500n * ONE_USDT
      await mockUSDT
        .connect(user1)
        .approve(await wallet.getAddress(), depositAmount)
      await wallet.connect(user1).deposit(depositAmount)
    })

    it("Should transfer balance internally", async function () {
      const transferAmount = 100n * ONE_USDT

      const balance1Before = await wallet.balances(await user1.address)
      const balance2Before = await wallet.balances(await user2.address)

      await wallet
        .connect(user1)
        .internalTransfer(await user2.address, transferAmount)

      expect(await wallet.balances(await user1.address)).to.equal(
        balance1Before - transferAmount
      )
      expect(await wallet.balances(await user2.address)).to.equal(
        balance2Before + transferAmount
      )
    })

    it("Should emit InternalTransfer event", async function () {
      const transferAmount = 50n * ONE_USDT

      await expect(
        wallet
          .connect(user1)
          .internalTransfer(await user2.address, transferAmount)
      )
        .to.emit(wallet, "InternalTransfer")
        .withArgs(await user1.address, await user2.address, transferAmount)
    })

    it("Should fail if balance insufficient", async function () {
      await expect(
        wallet
          .connect(user2)
          .internalTransfer(await user1.address, 100n * ONE_USDT)
      ).to.be.revertedWith("Insufficient balance")
    })

    it("Should fail if transfer to self", async function () {
      await expect(
        wallet
          .connect(user1)
          .internalTransfer(await user1.address, 10n * ONE_USDT)
      ).to.be.revertedWith("Cannot transfer to self")
    })
  })

  describe("Admin Functions", function () {
    it("Should allow owner to withdraw fees", async function () {
      // Generate some fees
      const depositAmount = 500n * ONE_USDT
      const withdrawAmount = 100n * ONE_USDT

      await mockUSDT
        .connect(user1)
        .approve(await wallet.getAddress(), depositAmount)
      await wallet.connect(user1).deposit(depositAmount)

      const nonce = await wallet.nonces(await user1.address)
      const to = await user2.address

      const domain = {
        name: "MostBoxWallet",
        version: "1",
        chainId: 31337,
        verifyingContract: await wallet.getAddress(),
      }

      const types = {
        Withdraw: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      }

      const value = {
        to,
        amount: withdrawAmount,
        nonce: Number(nonce),
      }
      const signature = await user1.signTypedData(domain, types, value)

      await wallet
        .connect(user1)
        .withdraw(to, withdrawAmount, nonce, signature)

      const fees = await wallet.accumulatedFees()
      expect(fees).to.be.gt(0)

      const ownerBalanceBefore = await mockUSDT.balanceOf(await owner.address)
      await wallet.withdrawFees()
      const ownerBalanceAfter = await mockUSDT.balanceOf(await owner.address)

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(fees)
      expect(await wallet.accumulatedFees()).to.equal(0)
    })

    it("Should allow owner to set max withdrawal", async function () {
      const newLimit = 500n * ONE_USDT
      await wallet.setMaxWithdrawal(newLimit)
      expect(await wallet.maxWithdrawalPerTx()).to.equal(newLimit)
    })

    it("Should allow owner to set fee", async function () {
      const newFee = 100n // 1%
      await wallet.setWithdrawalFee(newFee)
      expect(await wallet.withdrawalFeeBps()).to.equal(newFee)
    })

    it("Should allow owner to pause/unpause", async function () {
      await wallet.setPaused(true)
      expect(await wallet.paused()).to.equal(true)

      await mockUSDT
        .connect(user1)
        .approve(await wallet.getAddress(), 100n * ONE_USDT)
      await expect(
        wallet.connect(user1).deposit(100n * ONE_USDT)
      ).to.be.revertedWith("Contract is paused")

      await wallet.setPaused(false)
      expect(await wallet.paused()).to.equal(false)
    })

    it("Should reject non-owner admin calls", async function () {
      await expect(
        wallet.connect(user1).setMaxWithdrawal(100n * ONE_USDT)
      ).to.be.reverted
      await expect(wallet.connect(user1).setWithdrawalFee(100n)).to.be.reverted
      await expect(wallet.connect(user1).setPaused(true)).to.be.reverted
      await expect(wallet.connect(user1).withdrawFees()).to.be.reverted
    })
  })
})
