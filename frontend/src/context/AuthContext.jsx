import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('sstg_token')
    if (token) {
      authAPI.me()
        .then(r => setUser(r.data))
        .catch(() => localStorage.removeItem('sstg_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const r = await authAPI.login(username, password)
    localStorage.setItem('sstg_token', r.data.access_token)
    const me = await authAPI.me()
    setUser(me.data)
    window.dispatchEvent(new CustomEvent('sstg_logged_in'))
    // Load profile photo globally so topbar shows it immediately
    try {
      const { data: prof } = await import('../api/client').then(m => m.profileAPI.get())
      if (prof.has_photo && prof.photo_url) {
        setPhotoUrl(prof.photo_url + '?t=' + Date.now())
      }
    } catch { /* photo is optional */ }
    return me.data
  }

  const logout = () => {
    localStorage.removeItem('sstg_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, photoUrl, setPhotoUrl }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
