/**
 * useWebSocket — connects to SSTG WebSocket endpoint,
 * handles heartbeat, reconnect, and event dispatch.
 */
import { useEffect, useRef, useCallback, useState } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
const PING_INTERVAL = 25_000
const RECONNECT_DELAY = 3_000
const MAX_RECONNECTS = 8

export function useWebSocket(path, onMessage, { enabled = true } = {}) {
  const wsRef = useRef(null)
  const pingRef = useRef(null)
  const reconnectRef = useRef(0)
  const mountedRef = useRef(true)
  const [connected, setConnected] = useState(false)
  const [viewers, setViewers] = useState(0)

  const getToken = () => localStorage.getItem('sstg_token') || ''

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    const url = `${WS_BASE}${path}?token=${getToken()}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectRef.current = 0
      setConnected(true)
      // Heartbeat ping
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL)
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'pong') return
        if (data.viewers !== undefined) setViewers(data.viewers)
        if (onMessage) onMessage(data)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      setConnected(false)
      clearInterval(pingRef.current)
      if (mountedRef.current && reconnectRef.current < MAX_RECONNECTS) {
        reconnectRef.current++
        setTimeout(connect, RECONNECT_DELAY * Math.min(reconnectRef.current, 3))
      }
    }

    ws.onerror = () => ws.close()
  }, [path, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()
    return () => {
      mountedRef.current = false
      clearInterval(pingRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect, enabled])

  return { connected, viewers }
}

export function useGlobalWS(onMessage) {
  return useWebSocket('/ws/global', onMessage)
}

export function useDraftWS(draftId, onMessage) {
  return useWebSocket(
    draftId ? `/ws/draft/${draftId}` : null,
    onMessage,
    { enabled: !!draftId }
  )
}
