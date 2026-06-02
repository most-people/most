'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Bot,
  Copy,
  LogOut,
  Moon,
  Play,
  RotateCcw,
  Send,
  Share2,
  Sun,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import SidebarAccount from '~/components/SidebarAccount'
import { channelApi } from '~/lib/channelApi'
import { useChannelMessages } from '~/hooks/useChannelMessages'
import { getApiErrorMessage } from '~/server/src/utils/api'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import {
  RANKS,
  analyzeCards,
  applyGameEvent,
  makeGameChannelName,
  makeGameEvent,
  makeRoomId,
  normalizeRoomCode,
  reduceGameEvents,
} from '~/server/src/games/gandengyan.js'
import styles from './page.module.css'

const rankValue = new Map(RANKS.map((rank: string, index: number) => [rank, index + 3]))
const voiceBasePath = '/voices'
const voiceAssetVersion = '20260602-face-rank-remap'
const voiceExtensions = ['mp3', 'wav', 'ogg']
const gameMessageLimit = 2000

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
  leftScore?: number
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
  lastAction?: any
  table?: { seat: number; playerName: string; cards: Card[]; combo?: any } | null
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

function eventId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function GanDengYanPage() {
  const [activeRoomCode, setActiveRoomCode] = useState('')
  const [roomInput, setRoomInput] = useState('')
  const [channelName, setChannelName] = useState('')
  const [channelReady, setChannelReady] = useState(false)
  const [openingRoom, setOpeningRoom] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const lastAnnouncementRef = useRef('')
  const botMoveKeyRef = useRef('')
  const pendingAutoJoinRef = useRef('')
  const { isDarkMode, setIsDarkMode, hasBackend, addToast, openConnectModal } = useAppStore()
  const { identity, initializeUser, openLoginModal } = useUserStore()
  const isBackendReady = hasBackend === true

  const {
    messages,
    setMessages,
    connected,
    refreshMessages,
  } = useChannelMessages({
    enabled: isBackendReady && Boolean(identity && channelName && channelReady),
    channelName,
    author: identity?.address,
    authorName: identity?.displayName,
    limit: gameMessageLimit,
    refreshOnMessage: true,
  })

  useEffect(() => {
    initializeUser()
  }, [initializeUser])

  useEffect(() => {
    const saved = localStorage.getItem('gdy-voice') === '1'
    setVoiceOn(saved)
    const roomFromUrl = normalizeRoomCode(
      new URLSearchParams(window.location.search).get('room') || ''
    )
    if (roomFromUrl) {
      setRoomInput(roomFromUrl)
      pendingAutoJoinRef.current = roomFromUrl
    }
  }, [])

  useEffect(() => {
    if (
      !pendingAutoJoinRef.current ||
      !identity ||
      !isBackendReady ||
      channelReady ||
      openingRoom
    ) {
      return
    }
    const roomCode = pendingAutoJoinRef.current
    pendingAutoJoinRef.current = ''
    void openRoom(roomCode, 'join')
  }, [identity, isBackendReady, channelReady, openingRoom])

  const reduced = useMemo(
    () => reduceGameEvents(messages, identity?.address, activeRoomCode),
    [messages, identity?.address, activeRoomCode]
  )
  const privateRoom = reduced.room
  const room = reduced.publicRoom as Room | null
  const me = useMemo(
    () => room?.players.find(player => player.id === identity?.address) || null,
    [room, identity?.address]
  )
  const currentTurnPlayer = useMemo(
    () => room?.players.find(player => player.seat === room.currentSeat) || null,
    [room]
  )
  const participantNames = useMemo(
    () => room?.players.filter(player => !player.bot).map(player => player.name).join('、') || '',
    [room]
  )
  const isSpectating = Boolean(room && identity?.address && !me)
  const isOwner = Boolean(room && identity?.address && room.ownerId === identity.address)
  const myTurn = room?.status === 'playing' && room.currentSeat === me?.seat
  const selectedCards = useMemo(
    () => selected.map(id => me?.hand.find(card => card.id === id)).filter(Boolean) as Card[],
    [selected, me]
  )
  const preview = useMemo(() => analyzeCards(selectedCards), [selectedCards])
  const shareLink =
    activeRoomCode && typeof window !== 'undefined'
      ? `${window.location.origin}/game?room=${activeRoomCode}`
      : ''
  const lowDeck = Boolean(room && room.status === 'playing' && room.deckCount < 3)
  const voiceCue = useMemo(() => makeVoiceCue(room, me), [room?.lastAction, room?.winnerSeat, room?.status, me?.seat])

  useEffect(() => {
    setSelected(value => keepHeldCards(value, room, identity?.address))
  }, [room, identity?.address])

  useEffect(() => {
    if (!voiceOn || !voiceCue || voiceCue.key === lastAnnouncementRef.current) return
    lastAnnouncementRef.current = voiceCue.key
    void speakCue(voiceCue)
  }, [voiceCue, voiceOn])

  useEffect(() => {
    if (!identity?.address || !privateRoom || privateRoom.status !== 'playing') return
    const currentUser = privateRoom.players.find(player => player.id === identity.address && !player.bot)
    if (!currentUser) return
    const currentPlayer = privateRoom.players.find(player => player.seat === privateRoom.currentSeat)
    if (!currentPlayer?.bot) return
    const afterActionId = String(privateRoom.lastAction?.id || '')
    const key = `${privateRoom.id}-${privateRoom.currentSeat}-${afterActionId}`
    if (botMoveKeyRef.current === key) return
    const timer = setTimeout(() => {
      botMoveKeyRef.current = key
      void sendGameEvent(
        'bot',
        { seat: currentPlayer.seat, afterActionId },
        { validate: false }
      )
    }, 700)
    return () => clearTimeout(timer)
  }, [identity?.address, privateRoom])

  function requireReady() {
    if (!identity) {
      openLoginModal()
      return false
    }
    if (!isBackendReady) {
      openConnectModal()
      return false
    }
    return true
  }

  async function openRoom(roomCode: string, mode: 'create' | 'join') {
    if (!requireReady() || openingRoom) return
    const normalized = normalizeRoomCode(roomCode)
    const nextChannelName = makeGameChannelName(normalized)
    if (!normalized || !nextChannelName || !identity) {
      setError('房间号不正确')
      return
    }

    setOpeningRoom(true)
    setError('')
    try {
      await channelApi.createChannel(nextChannelName, 'game')
      setActiveRoomCode(normalized)
      setRoomInput(normalized)
      setChannelName(nextChannelName)
      setChannelReady(true)
      setRoomUrl(normalized)
      await appendGameEvent(nextChannelName, normalized, mode, {
        name: identity.displayName,
        address: identity.address,
      })
      const nextMessages = await channelApi.getChannelMessages(nextChannelName, gameMessageLimit)
      setMessages(nextMessages)
    } catch (err) {
      setError(await getApiErrorMessage(err, '进入房间失败'))
    } finally {
      setOpeningRoom(false)
    }
  }

  async function appendGameEvent(
    targetChannelName: string,
    targetRoomCode: string,
    event: string,
    payload: Record<string, unknown> = {}
  ) {
    if (!identity) throw new Error('请先登录')
    const content = JSON.stringify(
      makeGameEvent({
        roomCode: targetRoomCode,
        event,
        payload,
        eventId: eventId(),
      })
    )
    await channelApi.sendChannelMessage(
      targetChannelName,
      content,
      identity.address,
      identity.displayName || identity.username
    )
  }

  async function sendGameEvent(
    event: string,
    payload: Record<string, unknown> = {},
    options: { validate?: boolean } = {}
  ) {
    if (!requireReady() || !channelName || !activeRoomCode || !identity) return
    try {
      if (options.validate !== false && privateRoom) {
        const draft = JSON.parse(JSON.stringify(privateRoom))
        applyGameEvent(draft, {
          event,
          payload,
          roomCode: activeRoomCode,
          actorId: identity.address,
          actorName: identity.displayName,
        })
      }
      setError('')
      await appendGameEvent(channelName, activeRoomCode, event, payload)
      await refreshMessages()
    } catch (err) {
      setError(await getApiErrorMessage(err, '操作失败'))
    }
  }

  function createRoomSubmit() {
    void openRoom(makeRoomId(), 'create')
  }

  function closeRoomView() {
    pendingAutoJoinRef.current = ''
    botMoveKeyRef.current = ''
    lastAnnouncementRef.current = ''
    setActiveRoomCode('')
    setRoomInput('')
    setChannelName('')
    setChannelReady(false)
    setMessages([])
    setSelected([])
    setError('')
    setRoomUrl('')
  }

  async function leaveGame() {
    const currentPlayer = room?.players.find(player => player.id === identity?.address && !player.bot)
    if (!activeRoomCode || !channelName || !identity || !currentPlayer) {
      closeRoomView()
      return
    }
    try {
      setError('')
      await appendGameEvent(channelName, activeRoomCode, 'leave')
      addToast('已离开游戏', 'success')
      closeRoomView()
    } catch (err) {
      setError(await getApiErrorMessage(err, '离开游戏失败'))
    }
  }

  function joinRoomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void openRoom(roomInput, 'join')
  }

  function changeSettings(key: string, value: number) {
    if (!room) return
    void sendGameEvent('settings', { settings: { ...room.settings, [key]: value } })
  }

  function toggleCard(cardId: string) {
    setSelected(value =>
      value.includes(cardId)
        ? value.filter(id => id !== cardId)
        : [...value, cardId]
    )
  }

  async function copyShareLink() {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    addToast('房间链接已复制', 'success')
    setTimeout(() => setCopied(false), 1400)
  }

  function toggleVoice() {
    const next = !voiceOn
    setVoiceOn(next)
    localStorage.setItem('gdy-voice', next ? '1' : '0')
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
        <Link href="/game/" className="sidebar-nav-btn active" onClick={closeSidebar}>
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
          {activeRoomCode && (
            <button className="btn btn-sm" onClick={copyShareLink}>
              <Copy size={14} />
              {copied ? '已复制' : '分享房间'}
            </button>
          )}
          {activeRoomCode && (
            <button className="btn btn-sm btn-danger" onClick={leaveGame}>
              <LogOut size={14} />
              离开游戏
            </button>
          )}
          <button className="btn btn-icon" onClick={toggleVoice} title="语音开关">
            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
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
                  使用 MostBox 频道进入房间，牌桌事件写入 game 频道消息。
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
                disabled={openingRoom}
                onClick={createRoomSubmit}
              >
                <Play size={16} />
                创建房间
              </button>
              <form onSubmit={joinRoomSubmit} className={styles.joinForm}>
                <label>
                  房间号
                  <input
                    value={roomInput}
                    maxLength={8}
                    onChange={event => setRoomInput(normalizeRoomCode(event.target.value))}
                    placeholder="输入房间号"
                  />
                </label>
                <button className="btn" disabled={openingRoom || !roomInput}>
                  加入房间
                </button>
              </form>
              <p className={styles.status}>
                {openingRoom
                  ? '正在进入房间...'
                  : connected || channelReady
                    ? '频道已连接'
                    : isBackendReady
                      ? '等待进入房间'
                      : '请先连接 MostBox 后端'}
              </p>
              {activeRoomCode && messages.length === 0 && (
                <p className={styles.status}>等待房主在线同步房间 {activeRoomCode}...</p>
              )}
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
                  <span>{connected ? '频道在线' : '等待同步'}</span>
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
                    showHandCount={room.status !== 'playing' || player.id === identity?.address || player.handCount <= 3}
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
                {isSpectating
                  ? '当前账号不在本局，正在旁观'
                  : room.status === 'finished'
                    ? `${room.players.find(player => player.seat === room.winnerSeat)?.name} 获胜`
                    : myTurn
                      ? '轮到你出牌'
                      : `等待 ${currentTurnPlayer?.name || '玩家'}`}
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
                  <button className="btn btn-primary" onClick={() => sendGameEvent('start', { seed: eventId() })}>
                    <Play size={16} />
                    开始游戏
                  </button>
                )}
                {isOwner && room.status === 'finished' && (
                  <button className="btn btn-primary" onClick={() => sendGameEvent('restart', { seed: eventId() })}>
                    <RotateCcw size={16} />
                    再来一局
                  </button>
                )}
              </section>

              <section className={styles.panel}>
                <div className={styles.panelTitleRow}>
                  <h3>分数</h3>
                  {isOwner && (
                    <button className="btn btn-sm" onClick={() => sendGameEvent('resetScores')}>
                      <RotateCcw size={14} />
                      重置分数
                    </button>
                  )}
                </div>
                <div className={styles.scoreMeta}>
                  <span>炸弹 {room.bombCount} 次</span>
                  <span>弃牌 {room.discardCount} 张</span>
                </div>
                {room.diceRolls?.length > 0 && (
                  <p className={styles.status}>
                    骰子 {room.diceRolls.map(roll => `${roll.name} ${roll.value}`).join(' / ')}
                  </p>
                )}
                {room.players.map(player => (
                  <div key={player.seat} className={styles.scoreRow}>
                    <span>
                      {player.name}
                      {!player.connected && !player.bot && (
                        <em>离开时 {player.leftScore ?? player.score}</em>
                      )}
                    </span>
                    <strong>{player.score}</strong>
                  </div>
                ))}
                {room.roundResult && (
                  <div className={styles.resultBox}>
                    <strong>{room.roundResult.winnerName} +{room.roundResult.winnerGain}</strong>
                    {room.roundResult.losers.map(loser => (
                      <span key={loser.seat}>
                        {loser.name} -{loser.loss}{loser.sealed ? ' 封门' : ` ${loser.cardsLeft}张`}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            </aside>

            <div className={styles.handPanel}>
              {me ? (
                <PlayerBadge player={me} active={myTurn} winner={room.winnerSeat === me?.seat} showHandCount />
              ) : (
                <div className={styles.spectatorNotice}>
                  <strong>当前账号不在本局</strong>
                  <span>
                    当前账号 {identity?.displayName || '未登录'}，本局玩家 {participantNames || '暂无真人玩家'}。
                  </span>
                </div>
              )}
              <div className={styles.hand}>
                {me ? (
                  me.hand.map(card => (
                    <button
                      key={card.id}
                      className={classNames(styles.cardButton, selected.includes(card.id) && styles.picked)}
                      onClick={() => toggleCard(card.id)}
                    >
                      <CardView card={card} />
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyHand}>
                    <span>请切回本局玩家账号，或新开一局。</span>
                  </div>
                )}
              </div>
              <div className={styles.actions}>
                <div className={classNames(styles.preview, preview && styles.valid)}>
                  <strong>{me ? (preview ? preview.label : selected.length ? '牌型不合法' : '先选牌') : '旁观中'}</strong>
                  <span>{me ? selectedCards.map(card => card.label).join(' ') || '自动识别牌型' : '当前账号没有本局手牌'}</span>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!me || !myTurn || selected.length === 0 || !preview}
                  onClick={() => sendGameEvent('play', { cardIds: selected })}
                >
                  <Send size={16} />
                  出牌
                </button>
                <button className="btn" disabled={!me || !myTurn || !room.table} onClick={() => sendGameEvent('pass')}>
                  不要
                </button>
                {!me && (
                  <button className="btn" disabled={openingRoom} onClick={createRoomSubmit}>
                    新开一局
                  </button>
                )}
                {error && <span className={styles.error}>{error}</span>}
              </div>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  )
}

function PlayerBadge({ player, active, winner, relation = '', showHandCount = false }) {
  if (!player) return null
  const handText = showHandCount ? `${player.handCount} 张` : '手牌较多'
  return (
    <div className={classNames(styles.player, active && styles.active, winner && styles.winner)}>
      <div className={styles.avatar}>{player.bot ? 'AI' : player.name.slice(0, 1)}</div>
      <div>
        <strong>{player.name}</strong>
        <span>
          {relation}
          {relation ? ' · ' : ''}
          {handText}
          {player.connected ? '' : ' · 掉线'}
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

function setRoomUrl(id: string) {
  if (typeof window === 'undefined') return
  const nextUrl = id ? `/game?room=${id}` : '/game'
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

function makeVoiceCue(room: Room | null, me: Player | null) {
  if (!room) return null
  if (room.status === 'finished' && room.winnerSeat !== null) {
    const won = room.winnerSeat === me?.seat
    return {
      key: `result-${room.winnerSeat}-${room.roundResult?.winnerGain ?? ''}`,
      text: won ? '你真棒' : '我输了呜呜呜',
      voiceKeys: [won ? 'win' : 'lose'],
    }
  }
  if (room.lastAction?.type === 'start') {
    const playerText = room.lastAction.seat === me?.seat ? '你' : room.lastAction.playerName
    return {
      key: room.lastAction.id,
      text: `${playerText}先出牌`,
      voiceKeys: ['start'],
    }
  }
  if (room.lastAction?.type === 'pass') {
    const playerText = room.lastAction.seat === me?.seat ? '你' : room.lastAction.playerName
    return {
      key: room.lastAction.id,
      text: `${playerText}不要`,
      voiceKeys: ['pass', 'buyao', 'yaobuqi'],
    }
  }
  const actionCombo = room.lastAction?.type === 'play' ? room.lastAction.combo : null
  const actionCards = room.lastAction?.type === 'play' ? room.lastAction.cards : null
  const actionSeat = room.lastAction?.type === 'play' ? room.lastAction.seat : null
  const actionPlayerName = room.lastAction?.type === 'play' ? room.lastAction.playerName : null
  if (!room.table?.combo) return null
  const combo = actionCombo || room.table.combo
  const cards = actionCards || room.table.cards
  const seat = actionSeat ?? room.table.seat
  const playerName = actionPlayerName || room.table.playerName
  const playerText = seat === me?.seat ? '你' : playerName
  return {
    key: room.lastAction?.type === 'play' ? room.lastAction.id : `play-${seat}-${cards.map((card: Card) => card.id).join('-')}`,
    text: `${playerText}出${comboSpeechText(combo)}`,
    voiceKeys: comboVoiceKeys(combo),
  }
}

function comboSpeechText(combo) {
  const valuesText = compactValues(combo.resolvedValues || [])
  if (combo.type === 'single') return valuesText
  if (combo.type === 'pair') return `对${valueLabel(combo.value)}`
  if (combo.type === 'straight') return `${valuesText}顺子`
  if (combo.type === 'pairStraight') return `${valuesText}连对`
  if (combo.type === 'bomb') return valuesText ? `${valuesText}炸弹` : '炸弹'
  return combo.label || '牌'
}

function compactValues(values: number[]) {
  return values.map(valueLabel).join('')
}

function comboVoiceKeys(combo) {
  const value = rankVoiceKey(combo.value)
  const localValue = localRankVoiceKey(value)
  if (combo.type === 'single') return localValue ? [`single-${localValue}`] : []
  if (combo.type === 'pair') return localValue ? [`pair-${localValue}`, `dui-${localValue}`, 'pair'] : ['pair']
  if (combo.type === 'straight') return [`straight-${valuesVoiceKey(combo.resolvedValues)}`, 'straight', 'shunzi'].filter(Boolean)
  if (combo.type === 'pairStraight') return [`pair-straight-${valuesVoiceKey(combo.resolvedValues)}`, 'pair-straight', 'liandui'].filter(Boolean)
  if (combo.type === 'bomb') return [`bomb-${value}`, `zha-${value}`, 'bomb', 'zha'].filter(Boolean)
  return []
}

function localRankVoiceKey(value: string) {
  const faceRankVoiceMap: Record<string, string> = {
    j: 'q',
    q: 'k',
    k: 'a',
    a: 'j',
  }
  return faceRankVoiceMap[value] || value
}

function valuesVoiceKey(values = []) {
  return values.map(rankVoiceKey).filter(Boolean).join('-')
}

function rankVoiceKey(value: number) {
  if (value === 16) return 'small-joker'
  if (value === 17) return 'big-joker'
  const rank = RANKS.find((item: string) => rankValue.get(item) === value)
  return rank?.toLowerCase() || ''
}

function valueLabel(value: number | undefined) {
  if (value === 16) return '小王'
  if (value === 17) return '大王'
  return RANKS.find((rank: string) => rankValue.get(rank) === value) || String(value)
}

async function speakCue(cue) {
  if (await playVoiceCue(cue.voiceKeys || [])) return
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(makeUtterance(cue.text))
}

async function playVoiceCue(keys: string[]) {
  for (const key of keys) {
    for (const extension of voiceExtensions) {
      if (await playAudio(`${voiceBasePath}/${key}.${extension}?v=${voiceAssetVersion}`)) return true
    }
  }
  return false
}

function playAudio(src: string) {
  return new Promise(resolve => {
    const audio = new Audio(src)
    audio.preload = 'auto'
    audio.onended = () => resolve(true)
    audio.onerror = () => resolve(false)
    audio.play().catch(() => resolve(false))
  })
}

function makeUtterance(text: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.05
  return utterance
}

function keepHeldCards(selectedIds: string[], room: Room | null, playerId?: string) {
  const handIds = new Set(
    room?.players.find(player => player.id === playerId)?.hand.map(card => card.id) || []
  )
  return selectedIds.filter(id => handIds.has(id))
}
