const hre = require("hardhat")

async function main() {
  // Base Sepolia USDT address (测试网可能需要部署 mock 或使用现有地址)
  // 主网: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
  // 测试网: 需要根据实际情况配置
  const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x0000000000000000000000000000000000000000"

  // 配置参数
  const MAX_WITHDRAWAL_PER_TX = hre.ethers.parseUnits("1000", 6) // 1000 USDT
  const WITHDRAWAL_FEE_BPS = 50 // 0.5% (50/10000)

  console.log("Deploying MostBoxWallet...")
  console.log(`USDT: ${USDT_ADDRESS}`)
  console.log(`Max withdrawal: ${hre.ethers.formatUnits(MAX_WITHDRAWAL_PER_TX, 6)} USDT`)
  console.log(`Fee: ${WITHDRAWAL_FEE_BPS / 100}%`)

  const MostBoxWallet = await hre.ethers.getContractFactory("MostBoxWallet")
  const wallet = await MostBoxWallet.deploy(
    USDT_ADDRESS,
    MAX_WITHDRAWAL_PER_TX,
    WITHDRAWAL_FEE_BPS
  )

  await wallet.waitForDeployment()

  const address = await wallet.getAddress()
  console.log(`MostBoxWallet deployed to: ${address}`)

  // 输出部署信息用于前端配置
  console.log("\n--- Frontend Config ---")
  console.log(`CONTRACT_ADDRESS="${address}"`)
  console.log(`USDT_ADDRESS="${USDT_ADDRESS}"`)
  console.log(`CHAIN_ID=${hre.network.config.chainId || 84532}`)

  // 如果提供了 BASESCAN_API_KEY，验证合约
  if (process.env.BASESCAN_API_KEY && hre.network.name !== "hardhat") {
    console.log("\nVerifying contract on Basescan...")
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [
          USDT_ADDRESS,
          MAX_WITHDRAWAL_PER_TX,
          WITHDRAWAL_FEE_BPS,
        ],
      })
      console.log("Contract verified successfully!")
    } catch (error) {
      console.log("Verification failed:", error.message)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
