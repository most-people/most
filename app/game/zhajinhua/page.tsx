'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Eye, Moon, Play, RefreshCcw, Spade, Sun } from 'lucide-react'
import AppShell from '~/components/AppShell'
import GameSidebar from '~/components/GameSidebar'
import { useGameRoom } from '~/hooks/useGameRoom'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore, type UserIdentity } from '~/app/app/userStore'
import {
  ZHJ_INITIAL_CHIPS,
  ZHJ_RAISE_STEPS,
  applyPlayerAction,
  canStartRound,
  createPlayerActionEvent,
  getActiveRoundPlayers,
  getAllowedActions,
  getHandLabel,
  getPublicRoundState,
  hydrateRoundWithHands,
  startRound,
} from '~/server/src/core/zhajinhua.js'
import {
  deriveGameRoomLobby,
  getLatestGameState,
} from '~/server/src/core/gameRoom.js'
import {
  most25519,
  mostBoxDecrypt,
  mostBoxEncrypt,
} from '~/server/src/utils/mostWallet.js'
import styles from './page.module.css'

const GAME_ID = 'zhajinhua'

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

function sameAddress(left?: string, right?: string) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

function shortAddress(address = '') {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
}

function displayName(identity: UserIdentity) {
  return identity.displayName || identity.username
}

function cardParts(card: string) {
  const value = String(card || '')
  const suit = value.slice(-1)
  const rank = value.slice(0, -1)
  const suitSymbol = { S: '♠', H: '♥', C: '♣', D: '♦' }[suit] || suit
  const color = suit === 'H' || suit === 'D' ? 'red' : 'black'
  return { rank, suit: suitSymbol, color }
}

export default function ZhajinhuaPage() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const initializeUser = useUserStore(s => s.initializeUser)
  const [roomInput, setRoomInput] = useState('')
  const [copied, setCopied] = useState(false)
  const pendingAutoJoin = useRef('')
  const autoJoinAttempted = useRef(false)
  const [raiseAmount, setRaiseAmount] = useState(20)
  const [compareTarget, setCompareTarget] = useState('')
  const [privateHands, setPrivateHands] = useState<Record<string, string[]>>({})
  const [showFinishBanner, setShowFinishBanner] = useState(true)
  const [showCompareOverlay, setShowCompareOverlay] = useState(false)
  const hostHandsRef = useRef<Record<string, string[]> | null>(null)
  const processedActionIdsRef = useRef(new Set<string>())

  const game = useGameRoom({
    gameId: GAME_ID,
    onError: message => addToast(message, 'error'),
    getPlayerPayload: identity => {
      const keys = most25519(identity.danger)
      return {
        address: identity.address,
        name: displayName(identity),
        publicKey: keys.public_key,
        joinedAt: Date.now(),
      }
    },
  })

  const myKeys = useMemo(() => {
    if (!game.userIdentity?.danger) return null
    return most25519(game.userIdentity.danger)
  }, [game.userIdentity?.danger])

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
    const nextUrl = `/game/zhajinhua?room=${game.roomCode}`
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [game.roomCode])

  const lobby = useMemo(
    () =>
      deriveGameRoomLobby(game.messages, {
        gameId: GAME_ID,
        roomCode: game.roomCode,
      }),
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
  const currentRound = latestStateEvent?.payload?.round || null
  const hostAddress = currentRound?.host || lobby.hostAddress
  const isHost = sameAddress(hostAddress, game.userIdentity?.address)
  const myAddress = game.userIdentity?.address?.toLowerCase() || ''
  const myRoundPlayer = currentRound?.players.find(player =>
    sameAddress(player.address, myAddress)
  )
  const myPlayer =
    myRoundPlayer ||
    lobby.players.find(player => sameAddress(player.address, myAddress))
  const myDealtHand = privateHands[currentRound?.roundId || ''] || null
  const myShowdownHand =
    currentRound?.showdown && myAddress
      ? currentRound.showdown[myAddress]
      : null
  const myCompareRevealHand =
    currentRound?.compareReveal && myAddress
      ? currentRound.compareReveal[myAddress]
      : null
  const myHand = myShowdownHand || myCompareRevealHand || (myRoundPlayer?.looked ? myDealtHand : null)
  const allowedActions = getAllowedActions(currentRound, myAddress)
  const activePlayers = getActiveRoundPlayers(currentRound)
  const canHostStart =
    isHost &&
    canStartRound(
      lobby.players.map(player => ({
        ...player,
        chips:
          currentRound?.players.find(item =>
            sameAddress(item.address, player.address)
          )?.chips ?? ZHJ_INITIAL_CHIPS,
      }))
    )
  const shareLink =
    game.roomCode && typeof window !== 'undefined'
      ? `${window.location.origin}/game/zhajinhua?room=${game.roomCode}`
      : ''

  useEffect(() => {
    if (!currentRound || !game.userIdentity || !myKeys || !hostAddress) return
    for (const item of game.roomEvents) {
      const event = item.event
      if (!event || event.event !== 'deal:private') continue
      const payload = event.payload as {
        roundId?: string
        recipient?: string
        encrypted?: string
        senderPublicKey?: string
      }
      if (payload.roundId !== currentRound.roundId) continue
      if (!sameAddress(payload.recipient, game.userIdentity.address)) continue
      const decrypted = mostBoxDecrypt(payload.encrypted || '', {
        senderPublicKey: payload.senderPublicKey || '',
        recipientPrivateKey: myKeys.private_key,
      })
      if (!decrypted) continue
      try {
        const cards = JSON.parse(decrypted)
        if (Array.isArray(cards)) {
          setPrivateHands(prev => ({
            ...prev,
            [currentRound.roundId]: cards.map(String),
          }))
        }
      } catch {}
    }
  }, [
    currentRound?.roundId,
    game.roomEvents,
    game.userIdentity,
    hostAddress,
    myKeys?.private_key,
  ])

  useEffect(() => {
    if (currentRound?.status === 'finished' && currentRound.winner) {
      setShowFinishBanner(true)
      const timer = setTimeout(() => setShowFinishBanner(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [currentRound?.finishedAt, currentRound?.status, currentRound?.winner])

  useEffect(() => {
    const ts = currentRound?.lastCompare?.timestamp
    if (ts) {
      setShowCompareOverlay(true)
      const timer = setTimeout(() => setShowCompareOverlay(false), 5000)
      return () => clearTimeout(timer)
    } else {
      setShowCompareOverlay(false)
    }
  }, [currentRound?.lastCompare?.timestamp, currentRound?.roundId])

  useEffect(() => {
    if (!isHost || !currentRound || currentRound.status !== 'playing') return
    const hands = hostHandsRef.current
    if (!hands) return
    const pending = game.roomEvents.filter(item => {
      const event = item.event
      if (!event || event.event !== 'player:action') return false
      const payload = event.payload as { actionEvent?: any }
      const actionEvent = payload.actionEvent
      if (!actionEvent || actionEvent.roundId !== currentRound.roundId)
        return false
      if (processedActionIdsRef.current.has(actionEvent.eventId)) return false
      if (currentRound.appliedEventIds?.includes(actionEvent.eventId))
        return false
      return true
    })
    if (pending.length === 0) return

    let cancelled = false
    async function applyPendingActions() {
      let fullRound = hydrateRoundWithHands(currentRound, hands)
      if (!fullRound) return
      for (const item of pending) {
        if (cancelled) return
        const payload = item.event?.payload as { actionEvent?: any }
        const actionEvent = payload.actionEvent
        let result = applyPlayerAction(
          fullRound,
          actionEvent,
          item.message.author
        )
        if (!result.ok) {
          const authorAddr = item.message.author
          const isBot = !sameAddress(authorAddr, game.userIdentity?.address)
          if (isBot && fullRound.status === 'playing' && sameAddress(fullRound.turnAddress, authorAddr)) {
            const fallbackCall = applyPlayerAction(
              fullRound,
              createPlayerActionEvent({ roundId: fullRound.roundId, action: 'call' }),
              authorAddr
            )
            if (fallbackCall.ok) {
              result = fallbackCall
            } else {
              const fallbackFold = applyPlayerAction(
                fullRound,
                createPlayerActionEvent({ roundId: fullRound.roundId, action: 'fold' }),
                authorAddr
              )
              if (fallbackFold.ok) result = fallbackFold
            }
          }
          if (!result.ok) {
            processedActionIdsRef.current.add(actionEvent.eventId)
            continue
          }
        }
        fullRound = result.state
        hostHandsRef.current = result.state.hands
        const ok = await publishRound(result.state)
        if (ok) processedActionIdsRef.current.add(actionEvent.eventId)
        if (result.state.status === 'finished') break
      }
    }

    void applyPendingActions()
    return () => {
      cancelled = true
    }
  }, [
    currentRound?.roundId,
    currentRound?.seq,
    currentRound?.status,
    game.roomEvents,
    isHost,
  ])

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

  async function publishRound(round: any) {
    return game.sendRoomEvent('room:state', {
      round: getPublicRoundState(round),
      seq: round.seq,
    })
  }

  async function hostStartRound() {
    if (!game.userIdentity || !myKeys || !canHostStart) {
      addToast('至少需要 2 名有足够筹码的玩家', 'error')
      return
    }
    try {
      const players = lobby.players.map(player => ({
        ...player,
        chips:
          currentRound?.players.find(item =>
            sameAddress(item.address, player.address)
          )?.chips ?? ZHJ_INITIAL_CHIPS,
      }))
      const round = startRound({
        roomCode: game.roomCode,
        players,
        hostAddress: game.userIdentity.address,
        previousSeq: currentRound?.seq || 0,
        previousWinner: currentRound?.winner || '',
      })
      hostHandsRef.current = round.hands as Record<string, string[]>
      processedActionIdsRef.current.clear()
      await publishRound(round)
      for (const player of round.players) {
        const encrypted = mostBoxEncrypt(
          JSON.stringify(round.hands[player.address]),
          {
            senderPrivateKey: myKeys.private_key,
            recipientPublicKey: player.publicKey,
          }
        )
        await game.sendRoomEvent('deal:private', {
          roundId: round.roundId,
          recipient: player.address,
          senderPublicKey: myKeys.public_key,
          encrypted,
        })
      }
      setPrivateHands(prev => ({
        ...prev,
        [round.roundId]: round.hands[game.userIdentity.address.toLowerCase()],
      }))
      addToast('新一局已开始', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : '开局失败', 'error')
    }
  }

  async function handlePlayerAction(
    action: string,
    options: Record<string, unknown> = {}
  ) {
    if (!currentRound || !game.userIdentity) return
    const actionEvent = createPlayerActionEvent({
      roundId: currentRound.roundId,
      action,
      amount: options.amount,
      target: options.target,
    })
    await game.sendRoomEvent('player:action', { actionEvent })
  }

  const roundStatusText =
    currentRound?.status === 'playing'
      ? sameAddress(currentRound.turnAddress, myAddress)
        ? '轮到你操作'
        : currentRound.turnAddress
          ? `等待 ${getPlayerName(currentRound.turnAddress, lobby.players)}`
          : '进行中'
      : currentRound?.status === 'finished'
        ? '本局结束'
        : '等待开局'

  const compareOptions = activePlayers.filter(
    player => !sameAddress(player.address, myAddress)
  )

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <GameSidebar activeGame="zhajinhua" closeSidebar={closeSidebar} />
      )}
      headerTitle={<h2 className="header-title">炸金花</h2>}
      headerRight={
        <div className={styles.headerActions}>
          {game.roomCode && (
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
        {!game.roomCode ? (
          <section className={styles.entry}>
            <div className={styles.entryBrand}>
              <div className={styles.cardMark}>
                <Spade size={48} />
              </div>
              <div>
                <h1>炸金花牌桌</h1>
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
          <div className={styles.board}>
            <section className={styles.table}>
              {currentRound?.status === 'finished' && currentRound.winner && showFinishBanner && (
                <div className={styles.finishBanner}>
                  <span className={styles.finishBannerIcon}>🏆</span>
                  <span>
                    {getPlayerName(currentRound.winner, lobby.players)} 赢得{' '}
                    {currentRound.winAmount ?? 0} 筹码
                  </span>
                </div>
              )}
              {currentRound?.lastCompare && showCompareOverlay && (
                <CompareOverlay
                  lastCompare={currentRound.lastCompare}
                  compareReveal={currentRound.compareReveal || {}}
                  myAddress={myAddress}
                  myDealtHand={myDealtHand}
                  lobbyPlayers={lobby.players}
                  onClose={() => setShowCompareOverlay(false)}
                />
              )}
              <div className={styles.tableCenter}>
                <span>底池</span>
                <strong>{currentRound?.pot || 0}</strong>
                <small>当前注 {currentRound?.currentBet || 0}</small>
              </div>

              <div className={styles.seats}>
                {lobby.players.map(player => {
                  const roundPlayer = currentRound?.players.find(item =>
                    sameAddress(item.address, player.address)
                  )
                  const isTurn = currentRound?.turnAddress === player.address
                  const isWinner = currentRound?.winner === player.address
                  const isFolded = roundPlayer?.status === 'folded'
                  return (
                    <div
                      key={player.address}
                      className={classNames(
                        styles.seat,
                        isTurn && styles.seatTurn,
                        isWinner && styles.seatWinner,
                        isFolded && styles.seatFolded
                      )}
                    >
                      <div className={styles.seatAvatar}>
                        {player.name.slice(0, 1)}
                      </div>
                      <div className={styles.seatMain}>
                        <strong>{player.name}</strong>
                        <span>{shortAddress(player.address)}</span>
                      </div>
                      <div className={styles.seatMeta}>
                        <span>
                          {roundPlayer?.chips ?? ZHJ_INITIAL_CHIPS} 筹码
                        </span>
                        <span>
                          {roundPlayer?.status === 'folded'
                            ? '已弃牌'
                            : roundPlayer?.looked
                              ? '已看牌'
                              : currentRound
                                ? '在局中'
                                : '等待开局'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <aside className={styles.panel}>
              <div className={styles.panelSection}>
                <div className={styles.panelTitle}>
                  <Spade size={16} />
                  <span>我的手牌</span>
                </div>
                <div className={styles.hand}>
                  {myHand
                    ? myHand.map(card => {
                        const parts = cardParts(card)
                        const label = `${parts.suit}${parts.rank}`
                        return (
                          <div
                            key={card}
                            className={classNames(
                              styles.card,
                              styles[parts.color]
                            )}
                          >
                            <span>{label}</span>
                            <i>{parts.suit}</i>
                          </div>
                        )
                      })
                    : [0, 1, 2].map(index => (
                        <div key={index} className={styles.cardBack}>
                          <Spade size={18} />
                        </div>
                      ))}
                </div>
                <p className={styles.handLabel}>
                  {myHand
                    ? getHandLabel(myHand)
                    : myDealtHand
                      ? '未看牌'
                      : '等待房主发牌'}
                </p>
              </div>

              <div className={styles.panelSection}>
                <div className={styles.panelTitle}>
                  <Play size={16} />
                  <span>操作</span>
                </div>
                {isHost ? (
                  <button
                    className="btn btn-primary btn-full"
                    onClick={hostStartRound}
                    disabled={
                      !canHostStart || currentRound?.status === 'playing'
                    }
                  >
                    <RefreshCcw size={16} />
                    {currentRound?.status === 'finished' ? '再来一局' : '开始本局'}
                  </button>
                ) : (
                  <p className={styles.muted}>等待房主开始或继续牌局。</p>
                )}
                {isHost && currentRound?.status === 'finished' && !canHostStart && (
                  <p className={styles.muted}>筹码不足的玩家太多，无法开局</p>
                )}

                <div className={styles.actionGrid}>
                  <button
                    className="btn btn-secondary"
                    disabled={!allowedActions.includes('look')}
                    onClick={() => handlePlayerAction('look')}
                  >
                    <Eye size={16} />
                    看牌
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={!allowedActions.includes('call')}
                    onClick={() => handlePlayerAction('call')}
                  >
                    跟注
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={!allowedActions.includes('fold')}
                    onClick={() => handlePlayerAction('fold')}
                  >
                    弃牌
                  </button>
                </div>

                <div className={styles.raiseRow}>
                  <select
                    className="input input-compact"
                    value={raiseAmount}
                    onChange={event =>
                      setRaiseAmount(Number(event.target.value))
                    }
                  >
                    {ZHJ_RAISE_STEPS.map(step => (
                      <option key={step} value={step}>
                        加 {step}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    disabled={!allowedActions.includes('raise')}
                    onClick={() =>
                      handlePlayerAction('raise', { amount: raiseAmount })
                    }
                  >
                    加注
                  </button>
                </div>

                <div className={styles.raiseRow}>
                  <select
                    className="input input-compact"
                    value={compareTarget}
                    onChange={event => setCompareTarget(event.target.value)}
                  >
                    <option value="">选择比牌对象</option>
                    {compareOptions.map(player => (
                      <option key={player.address} value={player.address}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    disabled={
                      !allowedActions.includes('compare') || !compareTarget
                    }
                    onClick={() =>
                      handlePlayerAction('compare', { target: compareTarget })
                    }
                  >
                    比牌
                  </button>
                </div>
              </div>

              <div className={styles.panelSection}>
                <div className={styles.panelTitle}>状态</div>
                <div className={styles.statusGrid}>
                  <span>房主</span>
                  <strong>
                    {hostAddress ? shortAddress(hostAddress) : '-'}
                  </strong>
                  <span>我的筹码</span>
                  <strong>{myPlayer?.chips ?? ZHJ_INITIAL_CHIPS}</strong>
                  <span>本轮</span>
                  <strong>{roundStatusText}</strong>
                  <span>提示</span>
                  <strong>{currentRound?.lastAction || '等待玩家加入'}</strong>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </AppShell>
  )
}

interface CompareOverlayProps {
  lastCompare: {
    initiator: string
    target: string
    winner: string
    loser: string
    initiatorLooked: boolean
    targetLooked: boolean
    timestamp: number
  }
  compareReveal: Record<string, string[]>
  myAddress: string
  myDealtHand: string[] | null
  lobbyPlayers: Array<{ address: string; name: string }>
  onClose: () => void
}

function CompareOverlay({
  lastCompare,
  compareReveal,
  myAddress,
  myDealtHand,
  lobbyPlayers,
  onClose,
}: CompareOverlayProps) {
  const initiatorName = getPlayerName(lastCompare.initiator, lobbyPlayers)
  const targetName = getPlayerName(lastCompare.target, lobbyPlayers)
  const winnerName = getPlayerName(lastCompare.winner, lobbyPlayers)

  const isInitiator = sameAddress(myAddress, lastCompare.initiator)
  const isTarget = sameAddress(myAddress, lastCompare.target)
  const isParticipant = isInitiator || isTarget

  function getDisplayCards(playerAddress: string, playerLooked: boolean) {
    const revealed = compareReveal[playerAddress]
    if (revealed) return revealed
    if (isParticipant && sameAddress(playerAddress, myAddress) && playerLooked && myDealtHand) {
      return myDealtHand
    }
    return null
  }

  const initiatorDisplayCards = getDisplayCards(lastCompare.initiator, lastCompare.initiatorLooked)
  const targetDisplayCards = getDisplayCards(lastCompare.target, lastCompare.targetLooked)

  return (
    <div className={styles.compareOverlay} onClick={onClose}>
      <div className={styles.compareBox} onClick={e => e.stopPropagation()}>
        <div className={styles.compareTitle}>比牌结果</div>
        <div className={styles.comparePlayers}>
          <div className={classNames(styles.compareSide, sameAddress(lastCompare.winner, lastCompare.initiator) && styles.compareWinner)}>
            <div className={styles.compareName}>{initiatorName}</div>
            <div className={styles.compareCards}>
              {initiatorDisplayCards
                ? initiatorDisplayCards.map(card => {
                    const parts = cardParts(card)
                    return (
                      <div key={card} className={classNames(styles.card, styles[parts.color])}>
                        <span>{parts.rank}</span>
                        <i>{parts.suit}</i>
                      </div>
                    )
                  })
                : [0, 1, 2].map(i => (
                    <div key={i} className={styles.cardBack}>
                      <Spade size={18} />
                    </div>
                  ))}
            </div>
            {initiatorDisplayCards && (
              <div className={styles.compareLabel}>{getHandLabel(initiatorDisplayCards)}</div>
            )}
          </div>
          <div className={styles.compareVs}>VS</div>
          <div className={classNames(styles.compareSide, sameAddress(lastCompare.winner, lastCompare.target) && styles.compareWinner)}>
            <div className={styles.compareName}>{targetName}</div>
            <div className={styles.compareCards}>
              {targetDisplayCards
                ? targetDisplayCards.map(card => {
                    const parts = cardParts(card)
                    return (
                      <div key={card} className={classNames(styles.card, styles[parts.color])}>
                        <span>{parts.rank}</span>
                        <i>{parts.suit}</i>
                      </div>
                    )
                  })
                : [0, 1, 2].map(i => (
                    <div key={i} className={styles.cardBack}>
                      <Spade size={18} />
                    </div>
                  ))}
            </div>
            {targetDisplayCards && (
              <div className={styles.compareLabel}>{getHandLabel(targetDisplayCards)}</div>
            )}
          </div>
        </div>
        <div className={styles.compareResult}>
          {winnerName} 胜出
        </div>
        <button className="btn btn-sm" onClick={onClose}>关闭</button>
      </div>
    </div>
  )
}

function getPlayerName(
  address: string,
  players: Array<{ address: string; name: string }>
) {
  const normalized = address.toLowerCase()
  return (
    players.find(player => player.address === normalized)?.name ||
    shortAddress(address)
  )
}
