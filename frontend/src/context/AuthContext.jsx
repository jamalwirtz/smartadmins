import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI, profileAPI } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,     setUser]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [photoUrl, setPhotoUrl] = useState(null)   // global admin photo

  useEffect(() => {
    const token = localStorage.getItem('sstg_token')
    if (token) {
      authAPI.me()
        .then(r => {
          setUser(r.data)
          // Load photo on page refresh
          profileAPI.get()
            .then(pr => {
              if (pr.data.has_photo && pr.data.photo_url)
                setPhotoUrl(pr.data.photo_url + '?t=' + Date.now())
            })
            .catch(() => {})
        })
        .catch(() => localStorage.removeItem('sstg_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const r  = await authAPI.login(username, password)
    localStorage.setItem('sstg_token', r.data.access_token)
    const me = await authAPI.me()
    setUser(me.data)
    window.dispatchEvent(new CustomEvent('sstg_logged_in'))
    // Load profile photo globally
    try {
      const pr = await profileAPI.get()
      if (pr.data.has_photo && pr.data.photo_url)
        setPhotoUrl(pr.data.photo_url + '?t=' + Date.now())
    } catch { /* photo is optional */ }
    return me.data
  }

  const logout = () => {
    localStorage.removeItem('sstg_token')
    setUser(null)
    setPhotoUrl(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, photoUrl, setPhotoUrl }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
