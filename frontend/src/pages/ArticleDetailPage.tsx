import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { ThumbsUp, ThumbsDown, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export default function ArticleDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')

  useEffect(() => { load() }, [id])
  async function load() {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/articles/${id}`)
      setItem(data.item)
    } finally { setLoading(false) }
  }

  async function like() {
    await axios.post(`/api/articles/${id}/like`)
    await load()
  }
  async function unlike() {
    await axios.post(`/api/articles/${id}/unlike`)
    await load()
  }
  async function dislike() {
    await axios.post(`/api/articles/${id}/dislike`)
    await load()
  }
  async function undislike() {
    await axios.post(`/api/articles/${id}/undislike`)
    await load()
  }
  async function addComment() {
    if (!comment.trim()) return
    await axios.post(`/api/articles/${id}/comments`, { content: comment.trim() })
    setComment('')
    await load()
  }
  async function likeComment(cid: string) {
    await axios.post(`/api/articles/${id}/comments/${cid}/like`)
    await load()
  }
  async function unlikeComment(cid: string) {
    await axios.post(`/api/articles/${id}/comments/${cid}/unlike`)
    await load()
  }
  async function dislikeComment(cid: string) {
    await axios.post(`/api/articles/${id}/comments/${cid}/dislike`)
    await load()
  }
  async function undislikeComment(cid: string) {
    await axios.post(`/api/articles/${id}/comments/${cid}/undislike`)
    await load()
  }

  if (loading) return <div className="p-4">Loading...</div>
  if (!item) return <div className="p-4">Not found</div>

  const liked = !!item.likes?.some((l: any) => String(l.user) === String(user?.id))
  const disliked = !!item.dislikes?.some((l: any) => String(l.user) === String(user?.id))
  const authorId = item?.author?._id || item?.author?.id || item?.author
  const isAuthor = !!(user?.id && authorId && String(user.id) === String(authorId))
  async function del() {
    if (!confirm('Delete this article?')) return
    await axios.delete(`/api/articles/${id}`)
    window.location.href = '/articles'
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold">{item.title}</h1>
        <div className="text-sm text-neutral-500">
          By {item.author?.name || 'Unknown'} • {new Date(item.createdAt).toLocaleString()} • {item.views} views • {(item.likes?.length||0)} likes • {(item.dislikes?.length||0)} dislikes
        </div>
      </div>
      <div className="prose prose-invert max-w-none whitespace-pre-wrap">{item.content}</div>
      <div className="mt-4 flex gap-2 items-center flex-wrap">
  <button className="btn" onClick={liked ? unlike : like}>{liked? <><ThumbsUp size={16}/> Unlike</> : <><ThumbsUp size={16}/> Like</>}</button>
  <button className="btn" onClick={disliked ? undislike : dislike}><ThumbsDown size={16}/> {disliked? 'Undislike' : 'Dislike'}</button>
        {isAuthor && (
          <>
            <button className="btn" onClick={() => (window.location.href = `/articles/new?edit=${id}`)}><Pencil size={16}/> Edit</button>
            <button className="btn" onClick={del}><Trash2 size={16}/> Delete</button>
          </>
        )}
      </div>

      <div className="mt-6">
        <h3 className="font-semibold mb-2">Comments</h3>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" placeholder="Add a comment" value={comment} onChange={e=>setComment(e.target.value)} />
          <button className="btn btn-primary" onClick={addComment}>Post</button>
        </div>
        <div className="grid gap-2">
      {item.comments?.map((c: any) => {
            const cLiked = !!c.likes?.some((l: any) => String(l.user) === String(user?.id))
            const cDisliked = !!c.dislikes?.some((l: any) => String(l.user) === String(user?.id))
            return (
              <div key={c._id} className="rounded border border-neutral-800 bg-neutral-900 p-2">
                <div className="text-sm text-neutral-400">{new Date(c.createdAt).toLocaleString()}</div>
                <div className="text-neutral-200 whitespace-pre-wrap">{c.content}</div>
                <div className="mt-1 text-sm flex items-center gap-2">
                  <span>{(c.likes?.length||0)} likes • {(c.dislikes?.length||0)} dislikes</span>
                  <button className="btn" onClick={() => (cLiked ? unlikeComment(c._id) : likeComment(c._id))}>{cLiked ? 'Unlike' : 'Like'}</button>
                  <button className="btn" onClick={() => (cDisliked ? undislikeComment(c._id) : dislikeComment(c._id))}>{cDisliked ? 'Undislike' : 'Dislike'}</button>
                </div>
              </div>
            )
          })}
          {!item.comments?.length && <div className="text-neutral-500">Be the first to comment.</div>}
        </div>
      </div>
    </div>
  )
}
