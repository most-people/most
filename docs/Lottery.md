# 彩票合约开发计划（CaiPiao.md）

> 前端 UI 已按此计划实现。本文件记录后续合约开发所需的技术决策与实施步骤。

---

## 一、已确认的需求规则

| 项目 | 规则 |
|---|---|
| **网络** | Base Mainnet + Base Sepolia（测试网） |
| **支付代币** | USDT（6 位小数） |
| **购票方式** | 用户转入整数 USDT，金额 = 票数 |
| **彩票凭证** | 钱包地址（不再生成号码） |
| **单地址多票** | 支持。买 N 张 = N 个独立中奖机会 |
| **开奖随机源** | Chainlink VRF v2.5 |
| **开奖触发** | Chainlink Automation（Keepers）自动触发 |
| **轮次周期** | 固定 24 小时 |
| **首次启动** | 合约部署后立即开始第一轮 |

---

## 二、奖项分配（保留现有比例）

| 奖项 | 奖池比例 | 中奖单位 |
|---|---|---|
| 一等奖 | 50% | 1 张票 |
| 二等奖 | 10% | 1 张票 |
| 三等奖 | 5% | 1 张票 |
| 参与奖 | 35% | 所有未中一二三等的票平分 |

---

## 三、合约核心设计

### 3.1 购票
```
function buyTickets(uint256 usdtAmount)
  require(amount > 0 && amount % 1e6 == 0, "Must be positive integer USDT")
  transferFrom(msg.sender, address(this), amount)
  ticketsOf[msg.sender] += amount
  for i in 0..amount-1:
    allTickets.push(msg.sender)
  totalTickets += amount
  emit TicketPurchased(msg.sender, currentRound, amount)
```

### 3.2 数据结构
- `mapping(address => uint256) ticketsOf` — 地址当前轮次票数
- `address[] allTickets` — 扁平化票列表，`allTickets[i]` = 第 i 张票的地址
- `uint256 currentRound` — 当前轮次
- `uint256 endTime` — 本轮截止时间
- `bool drawn` — 本轮是否已开奖

### 3.3 VRF 开奖（3 个随机字）
- `winner1Idx = randomWords[0] % totalTickets`
- `winner2Idx = randomWords[1] % totalTickets`
- `winner3Idx = randomWords[2] % totalTickets`
- 去重：若二/三等与前面重复，顺延一位（`+1 % totalTickets`）直到不重复
- 参与奖：未中一二三等的票数平分 35%

### 3.4 轮次滚动
开奖完成后立即：
- `currentRound++`
- 清空 `allTickets`，重置 `totalTickets = 0`
- `endTime = block.timestamp + 24 hours`
- `drawn = false`

---

## 四、前端 ABI 关键接口（已按此设计 UI）

```typescript
// 读取
function currentRound() view returns uint256
function totalTickets() view returns uint256
function endTime() view returns uint256
function drawn() view returns bool
function ticketsOf(address) view returns uint256

// 写入
function buyTickets(uint256 usdtAmount)

// 事件
event TicketPurchased(address indexed buyer, uint256 roundId, uint256 amount)
event DrawCompleted(uint256 indexed roundId, address winner1, address winner2, address winner3, uint256 participationPerTicket)
```

---

## 五、未决问题（合约开发时需解决）

### 5.1 VRF 订阅资金
Chainlink VRF v2.5 在 Base 上需要：
- 创建 VRF Subscription
- 向 Subscription 充值 LINK（用于支付随机数请求费用）
- 合约调用 `requestRandomWords` 时从 Subscription 扣费

**待决策**：谁来创建和管理 Subscription？项目方单独管理，还是合约自带管理功能？

### 5.2 Automation 注册
Chainlink Automation 需要：
- 在 Chainlink Automation UI 注册 Upkeep
- 充值 LINK 作为执行 Gas 费
- 设置 trigger 条件：`block.timestamp >= endTime && !drawn`

**待决策**：是否合约部署脚本里自动调用 Automation Registry 注册？还是手动在 UI 注册？

### 5.3 USDT 合约地址
| 网络 | USDT 地址 |
|---|---|
| Base Mainnet | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`（官方 USDbC/USDC？需确认 Base 上 USDT 实际合约） |
| Base Sepolia | 需查找测试网 USDT 或 USDC 地址 |

> **注意**：Base 官方原生稳定币主要是 USDC（官方桥接）。USDT 在 Base 上的合约需要确认是官方 Tether 部署还是第三方封装。

---

## 六、实施步骤（后续执行）

```
Phase 1: 合约开发
  1.1 安装 Hardhat + @nomicfoundation/hardhat-toolbox
  1.2 安装 @chainlink/contracts（VRF + Automation 接口）
  1.3 配置 hardhat.config.ts 支持 Base Mainnet / Sepolia
  1.4 编写 contracts/MostLottery.sol
  1.5 编写 deploy/00_deploy_most_lottery.ts
  1.6 Base Sepolia 部署 + 手动测试购票/开奖
  1.7 配置 VRF Subscription + Automation Upkeep
  1.8 Base Mainnet 部署

Phase 2: 前端联调
  2.1 LotteryStore 接入真实合约地址和 ABI
  2.2 替换 mock 数据为 ethers.js 调用
  2.3 添加 approve USDT 逻辑
  2.4 监听 TicketPurchased / DrawCompleted 事件
  2.5 Base Sepolia 端到端测试
  2.6 切换到 Base Mainnet 上线
```

---

## 七、关键合约地址（部署后填充）

| 网络 | 合约地址 | 部署时间 |
|---|---|---|
| Base Sepolia | `TBD` | |
| Base Mainnet | `TBD` | |

