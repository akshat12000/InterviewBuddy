import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ThumbsUp } from 'lucide-react'
import axios from 'axios'
import { useAuth } from '../auth/AuthContext'

type Article = { _id: string; title: string; content: string; views: number; likes?: any[]; createdAt: string; author?: { name?: string } }

export default function ArticlesPage() {
  const [items, setItems] = useState<Article[]>([])
  const [sort, setSort] = useState<'new'|'views'|'votes'>('new')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => { load() }, [sort])

  async function load() {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/articles', { params: { sort, q } })
      setItems(data.items || [])
    } finally { setLoading(false) }
  }

  async function del(id: string) {
    if (!confirm('Delete this article?')) return
    await axios.delete(`/api/articles/${id}`)
    await load()
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
  <input className="input flex-1 w-auto min-w-[220px]" placeholder="Search articles" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="btn" onClick={load}>Search</button>
        <select className="select" value={sort} onChange={e=>setSort(e.target.value as any)}>
          <option value="new">Newest</option>
          <option value="views">Most Viewed</option>
          <option value="votes">Top Voted</option>
        </select>
        <Link to="/articles/new" className="btn btn-primary">Write</Link>
      </div>
      {loading ? <div>Loading...</div> : (
        <div className="grid gap-3">
          {items.map(it => {
            const authorId: any = (it as any).author?._id || (it as any).author?.id || (it as any).author
            const isAuthor = !!(user?.id && authorId && String(user.id) === String(authorId))
            return (
              <div key={it._id} className="rounded border border-neutral-800 bg-neutral-900 p-3 hover:bg-neutral-800">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <Link to={`/articles/${it._id}`} className="font-semibold text-lg hover:underline block truncate">{it.title}</Link>
                    <div className="text-sm text-neutral-400 flex items-center gap-3 flex-wrap">
                      <span>By {it.author?.name || 'Unknown'}</span>
                      <span>{new Date(it.createdAt).toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1"><Eye size={14}/> {it.views}</span>
                      <span className="inline-flex items-center gap-1"><ThumbsUp size={14}/> {(it.likes?.length||0)}</span>
                    </div>
                  </div>
                  {isAuthor && (
                    <div className="ml-auto flex gap-2 shrink-0">
                      <Link to={`/articles/new?edit=${it._id}`} className="btn">Edit</Link>
                      <button className="btn" onClick={() => del(it._id)}>Delete</button>
                    </div>
                  )}
                </div>
                <Link to={`/articles/${it._id}`} className="mt-2 text-neutral-200 line-clamp-2 block">{it.content.slice(0, 240)}</Link>
              </div>
            )
          })}
          {!items.length && <div className="text-neutral-500">No articles found.</div>}
        </div>
      )}
    </div>
  )
}
