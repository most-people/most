'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Bot,
  Copy,
  Moon,
  Play,
  RotateCcw,
  Send,
  Share2,
  Sun,
  Users,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import SidebarAccount from '~/components/SidebarAccount'
import { getAuthenticatedWebSocketUrl } from '~/server/src/utils/api'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import styles from './page.module.css'

const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
const straightRanks = ranks.filter(rank => rank !== '2')
const rankValue = new Map(ranks.map((rank, index) => [rank, index + 3]))

type Card = {
  id: string
  suit: string
  rank: string
  label: string
  color: 'red' | 'black'
}

type Player = {
  id: string
  address?: string
  name: string
  bot: boolean
  seat: number
  connected: boolean
  handCount: number
  hand: Card[]
  score: number
  playedCards: number
}

type Room = {
  id: string
  ownerId: string
  status: 'lobby' | 'playing' | 'finished'
  settings: { decks: number; seats: number; bots: number }
  players: Player[]
  deckCount: number
  discardCount: number
  currentSeat: number
  baseScore: number
  bombCount: number
  diceRolls?: { name: string; value: number }[]
  table?: { playerName: string; cards: Card[]; combo?: { label: string } } | null
  winnerSeat: number | null
  roundResult?: {
    winnerName: string
    winnerGain: number
    losers: { seat: number; name: string; loss: number; sealed: boolean; cardsLeft: number }[]
  } | null
  log: string[]
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

export default function GanDengYanPage() {
  const socketRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [playerId, setPlayerId] = useState('')
  const [room, setRoom] = useState<Room | null>(null)
  const [roomId, setRoomId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const { isDarkMode, setIsDarkMode } = useAppStore()
  const { identity, initializeUser, openLoginModal } = useUserStore()

  useEffect(() => {
    initializeUser()
  }, [initializeUser])

  useEffect(() => {
    let closed = false
    let socket: WebSocket | null = null

    async function connect() {
      const url = await getAuthenticatedWebSocketUrl('/ws')
      if (closed) return
      socket = new WebSocket(url)
      socketRef.current = socket
      socket.addEventListener('open', () => setConnected(true))
      socket.addEventListener('close', () => setConnected(false))
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        if (message.event === 'gandengyan:hello') setPlayerId(message.data.playerId)
        if (message.event === 'gandengyan:roomCreated') {
          setRoomId(message.data.roomId)
          setRoomUrl(message.data.roomId)
        }
        if (message.event === 'gandengyan:state') {
          setRoom(message.data)
          setRoomUrl(message.data.id)
          setSelected([])
          setError('')
        }
        if (message.event === 'gandengyan:error') setError(message.data.message)
      })
    }

    void connect()

    return () => {
      closed = true
      socket?.close()
    }
  }, [])

  useEffect(() => {
    const initialRoom = new URLSearchParams(window.location.search)
      .get('room')
      ?.toUpperCase()
    if (initialRoom) setRoomId(initialRoom)
  }, [])

  const me = useMemo(
    () => room?.players.find(player => player.id === playerId) || null,
    [room, playerId]
  )
  const isOwner = room?.ownerId === playerId
  const myTurn = room?.status === 'playing' && room.currentSeat === me?.seat
  const selectedCards = useMemo(
    () => selected.map(id => me?.hand.find(card => card.id === id)).filter(Boolean) as Card[],
    [selected, me]
  )
  const preview = useMemo(() => analyzeSelection(selectedCards), [selectedCards])
  const shareLink =
    room && typeof window !== 'undefined'
      ? `${window.location.origin}/gandengyan?room=${room.id}`
      : ''
  const lowDeck = Boolean(room && room.status === 'playing' && room.deckCount < 3)

  function send(event: string, data: Record<string, unknown> = {}) {
    if (!identity) {
      openLoginModal()
      return
    }
    setError('')
    socketRef.current?.send(
      JSON.stringify({
        event,
        data: { ...data, identity },
      })
    )
  }

  function copyShareLink() {
    void navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  function joinRoomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send('gandengyan:joinRoom', { roomId })
  }

  function changeSettings(key: string, value: number) {
    if (!room) return
    send('gandengyan:settings', { settings: { ...room.settings, [key]: value } })
  }

  function toggleCard(cardId: string) {
    setSelected(value =>
      value.includes(cardId)
        ? value.filter(id => id !== cardId)
        : [...value, cardId]
    )
  }

  const sidebar = ({ closeSidebar }) => (
    <>
      <Link href="/" className="sidebar-header sidebar-header-link">
        <ArrowLeft size={18} />
        <h1>MOST PEOPLE</h1>
      </Link>
      <nav className="sidebar-nav">
        <Link href="/app/" className="sidebar-nav-btn" onClick={closeSidebar}>
          <Share2 size={16} />
          <span>文件</span>
        </Link>
        <Link href="/chat/" className="sidebar-nav-btn" onClick={closeSidebar}>
          <Users size={16} />
          <span>频道</span>
        </Link>
        <Link href="/gandengyan/" className="sidebar-nav-btn active" onClick={closeSidebar}>
          <Bot size={16} />
          <span>干瞪眼</span>
        </Link>
      </nav>
      <SidebarAccount />
    </>
  )

  return (
    <AppShell
      sidebar={sidebar}
      headerTitle={<h2 className="header-title">干瞪眼</h2>}
      headerRight={
        <div className={styles.headerActions}>
          {room && (
            <button className="btn btn-sm" onClick={copyShareLink}>
              <Copy size={14} />
              {copied ? '已复制' : '分享房间'}
            </button>
          )}
          <button
            className="btn btn-icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="切换主题"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      }
    >
      <main className={styles.page}>
        {!room ? (
          <section className={styles.entry}>
            <div className={styles.entryBrand}>
              <div className={styles.cardMark}>干</div>
              <div>
                <h1>干瞪眼牌桌</h1>
                <p>
                  使用 MostBox 账号进入房间，牌桌通信复用当前节点的 WebSocket 连接。
                </p>
              </div>
            </div>

            <div className={styles.entryPanel}>
              <div className={styles.accountLine}>
                <span>当前账号</span>
                <strong>{identity?.displayName || '未登录'}</strong>
              </div>
              <button
                className="btn btn-primary"
                disabled={!connected}
                onClick={() => send('gandengyan:createRoom')}
              >
                <Play size={16} />
                创建房间
              </button>
              <form onSubmit={joinRoomSubmit} className={styles.joinForm}>
                <label>
                  房间号
                  <input
                    value={roomId}
                    maxLength={8}
                    onChange={event => setRoomId(event.target.value.toUpperCase())}
                    placeholder="输入房间号"
                  />
                </label>
                <button className="btn" disabled={!connected || !roomId}>
                  加入房间
                </button>
              </form>
              <p className={styles.status}>{connected ? '节点已连接' : '正在连接节点...'}</p>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          </section>
        ) : (
          <section className={styles.gameGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.roomBar}>
                <div>
                  <strong>房间 {room.id}</strong>
                  <span>{room.status === 'lobby' ? '等待开局' : room.status === 'finished' ? '本局结束' : '进行中'}</span>
                </div>
                <div className={styles.badges}>
                  {lowDeck && <span className={styles.dangerBadge}>牌堆不足 3 张</span>}
                  <span>{connected ? '在线' : '离线'}</span>
                </div>
              </div>

              <div className={styles.seats}>
                {room.players.map(player => (
                  <PlayerBadge
                    key={player.seat}
                    player={player}
                    active={room.currentSeat === player.seat}
                    winner={room.winnerSeat === player.seat}
                    relation={positionLabel(me, player, room.players.length)}
                  />
                ))}
              </div>

              <div className={styles.centerTable}>
                <div className={styles.deckBox}>
                  <span>牌堆</span>
                  <strong>{room.deckCount}</strong>
                </div>
                <div className={styles.playedBox}>
                  {room.table ? (
                    <>
                      <strong>
                        {room.table.playerName} 出 {room.table.combo?.label || '牌'}
                      </strong>
                      <div className={styles.playedCards}>
                        {room.table.cards.map(card => (
                          <CardView key={card.id} card={card} small />
                        ))}
                      </div>
                    </>
                  ) : (
                    <span>等待领出</span>
                  )}
                </div>
                <div className={styles.deckBox}>
                  <span>底分</span>
                  <strong>{room.baseScore}</strong>
                </div>
              </div>

              <div className={styles.notice}>
                {room.status === 'finished'
                  ? `${room.players.find(player => player.seat === room.winnerSeat)?.name} 获胜`
                  : myTurn
                    ? '轮到你出牌'
                    : `等待 ${room.players.find(player => player.seat === room.currentSeat)?.name || '玩家'}`}
              </div>
            </div>

            <aside className={styles.sidePanel}>
              <section className={styles.panel}>
                <h3>开局设置</h3>
                <div className={styles.segmented}>
                  {[1, 2].map(value => (
                    <button
                      key={value}
                      className={room.settings.decks === value ? styles.selected : ''}
                      disabled={!isOwner || room.status !== 'lobby'}
                      onClick={() => changeSettings('decks', value)}
                    >
                      {value} 副牌
                    </button>
                  ))}
                </div>
                <div className={styles.segmented}>
                  {[2, 3, 4, 5, 6].map(value => (
                    <button
                      key={value}
                      className={room.settings.seats === value ? styles.selected : ''}
                      disabled={!isOwner || room.status !== 'lobby'}
                      onClick={() => changeSettings('seats', value)}
                    >
                      {value} 人
                    </button>
                  ))}
                </div>
                <label className={styles.rangeLine}>
                  人机数量
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, room.settings.seats - 1)}
                    value={room.settings.bots}
                    disabled={!isOwner || room.status !== 'lobby'}
                    onChange={event => changeSettings('bots', Number(event.target.value))}
                  />
                  <b>{room.settings.bots}</b>
                </label>
                {isOwner && room.status === 'lobby' && (
                  <button className="btn btn-primary" onClick={() => send('gandengyan:start')}>
                    <Play size={16} />
                    开始游戏
                  </button>
                )}
                {isOwner && room.status === 'finished' && (
                  <button className="btn btn-primary" onClick={() => send('gandengyan:restart')}>
                    <RotateCcw size={16} />
                    再来一局
                  </button>
                )}
              </section>

              <section className={styles.panel}>
                <h3>分数</h3>
                <div className={styles.scoreMeta}>
                  <span>炸弹 {room.bombCount} 次</span>
                  <span>弃牌 {room.discardCount} 张</span>
                </div>
                {room.players.map(player => (
                  <div key={player.seat} className={styles.scoreRow}>
                    <span>{player.name}</span>
                    <strong>{player.score > 0 ? `+${player.score}` : player.score}</strong>
                  </div>
                ))}
              </section>

              <section className={classNames(styles.panel, styles.logPanel)}>
                <h3>牌局记录</h3>
                {room.log.map((item, index) => (
                  <p key={`${item}-${index}`}>{item}</p>
                ))}
              </section>
            </aside>

            <div className={styles.handPanel}>
              <PlayerBadge player={me} active={myTurn} winner={room.winnerSeat === me?.seat} />
              <div className={styles.hand}>
                {me?.hand.map(card => (
                  <button
                    key={card.id}
                    className={classNames(styles.cardButton, selected.includes(card.id) && styles.picked)}
                    onClick={() => toggleCard(card.id)}
                  >
                    <CardView card={card} />
                  </button>
                ))}
              </div>
              <div className={styles.actions}>
                <div className={classNames(styles.preview, preview && styles.valid)}>
                  <strong>{preview ? preview.label : selected.length ? '牌型不合法' : '先选牌'}</strong>
                  <span>{selectedCards.map(card => card.label).join(' ') || '按选择顺序解释大小王'}</span>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!myTurn || selected.length === 0 || !preview}
                  onClick={() => send('gandengyan:play', { cardIds: selected })}
                >
                  <Send size={16} />
                  出牌
                </button>
                <button className="btn" disabled={!myTurn || !room.table} onClick={() => send('gandengyan:pass')}>
                  不要
                </button>
                {error && <span className={styles.error}>{error}</span>}
              </div>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  )
}

function PlayerBadge({ player, active, winner, relation = '' }) {
  if (!player) return null
  return (
    <div className={classNames(styles.player, active && styles.active, winner && styles.winner)}>
      <div className={styles.avatar}>{player.bot ? 'AI' : player.name.slice(0, 1)}</div>
      <div>
        <strong>{player.name}</strong>
        <span>
          {relation}
          {relation ? ' · ' : ''}
          {player.handCount} 张{player.connected ? '' : ' · 掉线'}
        </span>
      </div>
    </div>
  )
}

function CardView({ card, small = false }: { card: Card; small?: boolean }) {
  return (
    <div className={classNames(styles.card, styles[card.color], small && styles.small)}>
      <span>{card.label}</span>
      <i>{card.suit === 'Joker' ? '★' : card.label.slice(0, 1)}</i>
    </div>
  )
}

function analyzeSelection(cards: Card[]) {
  if (!cards.length) return null
  const jokerCount = cards.filter(isJoker).length
  const normals = cards.filter(card => !isJoker(card))
  if (normals.length === 0) return null
  const bomb = analyzeBomb(cards, normals, jokerCount)
  if (bomb) return bomb
  if (cards.length === 1 && jokerCount === 0) {
    const value = cardValue(cards[0])
    return comboLabel('单张', [value])
  }
  if (cards.length === 2 && canRepresentSameRank(normals)) {
    const value = cardValue(normals[0])
    return comboLabel('对子', [value, value])
  }
  return analyzeStraight(cards) || analyzePairStraight(cards)
}

function analyzeBomb(cards: Card[], normals: Card[], jokerCount: number) {
  if (cards.length < 3 || !canRepresentSameRank(normals)) return null
  const value = cardValue(normals[0])
  return comboLabel(jokerCount === 0 ? '纯炸弹' : '带王炸弹', Array(cards.length).fill(value))
}

function analyzeStraight(cards: Card[]) {
  if (cards.length < 3) return null
  for (let start = 0; start <= straightRanks.length - cards.length; start += 1) {
    const values = straightRanks.slice(start, start + cards.length).map(rank => rankValue.get(rank))
    if (cards.every((card, index) => isJoker(card) || cardValue(card) === values[index])) {
      return comboLabel('顺子', values)
    }
  }
  return null
}

function analyzePairStraight(cards: Card[]) {
  if (cards.length < 4 || cards.length % 2 !== 0) return null
  const pairCount = cards.length / 2
  for (let start = 0; start <= straightRanks.length - pairCount; start += 1) {
    const pairValues = straightRanks.slice(start, start + pairCount).map(rank => rankValue.get(rank))
    const values = pairValues.flatMap(value => [value, value])
    if (cards.every((card, index) => isJoker(card) || cardValue(card) === values[index])) {
      return comboLabel('连对', values)
    }
  }
  return null
}

function comboLabel(name: string, values: Array<number | undefined>) {
  return { label: `${name}（${values.map(valueLabel).join(' ')}）` }
}

function setRoomUrl(id: string) {
  if (!id) return
  const nextUrl = `/gandengyan?room=${id}`
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, '', nextUrl)
  }
}

function positionLabel(me: Player | null, player: Player, total: number) {
  if (!me) return `座位 ${player.seat + 1}`
  const offset = (player.seat - me.seat + total) % total
  if (offset === 0) return '我'
  if (total === 2) return '对手位'
  if (total === 3) return offset === 1 ? '下家/对手位' : '上家/对手位'
  if (total === 4) {
    if (offset === 1) return '下家/对手位'
    if (offset === 2) return '对家/队友位'
    return '上家/对手位'
  }
  return offset % 2 === 0 ? `座位 ${player.seat + 1}/队友位` : `座位 ${player.seat + 1}/对手位`
}

function canRepresentSameRank(normals: Card[]) {
  return normals.length > 0 && normals.every(card => card.rank === normals[0].rank)
}

function isJoker(card: Card) {
  return card.rank === 'SJ' || card.rank === 'BJ'
}

function cardValue(card: Card) {
  return rankValue.get(card.rank) || 99
}

function valueLabel(value: number | undefined) {
  return ranks.find(rank => rankValue.get(rank) === value) || String(value)
}
