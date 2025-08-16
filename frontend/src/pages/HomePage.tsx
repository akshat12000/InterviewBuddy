import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function HomePage() {
  const { user } = useAuth()
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10">
      <div className="mx-auto max-w-3xl text-center px-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Run world-class technical interviews</h1>
        <p className="mt-3 text-neutral-400">Live video, collaborative code editor, structured scoring, and a delightful experience for both interviewers and candidates.</p>
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          {user ? (
            <>
              <Link to="/profile" className="btn">Profile</Link>
              <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
            </>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary">Get Started</Link>
              <Link to="/dashboard" className="btn">Go to Dashboard</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
