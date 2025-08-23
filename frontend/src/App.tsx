import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import SessionRoomPage from './pages/SessionRoomPage'
import HomePage from './pages/HomePage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'
import ArticlesPage from './pages/ArticlesPage'
import ArticleDetailPage from './pages/ArticleDetailPage'
import ArticleEditPage from './pages/ArticleEditPage'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-6 text-center text-neutral-300">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function NavBar() {
  const { user, logout } = useAuth()
  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 flex-wrap overflow-x-auto">
  <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-sm bg-brand-500" />
          <span>InterviewBuddy</span>
        </Link>
        {user && (<>
          <Link to="/dashboard" className="text-neutral-300 hover:text-white">Dashboard</Link>
          <Link to="/articles" className="text-neutral-300 hover:text-white">Articles</Link>
        </>)}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-neutral-400 md:inline">{user.name} ({user.role})</span>
              <button onClick={logout} className="btn">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn">Login</Link>
              <Link to="/signup" className="btn btn-primary">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default function App() {
  function Layout({ children }: { children: JSX.Element }) {
    const location = useLocation()
    const hideNav = location.pathname.startsWith('/room/')
    return (
      <>
        {!hideNav && <NavBar />}
        {children}
      </>
    )
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/articles" element={<ProtectedRoute><ArticlesPage /></ProtectedRoute>} />
            <Route path="/articles/new" element={<ProtectedRoute><ArticleEditPage /></ProtectedRoute>} />
            <Route path="/articles/:id" element={<ProtectedRoute><ArticleDetailPage /></ProtectedRoute>} />
            <Route path="/room/:roomId" element={<ProtectedRoute><SessionRoomPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}
