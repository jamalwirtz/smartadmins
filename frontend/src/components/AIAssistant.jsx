import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, X, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

const QUICK = [
  "What's the best way to balance this timetable?",
  "Which subjects should go in morning periods?",
  "Suggest a conflict-free exam order for 2 weeks",
  "How many periods should Maths have per week?",
]

export default function AIAssistant({ context = 'general', sessionId, draftId }) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState(null)  // {configured, get_key_url}
  const endRef = useRef()

  useEffect(() => {
    if (open && !status) checkStatus()
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const checkStatus = async () => {
    try {
      const r = await api.get('/ai/status')
      setStatus(r.data)
      if (!r.data.configured && messages.length === 0) {
        setMessages([{
          role: 'assistant',
          text: `👋 Hi! I'm your AI scheduling assistant powered by Google Gemini.\n\nTo activate me, set your free **GEMINI_API_KEY** in your environment variables.\n\nGet a free key (no credit card) at: ${r.data.get_key_url}`,
          ts: Date.now(),
        }])
      } else if (r.data.configured && messages.length === 0) {
        setMessages([{
          role: 'assistant',
          text: `👋 Hi! I'm your AI scheduling assistant. I can help you:\n\n• Generate conflict-free schedules from plain English\n• Optimize exam arrangements\n• Spot overloaded teachers or classes\n• Apply scheduling rules ("no Maths on Friday afternoons")\n\nWhat would you like to do?`,
          ts: Date.now(),
        }])
      }
    } catch {
      setStatus({ configured: false })
    }
  }

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }])
    setLoading(true)
    try {
      const r = await api.post('/ai/chat', {
        message: msg,
        context: context,
      })
      const { reply, suggestions, action } = r.data
      setMessages(m => [...m, {
        role: 'assistant',
        text: reply,
        suggestions,
        action,
        ts: Date.now(),
      }])
      if (suggestions?.length > 0 && action !== 'info_only') {
        toast(`💡 AI suggested ${suggestions.length} schedule change${suggestions.length > 1 ? 's' : ''}`, {
          duration: 4000,
          icon: '🤖',
        })
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'AI request failed'
      setMessages(m => [...m, {
        role: 'assistant',
        text: `⚠️ ${msg}`,
        ts: Date.now(),
        error: true,
      }])
    } finally { setLoading(false) }
  }

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        title="AI Scheduling Assistant">
        <Sparkles size={18} />
        <span className="ai-fab-label">AI</span>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div className="ai-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}>

            {/* Header */}
            <div className="ai-header">
              <div className="ai-header-left">
                <div className="ai-header-icon"><Sparkles size={14} /></div>
                <div>
                  <div className="ai-header-title">AI Assistant</div>
                  <div className="ai-header-sub">
                    {status?.configured ? 'Gemini 1.5 Flash · Free tier' : 'Not configured'}
                  </div>
                </div>
              </div>
              <button className="ai-close" onClick={() => setOpen(false)}>
                <X size={15} />
              </button>
            </div>

            {/* Messages */}
            <div className="ai-messages">
              {messages.map((m, i) => (
                <motion.div key={m.ts}
                  className={`ai-msg ai-msg-${m.role}${m.error ? ' ai-msg-error' : ''}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i === messages.length - 1 ? 0 : 0 }}>
                  <div className="ai-msg-text"
                    dangerouslySetInnerHTML={{
                      __html: m.text
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br/>')
                        .replace(/https:\/\/[^\s<]+/g, url =>
                          `<a href="${url}" target="_blank" rel="noopener" style="color:var(--amber)">${url}</a>`)
                    }} />
                  {m.suggestions?.length > 0 && (
                    <div className="ai-suggestions">
                      <div className="ai-suggestions-title">
                        💡 {m.suggestions.length} suggestion{m.suggestions.length > 1 ? 's' : ''}
                      </div>
                      {m.suggestions.slice(0, 3).map((s, si) => (
                        <div key={si} className="ai-suggestion-item">
                          {s.subject} {s.paper_number ? `Paper ${s.paper_number}` : ''}
                          {s.class ? ` · ${s.class}` : ''}
                          {s.day ? ` → ${s.day} P${s.period}` : ''}
                        </div>
                      ))}
                      {m.suggestions.length > 3 && (
                        <div className="ai-suggestions-more">
                          +{m.suggestions.length - 3} more suggestions
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
              {loading && (
                <div className="ai-msg ai-msg-assistant">
                  <div className="ai-typing">
                    <div className="ai-typing-dot" />
                    <div className="ai-typing-dot" />
                    <div className="ai-typing-dot" />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Quick prompts */}
            {messages.length <= 1 && (
              <div className="ai-quick">
                {QUICK.map(q => (
                  <button key={q} className="ai-quick-btn" onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="ai-input-row">
              <input
                className="ai-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask anything about your schedule…"
                disabled={loading} />
              <button className="ai-send" onClick={() => send()} disabled={loading || !input.trim()}>
                {loading ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
