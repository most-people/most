import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Moon, Play, RotateCcw, Send, Sun } from 'lucide-react'
import AppShell from '~/components/AppShell'
import GameSidebar from '~/components/GameSidebar'
import { useGameRoom } from '~/hooks/useGameRoom'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useI18n, type Locale, type MessageKey } from '~/lib/i18n'
import {
  analyzeCards,
  createGanDengYanRoom,
  passGanDengYanTurn,
  playGanDengYanCards,
  removeGanDengYanPlayer,
  startGanDengYanRound,
  syncGanDengYanLobby,
} from '~server/src/games/gandengyan.js'
import {
  deriveGameRoomLobby,
  getLatestGameState,
} from '~server/src/core/gameRoom.js'
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

function speak(text: string, locale: Locale) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text)
    return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = locale
  utterance.rate = 1.1
  window.speechSynthesis.speak(utterance)
}

export default function GanDengYanPage() {
  const { t, locale } = useI18n()
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
      if (ok) addToast(t('game.toast.joinedRoom'), 'success')
    })
  }, [game.isBackendReady, game.userIdentity, game.joinRoom, addToast, t])

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
        speak(t('game.gandengyan.speech.gameOver'), locale)
      }
      return
    }

  }, [locale, room?.seq, t])

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
      const name = item.event?.payload?.player?.name || t('game.player')
      addToast(t('game.toast.playerLeft', { player: name }), 'info')
    }
  }, [leaveEvents, addToast, t])

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
    if (ok) addToast(t('game.toast.roomCreated'), 'success')
  }

  async function joinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ok = await game.joinRoom(roomInput)
    if (ok) addToast(t('game.toast.joinedRoom'), 'success')
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
      addToast(
        err instanceof Error ? err.message : t('game.zhajinhua.error.startFailed'),
        'error'
      )
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
      addToast(result.error || t('game.gandengyan.error.playFailed'), 'error')
      return
    }
    await publishState(result.state)
  }

  async function passTurn() {
    if (!room || !game.userIdentity) return
    const result = passGanDengYanTurn(room, game.userIdentity.address)
    if (!result.ok) {
      addToast(result.error || t('game.gandengyan.error.actionFailed'), 'error')
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
      headerTitle={<h2 className="header-title">{t('game.gandengyan.title')}</h2>}
      headerRight={
        <div className={styles.headerActions}>
          {room && (
            <button className="btn btn-sm" onClick={copyShareLink}>
              <Copy size={14} />
              {copied ? t('common.copied') : t('game.action.shareRoom')}
            </button>
          )}
          <button
            className="btn btn-icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={t('common.theme.toggle')}
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
              <div className={styles.cardMark}>{t('game.gandengyan.mark')}</div>
              <div>
                <h1>{t('game.gandengyan.hero.title')}</h1>
                <p>
                  {t('game.hero.desc')}
                </p>
              </div>
            </div>

            <div className={styles.entryPanel}>
              <div className={styles.accountLine}>
                <span>{t('game.currentAccount')}</span>
                <strong translate="no">
                  {game.userIdentity?.displayName || t('web3.notSignedIn')}
                </strong>
              </div>
              <button
                className="btn btn-primary"
                disabled={game.joining}
                onClick={createRoom}
              >
                <Play size={16} />
                {t('game.action.createRoom')}
              </button>
              <form onSubmit={joinRoom} className={styles.joinForm}>
                <label>
                  {t('game.roomCode')}
                  <input
                    value={roomInput}
                    maxLength={8}
                    onChange={event =>
                      setRoomInput(event.target.value.toUpperCase())
                    }
                    placeholder={t('game.roomCode.placeholder')}
                  />
                </label>
                <button className="btn" disabled={game.joining || !roomInput}>
                  {t('game.action.joinRoom')}
                </button>
              </form>
              <p className={styles.status}>
                {game.isBackendReady
                  ? t('game.status.nodeConnected')
                  : t('game.status.nodeConnecting')}
              </p>
            </div>
          </section>
        ) : (
          <section className={styles.gameGrid}>
            <div className={styles.tablePanel}>
              <div className={styles.roomBar}>
                <div>
                  <strong translate="no">
                    {t('game.roomLabel', { room: room.id })}
                  </strong>
                  <span>
                    {room.status === 'lobby'
                      ? t('game.status.waitingStart')
                      : room.status === 'finished'
                        ? t('game.status.finished')
                        : t('game.status.playing')}
                  </span>
                </div>
                <div className={styles.badges}>
                  <span>
                    {game.connected
                      ? t('game.status.online')
                      : t('game.status.offline')}
                  </span>
                </div>
              </div>

              <div className={styles.seats}>
                {room.players.map(player => (
                  <PlayerBadge
                    key={player.seat}
                    player={player}
                    active={room.currentSeat === player.seat}
                    winner={room.winnerSeat === player.seat}
                    relation={positionLabel(me, player, room.players.length, t)}
                  />
                ))}
              </div>

              <div className={styles.centerTable}>
                <div className={styles.deckBox}>
                  <span>{t('game.gandengyan.deck')}</span>
                  <strong>{room.deckCount}</strong>
                </div>
                <div className={styles.playedBox}>
                  {room.table ? (
                    <>
                      <strong>
                        {t('game.gandengyan.tablePlay', {
                          player: room.table.playerName,
                          combo: room.table.combo?.label || t('game.card'),
                        })}
                      </strong>
                      <div className={styles.playedCards}>
                        {room.table.cards.map(card => (
                          <CardView key={card.id} card={card} small />
                        ))}
                      </div>
                    </>
                  ) : (
                    <span>{t('game.gandengyan.waitingLead')}</span>
                  )}
                </div>
                <div className={styles.deckBox}>
                  <span>{t('game.gandengyan.baseScore')}</span>
                  <strong>{room.baseScore}</strong>
                </div>
              </div>

              <div className={styles.notice}>
                {room.status === 'finished' ? (
                  room.roundResult ? (
                    <div className={styles.resultDetail}>
                      <p>
                        {t('game.gandengyan.result.winnerGain', {
                          player: room.roundResult.winnerName,
                          score: room.roundResult.winnerGain,
                        })}
                        {room.roundResult.bombCount > 0 &&
                          t('game.gandengyan.result.bombCount', {
                            count: room.roundResult.bombCount,
                          })}
                      </p>
                      {room.roundResult.losers.map(loser => (
                        <p key={loser.seat}>
                          {loser.sealed
                            ? t('game.gandengyan.result.sealedLoss', {
                                player: loser.name,
                                loss: 20,
                              })
                            : t('game.gandengyan.result.cardsLeftLoss', {
                                player: loser.name,
                                cards: loser.cardsLeft,
                                loss: loser.loss,
                              })}
                        </p>
                      ))}
                    </div>
                  ) : (
                    t('game.gandengyan.result.winner', {
                      player:
                        room.players.find(
                          player => player.seat === room.winnerSeat
                        )?.name || t('game.player'),
                    })
                  )
                ) : myTurn ? (
                  t('game.gandengyan.status.yourTurn')
                ) : (
                  t('game.zhajinhua.status.waitingPlayer', {
                    player:
                      room.players.find(
                        player => player.seat === room.currentSeat
                      )?.name || t('game.player'),
                  })
                )}
              </div>
            </div>

            <aside className={styles.sidePanel}>
              <section className={styles.panel}>
                <h3>{t('game.gandengyan.roundPanel')}</h3>
                {isOwner && room.status === 'lobby' && (
                  <button
                    className="btn btn-primary"
                    disabled={room.players.length < 2}
                    onClick={startRound}
                  >
                    <Play size={16} />
                    {t('game.action.startRound')}
                  </button>
                )}
                {isOwner && room.status === 'finished' && (
                  <button className="btn btn-primary" onClick={restartRound}>
                    <RotateCcw size={16} />
                    {t('game.action.nextRound')}
                  </button>
                )}
                {!isOwner && (
                  <p className={styles.status}>{t('game.waitingHost')}</p>
                )}
              </section>

              <section className={styles.panel}>
                <h3>{t('game.gandengyan.score')}</h3>
                <div className={styles.scoreMeta}>
                  <span>
                    {t('game.gandengyan.bombCount', {
                      count: room.bombCount,
                    })}
                  </span>
                  <span>
                    {t('game.gandengyan.discardCount', {
                      count: room.discardCount,
                    })}
                  </span>
                </div>
                {room.players.map(player => (
                  <div key={player.seat} className={styles.scoreRow}>
                    <span translate="no">{player.name}</span>
                    <strong>{player.score}</strong>
                  </div>
                ))}
              </section>

              <section className={classNames(styles.panel, styles.logPanel)}>
                <h3>{t('game.gandengyan.log')}</h3>
                {room.log.map((item, index) => (
                  <p key={`${item}-${index}`} translate="no">
                    {item}
                  </p>
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
                        ? t('game.gandengyan.invalidCombo')
                        : t('game.gandengyan.selectCards')}
                  </strong>
                  <span>
                    {selectedCards.map(card => card.label).join(' ') ||
                      t('game.gandengyan.jokerOrderHint')}
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!myTurn || selected.length === 0 || !preview}
                  onClick={playSelected}
                >
                  <Send size={16} />
                  {t('game.gandengyan.action.play')}
                </button>
                <button
                  className="btn"
                  disabled={!myTurn || !room.table}
                  onClick={passTurn}
                >
                  {t('game.gandengyan.action.pass')}
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
  const { t } = useI18n()
  if (!player) return null
  return (
    <div
      className={classNames(
        styles.player,
        active && styles.active,
        winner && styles.winner
      )}
    >
      <div className={styles.avatar} translate="no">
        {player.name.slice(0, 1)}
      </div>
      <div>
        <strong translate="no">{player.name}</strong>
        <span>
          {relation}
          {relation ? ' · ' : ''}
          {t('game.gandengyan.handCount', { count: player.handCount })}
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
  total: number,
  t: (key: MessageKey, params?: Record<string, string | number>) => string
) {
  if (!me) return t('game.gandengyan.position.seat', { seat: player.seat + 1 })
  const offset = (player.seat - me.seat + total) % total
  if (offset === 0) return t('game.gandengyan.position.me')
  if (total === 2) return t('game.gandengyan.position.opponent')
  if (total === 3) {
    return offset === 1
      ? t('game.gandengyan.position.nextOpponent')
      : t('game.gandengyan.position.prevOpponent')
  }
  if (total === 4) {
    if (offset === 1) return t('game.gandengyan.position.nextOpponent')
    if (offset === 2) return t('game.gandengyan.position.partner')
    return t('game.gandengyan.position.prevOpponent')
  }
  return offset % 2 === 0
    ? t('game.gandengyan.position.seatPartner', { seat: player.seat + 1 })
    : t('game.gandengyan.position.seatOpponent', { seat: player.seat + 1 })
}
