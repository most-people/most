'use client'

import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { MOSTBOX_WALLET_ABI } from '~/lib/contracts/config'
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ExternalLink, Loader2 } from 'lucide-react'

interface Transaction {
  hash: string
  type: 'deposit' | 'withdraw' | 'transfer'
  from: string
  to: string
  amount: string
  fee?: string
  timestamp: number
  blockNumber: number
}

interface TransactionHistoryProps {
  contract: ethers.Contract
  userAddress: string
  blockExplorer: string
}

export default function TransactionHistory({
  contract,
  userAddress,
  blockExplorer,
}: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTransactions()
  }, [userAddress])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const filterDeposited = contract.filters.Deposited(userAddress)
      const filterWithdrawn = contract.filters.Withdrawn(userAddress)
      const filterTransfer = contract.filters.InternalTransfer(userAddress)

      // Get last 100 blocks
      const provider = contract.runner?.provider as ethers.JsonRpcProvider
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - 10000)

      const [depositEvents, withdrawEvents, transferEvents] =
        await Promise.all([
          contract.queryFilter(filterDeposited, fromBlock),
          contract.queryFilter(filterWithdrawn, fromBlock),
          contract.queryFilter(filterTransfer, fromBlock),
        ])

      const txs: Transaction[] = []

      for (const event of depositEvents) {
        const args = (event as any).args
        const block = await event.getBlock()
        txs.push({
          hash: event.transactionHash,
          type: 'deposit',
          from: args.user,
          to: await contract.getAddress(),
          amount: ethers.formatUnits(args.amount, 6),
          timestamp: Number(block.timestamp),
          blockNumber: event.blockNumber,
        })
      }

      for (const event of withdrawEvents) {
        const args = (event as any).args
        const block = await event.getBlock()
        txs.push({
          hash: event.transactionHash,
          type: 'withdraw',
          from: args.user,
          to: args.to,
          amount: ethers.formatUnits(args.amount, 6),
          fee: ethers.formatUnits(args.fee, 6),
          timestamp: Number(block.timestamp),
          blockNumber: event.blockNumber,
        })
      }

      for (const event of transferEvents) {
        const args = (event as any).args
        const block = await event.getBlock()
        txs.push({
          hash: event.transactionHash,
          type: 'transfer',
          from: args.from,
          to: args.to,
          amount: ethers.formatUnits(args.amount, 6),
          timestamp: Number(block.timestamp),
          blockNumber: event.blockNumber,
        })
      }

      // Sort by timestamp descending
      txs.sort((a, b) => b.timestamp - a.timestamp)
      setTransactions(txs.slice(0, 50)) // Show last 50
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getTxIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownLeft size={16} className="tx-icon deposit" />
      case 'withdraw':
        return <ArrowUpRight size={16} className="tx-icon withdraw" />
      case 'transfer':
        return <ArrowLeftRight size={16} className="tx-icon transfer" />
      default:
        return null
    }
  }

  const getTxLabel = (type: string) => {
    switch (type) {
      case 'deposit':
        return '充值'
      case 'withdraw':
        return '提现'
      case 'transfer':
        return '转账'
      default:
        return type
    }
  }

  if (loading) {
    return (
      <div className="tx-history-loading">
        <Loader2 size={24} className="spin" />
        <p>加载交易记录...</p>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="tx-history-empty">
        <Wallet size={48} />
        <p>暂无交易记录</p>
      </div>
    )
  }

  return (
    <div className="tx-history">
      <div className="tx-list">
        {transactions.map(tx => (
          <div key={tx.hash} className="tx-item">
            <div className="tx-icon-wrap">{getTxIcon(tx.type)}</div>
            <div className="tx-content">
              <div className="tx-header">
                <span className="tx-type">{getTxLabel(tx.type)}</span>
                <span className={`tx-amount ${tx.type === 'deposit' ? 'positive' : 'negative'}`}>
                  {tx.type === 'deposit' ? '+' : '-'}{tx.amount} USDT
                </span>
              </div>
              <div className="tx-details">
                <span className="tx-time">{formatTime(tx.timestamp)}</span>
                {tx.fee && <span className="tx-fee">手续费: {tx.fee} USDT</span>}
                <a
                  href={`${blockExplorer}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-hash-link"
                >
                  {tx.hash.slice(0, 10)}... <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Wallet({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  )
}
