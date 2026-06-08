'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Moon, Play, RotateCcw, Send, Sun } from 'lucide-react'
import AppShell from '~/components/AppShell'
import GameSidebar from '~/components/GameSidebar'
import { useGameRoom } from '~/hooks/useGameRoom'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import {
  analyzeCards,
  createGanDengYanRoom,
  passGanDengYanTurn,
  playGanDengYanCards,
  removeGanDengYanPlayer,
  startGanDengYanRound,
  syncGanDengYanLobby,
} from '~/server/src/games/gandengyan.js'
import {
  deriveGameRoomLobby,
  getLatestGameState,
} from '~/server/src/core/gameRoom.js'
import styles from './page.module.css'

type Card = {
  id: string
  suit: string
  rank: string
  label: string
  color: 'red' | 'black'
}

type Player = {
  address: string
  name: string
  seat: number
  handCount: number
  hand: Card[]
  score: number
  playedCards: number
}

type Room = {
  id: string
  ownerAddress: string
  status: 'lobby' | 'playing' | 'finished'
  seq: number
  players: Player[]
  deckCount: number
  discardCount: number
  currentSeat: number
  baseScore: number
  bombCount: number
  table?: {
    playerName: string
    cards: Card[]
    combo?: { label: string }
  } | null
  winnerSeat: number | null
  roundResult?: {
    winnerSeat: number
    winnerName: string
    winnerGain: number
    baseScore: number
    bombCount: number
    losers: Array<{
      seat: number
      name: string
      loss: number
      sealed: boolean
      cardsLeft: number
    }>
  } | null
  log: string[]
}

const GAME_ID = 'gandengyan'

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

function sameAddress(left?: string, right?: string) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text)
    return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.1
  window.speechSynthesis.speak(utterance)
}

function pronounce(rank: string) {
  return rank === 'J'
    ? '勾'
    : rank === 'Q'
      ? '圈'
      : rank === 'A'
        ? '坚'
        : rank === '10'
          ? '十'
          : rank
}

function getSpeechText(logEntry: string) {
  if (!logEntry) return ''
  if (/不要/.test(logEntry)) return '不要'
  if (/本轮结束/.test(logEntry)) return '不要'
  if (/新一局开始/.test(logEntry)) return '新一局开始'
  if (/获胜/.test(logEntry)) return '游戏结束'

  const playMatch = logEntry.match(
    /出\s+(\S+?)(?:（([^）]+)）)?\s+(?:[♠♥♣♦]|小王|大王)/
  )
  if (!playMatch) return ''

  const type = playMatch[1]
  const raw = playMatch[2]

  if (!raw) return type

  const ranks = raw.split(/\s+/).map(pronounce)

  if (type === '对子') return `对${ranks[0]}`
  if (type === '单张') return ranks[0]
  if (/炸弹/.test(type)) return `${ranks[0]}炸`
  if (type === '顺子') return ranks.join(' ')
  if (type === '连对') {
    const unique: string[] = []
    for (let i = 0; i < ranks.length; i += 2) unique.push(ranks[i])
    return '连对 ' + unique.flatMap(r => [r, r]).join(' ')
  }

  return type
}

export default function GanDengYanPage() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const initializeUser = useUserStore(s => s.initializeUser)
  const [roomInput, setRoomInput] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const pendingAutoJoin = useRef('')
  const autoJoinAttempted = useRef(false)

  const game = useGameRoom({
    gameId: GAME_ID,
    onError: message => addToast(message, 'error'),
  })

  useEffect(() => {
    initializeUser()
  }, [initializeUser])

  useEffect(() => {
    const initialRoom = new URLSearchParams(window.location.search)
      .get('room')
      ?.toUpperCase()
    if (initialRoom) {
      setRoomInput(initialRoom)
      pendingAutoJoin.current = initialRoom
    }
  }, [])

  useEffect(() => {
    const code = pendingAutoJoin.current
    if (!code || autoJoinAttempted.current) return
    if (!game.isBackendReady || !game.userIdentity) return
    autoJoinAttempted.current = true
    pendingAutoJoin.current = ''
    void game.joinRoom(code).then(ok => {
      if (ok) addToast('已进入房间', 'success')
    })
  }, [game.isBackendReady, game.userIdentity, game.joinRoom, addToast])

  useEffect(() => {
    if (!game.roomCode) return
    const nextUrl = `/game/gandengyan?room=${game.roomCode}`
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [game.roomCode])

  const lobby = useMemo(
    () =>
      deriveGameRoomLobby(
        game.messages,
        game.roomCode
          ? { gameId: GAME_ID, roomCode: game.roomCode }
          : { gameId: GAME_ID }
      ),
    [game.messages, game.roomCode]
  )
  const latestStateEvent = useMemo(
    () =>
      getLatestGameState(game.messages, {
        gameId: GAME_ID,
        roomCode: game.roomCode,
      }),
    [game.messages, game.roomCode]
  )
  const room = latestStateEvent?.payload?.state as Room | null
  const me = room?.players.find(player =>
    sameAddress(player.address, game.userIdentity?.address)
  )
  const isOwner = sameAddress(
    room?.ownerAddress || lobby.hostAddress,
    game.userIdentity?.address
  )
  const myTurn = room?.status === 'playing' && room.currentSeat === me?.seat
  const selectedCards = useMemo(
    () =>
      selected
        .map(id => me?.hand.find(card => card.id === id))
        .filter(Boolean) as Card[],
    [selected, me]
  )
  const preview = useMemo(() => analyzeCards(selectedCards), [selectedCards])
  const shareLink =
    game.roomCode && typeof window !== 'undefined'
      ? `${window.location.origin}/game/gandengyan?room=${game.roomCode}`
      : ''
  const prevSeqRef = useRef(-1)
  const lastSpokenLogRef = useRef('')
  const spokenFinishedRef = useRef(false)

  useEffect(() => {
    setSelected([])
  }, [room?.seq])

  useEffect(() => {
    if (!room) return
    const seq = room.seq
    if (prevSeqRef.current < 0) {
      prevSeqRef.current = seq
      return
    }
    if (seq === prevSeqRef.current) return
    prevSeqRef.current = seq

    if (room.status !== 'finished') {
      spokenFinishedRef.current = false
    }

    if (room.status === 'finished' && room.winnerSeat !== null) {
      if (!spokenFinishedRef.current) {
        spokenFinishedRef.current = true
        speak('游戏结束')
      }
      return
    }

    const latestLog = room.log[0] || ''
    if (latestLog && latestLog !== lastSpokenLogRef.current) {
      lastSpokenLogRef.current = latestLog
      const text = getSpeechText(latestLog)
      if (text) speak(text)
    }
  }, [room?.seq])

  useEffect(() => {
    if (!isOwner || !game.roomCode || !game.userIdentity) return
    if (latestStateEvent || lobby.players.length === 0) return
    const nextRoom = createGanDengYanRoom({
      roomCode: game.roomCode,
      ownerAddress: game.userIdentity.address,
      ownerName: game.userIdentity.displayName || game.userIdentity.username,
      players: lobby.players,
    })
    void game.sendRoomEvent('room:state', {
      state: nextRoom,
      seq: nextRoom.seq,
    })
  }, [game, isOwner, latestStateEvent, lobby.players])

  useEffect(() => {
    if (!room || !isOwner || room.status !== 'lobby') return
    const synced = syncGanDengYanLobby(room, lobby.players)
    if (synced && synced.players.length !== room.players.length) {
      void game.sendRoomEvent('room:state', { state: synced, seq: synced.seq })
    }
  }, [game, isOwner, lobby.players, room])

  const leaveCountRef = useRef(0)
  const leaveEvents = useMemo(
    () => game.roomEvents.filter(e => e.event?.event === 'player:leave'),
    [game.roomEvents]
  )
  useEffect(() => {
    if (leaveEvents.length <= leaveCountRef.current) return
    const newLeaves = leaveEvents.slice(leaveCountRef.current)
    leaveCountRef.current = leaveEvents.length
    for (const item of newLeaves) {
      const name = item.event?.payload?.player?.name || '玩家'
      addToast(`${name} 已退出房间`, 'info')
    }
  }, [leaveEvents, addToast])

  useEffect(() => {
    if (!room || !isOwner || room.status !== 'playing') return
    const lobbyAddresses = new Set(
      lobby.players.map(p => p.address.toLowerCase())
    )
    const missing = room.players.find(
      p => !lobbyAddresses.has(p.address.toLowerCase())
    )
    if (!missing) return
    const updated = removeGanDengYanPlayer(room, missing.address)
    if (updated) void publishState(updated as Room)
  }, [game, isOwner, lobby.players, room])

  async function createRoom() {
    const ok = await game.createRoom()
    if (ok) addToast('房间已创建', 'success')
  }

  async function joinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ok = await game.joinRoom(roomInput)
    if (ok) addToast('已进入房间', 'success')
  }

  async function copyShareLink() {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  async function publishState(nextRoom: Room) {
    await game.sendRoomEvent('room:state', {
      state: nextRoom,
      seq: nextRoom.seq,
    })
  }

  async function startRound() {
    if (!room || !isOwner) return
    try {
      await publishState(startGanDengYanRound(room))
    } catch (err) {
      addToast(err instanceof Error ? err.message : '开局失败', 'error')
    }
  }

  async function restartRound() {
    await startRound()
  }

  async function playSelected() {
    if (!room || !game.userIdentity) return
    const result = playGanDengYanCards(
      room,
      game.userIdentity.address,
      selected
    )
    if (!result.ok) {
      addToast(result.error || '出牌失败', 'error')
      return
    }
    await publishState(result.state)
  }

  async function passTurn() {
    if (!room || !game.userIdentity) return
    const result = passGanDengYanTurn(room, game.userIdentity.address)
    if (!result.ok) {
      addToast(result.error || '操作失败', 'error')
      return
    }
    await publishState(result.state)
  }

  function toggleCard(cardId: string) {
    setSelected(value =>
      value.includes(cardId)
        ? value.filter(id => id !== cardId)
        : [...value, cardId]
    )
  }

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <GameSidebar activeGame="gandengyan" closeSidebar={closeSidebar} />
      )}
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
                  创建房间码邀请朋友加入，房间状态通过 MostBox P2P 频道同步。
                </p>
              </div>
            </div>

            <div className={styles.entryPanel}>
              <div className={styles.accountLine}>
                <span>当前账号</span>
                <strong>{game.userIdentity?.displayName || '未登录'}</strong>
              </div>
              <button
                className="btn btn-primary"
                disabled={game.joining}
                onClick={createRoom}
              >
                <Play size={16} />
                创建房间
              </button>
              <form onSubmit={joinRoom} className={styles.joinForm}>
                <label>
                  房间号
                  <input
                    value={roomInput}
                    maxLength={8}
                    onChange={event =>
                      setRoomInput(event.target.value.toUpperCase())
                    }
                    placeholder="输入房间号"
                  />
                </label>
                <button className="btn" disabled={game.joining || !roomInput}>
                  加入房间
                </button>
              </form>
              <p className={styles.status}>
                {game.isBackendReady ? '节点已连接' : '正在连接节点...'}
              </p>
            </div>
          </section>
        ) : (
          <section className={styles.gameGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.roomBar}>
                <div>
                  <strong>房间 {room.id}</strong>
                  <span>
                    {room.status === 'lobby'
                      ? '等待开局'
                      : room.status === 'finished'
                        ? '本局结束'
                        : '进行中'}
                  </span>
                </div>
                <div className={styles.badges}>
                  <span>{game.connected ? '在线' : '离线'}</span>
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
                        {room.table.playerName} 出{' '}
                        {room.table.combo?.label || '牌'}
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
                {room.status === 'finished' ? (
                  room.roundResult ? (
                    <div className={styles.resultDetail}>
                      <p>
                        <strong>{room.roundResult.winnerName}</strong> 获胜，赢{' '}
                        {room.roundResult.winnerGain} 分
                        {room.roundResult.bombCount > 0 &&
                          `（${room.roundResult.bombCount} 个炸弹）`}
                      </p>
                      {room.roundResult.losers.map(loser => (
                        <p key={loser.seat}>
                          {loser.name}
                          {loser.sealed
                            ? '（封牌）扣 20 分'
                            : `剩 ${loser.cardsLeft} 张，扣 ${loser.loss} 分`}
                        </p>
                      ))}
                    </div>
                  ) : (
                    `${room.players.find(player => player.seat === room.winnerSeat)?.name} 获胜`
                  )
                ) : myTurn ? (
                  '轮到你出牌'
                ) : (
                  `等待 ${
                    room.players.find(
                      player => player.seat === room.currentSeat
                    )?.name || '玩家'
                  }`
                )}
              </div>
            </div>

            <aside className={styles.sidePanel}>
              <section className={styles.panel}>
                <h3>牌局</h3>
                {isOwner && room.status === 'lobby' && (
                  <button
                    className="btn btn-primary"
                    disabled={room.players.length < 2}
                    onClick={startRound}
                  >
                    <Play size={16} />
                    开始游戏
                  </button>
                )}
                {isOwner && room.status === 'finished' && (
                  <button className="btn btn-primary" onClick={restartRound}>
                    <RotateCcw size={16} />
                    再来一局
                  </button>
                )}
                {!isOwner && <p className={styles.status}>等待房主操作。</p>}
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
                    <strong>{player.score}</strong>
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
              <PlayerBadge
                player={me}
                active={myTurn}
                winner={room.winnerSeat === me?.seat}
              />
              <div className={styles.hand}>
                {me?.hand.map(card => (
                  <button
                    key={card.id}
                    className={classNames(
                      styles.cardButton,
                      selected.includes(card.id) && styles.picked
                    )}
                    onClick={() => toggleCard(card.id)}
                  >
                    <CardView card={card} />
                  </button>
                ))}
              </div>
              <div className={styles.actions}>
                <div
                  className={classNames(
                    styles.preview,
                    preview && styles.valid
                  )}
                >
                  <strong>
                    {preview
                      ? preview.label
                      : selected.length
                        ? '牌型不合法'
                        : '先选牌'}
                  </strong>
                  <span>
                    {selectedCards.map(card => card.label).join(' ') ||
                      '按选择顺序解释大小王'}
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!myTurn || selected.length === 0 || !preview}
                  onClick={playSelected}
                >
                  <Send size={16} />
                  出牌
                </button>
                <button
                  className="btn"
                  disabled={!myTurn || !room.table}
                  onClick={passTurn}
                >
                  不要
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  )
}

function PlayerBadge({
  player,
  active,
  winner,
  relation = '',
}: {
  player?: Player | null
  active: boolean
  winner: boolean
  relation?: string
}) {
  if (!player) return null
  return (
    <div
      className={classNames(
        styles.player,
        active && styles.active,
        winner && styles.winner
      )}
    >
      <div className={styles.avatar}>{player.name.slice(0, 1)}</div>
      <div>
        <strong>{player.name}</strong>
        <span>
          {relation}
          {relation ? ' · ' : ''}
          {player.handCount} 张
        </span>
      </div>
    </div>
  )
}

function CardView({ card, small = false }: { card: Card; small?: boolean }) {
  return (
    <div
      className={classNames(
        styles.card,
        styles[card.color],
        small && styles.small
      )}
    >
      <span>{card.label}</span>
      <i>{card.suit === 'Joker' ? '*' : card.label.slice(0, 1)}</i>
    </div>
  )
}

function positionLabel(
  me: Player | null | undefined,
  player: Player,
  total: number
) {
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
  return offset % 2 === 0
    ? `座位 ${player.seat + 1}/队友位`
    : `座位 ${player.seat + 1}/对手位`
}
