import './App.css'
import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SessionRoomPage from './pages/SessionRoomPage'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ padding: 24 }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function NavBar() {
  const { user, logout } = useAuth()
  return (
    <div style={{ display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid #ddd' }}>
      <Link to="/">Home</Link>
      {user && <Link to="/dashboard">Dashboard</Link>}
      {user ? (
        <>
          <span style={{ marginLeft: 'auto' }}>{user.name} ({user.role})</span>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <Link style={{ marginLeft: 'auto' }} to="/login">Login</Link>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<div style={{ padding: 24 }}>Welcome to InterviewApp MVP</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/room/:roomId" element={<ProtectedRoute><SessionRoomPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
