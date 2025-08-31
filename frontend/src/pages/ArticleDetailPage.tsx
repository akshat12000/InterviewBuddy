import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { ThumbsUp, ThumbsDown, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/Toaster'

export default function ArticleDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const { success, error } = useToast()
  const [editingCid, setEditingCid] = useState<string>('')
  const [editingContent, setEditingContent] = useState<string>('')

  useEffect(() => { load() }, [id])
  async function load() {
    setLoading(true)
    try {
  const { data } = await axios.get(`/api/articles/${id}`)
      setItem(data.item)
    } finally { setLoading(false) }
  }

  async function likeToggle() {
    const liked = !!item.likes?.some((l: any) => String(l.user) === String(user?.id))
    // optimistic update
    const prev = item
    const next = { ...prev,
      likes: liked ? prev.likes.filter((l: any) => String(l.user) !== String(user?.id)) : [...(prev.likes||[]), { user: user?.id }],
      // ensure mutual exclusivity
      dislikes: (prev.dislikes||[]).filter((l: any) => String(l.user) !== String(user?.id))
    }
    setItem(next)
    try {
      await axios.post(`/api/articles/${id}/${liked ? 'unlike' : 'like'}`)
      success(liked ? 'Like removed' : 'Liked')
    } catch (e: any) {
      setItem(prev)
      error(e?.response?.data?.message || 'Failed to update like')
    }
  }
  async function dislikeToggle() {
    const disliked = !!item.dislikes?.some((l: any) => String(l.user) === String(user?.id))
    const prev = item
    const next = { ...prev,
      dislikes: disliked ? prev.dislikes.filter((l: any) => String(l.user) !== String(user?.id)) : [...(prev.dislikes||[]), { user: user?.id }],
      likes: (prev.likes||[]).filter((l: any) => String(l.user) !== String(user?.id))
    }
    setItem(next)
    try {
      await axios.post(`/api/articles/${id}/${disliked ? 'undislike' : 'dislike'}`)
      success(disliked ? 'Dislike removed' : 'Disliked')
    } catch (e: any) {
      setItem(prev)
      error(e?.response?.data?.message || 'Failed to update dislike')
    }
  }
  async function addComment() {
    if (!comment.trim()) return
    const content = comment.trim()
    setComment('')
    // optimistic append
    const prev = item
    const tempId = 'tmp-' + Math.random().toString(36).slice(2)
    const optimistic = { ...prev, comments: [...(prev.comments||[]), { _id: tempId, content, createdAt: new Date().toISOString(), likes: [], dislikes: [], author: user?.id }] }
    setItem(optimistic)
    try {
      const { data } = await axios.post(`/api/articles/${id}/comments`, { content })
      // replace temp with real
      setItem((cur: any) => ({ ...cur, comments: (cur.comments||[]).map((c:any)=> c._id===tempId ? data.item : c) }))
      success('Comment added')
    } catch (e: any) {
      setItem(prev)
      error(e?.response?.data?.message || 'Failed to add comment')
    }
  }
  async function likeComment(cid: string) {
    const prev = item
    const next = { ...prev, comments: prev.comments.map((c:any)=> c._id===cid ? {
      ...c,
      likes: [...(c.likes||[]), { user: user?.id }],
      dislikes: (c.dislikes||[]).filter((l:any)=> String(l.user)!==String(user?.id))
    } : c) }
    setItem(next)
    try { await axios.post(`/api/articles/${id}/comments/${cid}/like`); success('Liked comment') } catch (e:any) { setItem(prev); error('Failed to like') }
  }
  async function unlikeComment(cid: string) {
    const prev = item
    const next = { ...prev, comments: prev.comments.map((c:any)=> c._id===cid ? { ...c, likes: (c.likes||[]).filter((l:any)=> String(l.user)!==String(user?.id)) } : c) }
    setItem(next)
    try { await axios.post(`/api/articles/${id}/comments/${cid}/unlike`); success('Removed like') } catch (e:any) { setItem(prev); error('Failed to unlike') }
  }
  async function dislikeComment(cid: string) {
    const prev = item
    const next = { ...prev, comments: prev.comments.map((c:any)=> c._id===cid ? {
      ...c,
      dislikes: [...(c.dislikes||[]), { user: user?.id }],
      likes: (c.likes||[]).filter((l:any)=> String(l.user)!==String(user?.id))
    } : c) }
    setItem(next)
    try { await axios.post(`/api/articles/${id}/comments/${cid}/dislike`); success('Disliked comment') } catch (e:any) { setItem(prev); error('Failed to dislike') }
  }
  async function undislikeComment(cid: string) {
    const prev = item
    const next = { ...prev, comments: prev.comments.map((c:any)=> c._id===cid ? { ...c, dislikes: (c.dislikes||[]).filter((l:any)=> String(l.user)!==String(user?.id)) } : c) }
    setItem(next)
    try { await axios.post(`/api/articles/${id}/comments/${cid}/undislike`); success('Removed dislike') } catch (e:any) { setItem(prev); error('Failed to undislike') }
  }
  async function editComment(cid: string) {
    const c = (item?.comments||[]).find((x:any)=>x._id===cid)
    setEditingCid(cid)
    setEditingContent(c?.content || '')
  }
  async function saveEditComment(cid: string) {
    const content = editingContent.trim()
    if (!content) return
    const prev = item
    const next = { ...prev, comments: prev.comments.map((c:any)=> c._id===cid ? { ...c, content } : c) }
    setItem(next)
    setEditingCid(''); setEditingContent('')
    try { await axios.put(`/api/articles/${id}/comments/${cid}`, { content }); success('Comment updated') }
    catch (e:any) { setItem(prev); error(e?.response?.data?.message || 'Failed to update') }
  }
  async function deleteComment(cid: string) {
    const prev = item
    const next = { ...prev, comments: prev.comments.filter((c:any)=> c._id!==cid) }
    setItem(next)
    try { await axios.delete(`/api/articles/${id}/comments/${cid}`); success('Comment deleted') }
    catch (e:any) { setItem(prev); error(e?.response?.data?.message || 'Failed to delete') }
  }

  if (loading) return (
    <div className="p-4 max-w-3xl mx-auto animate-pulse">
      <div className="mb-3 h-7 w-2/3 rounded bg-neutral-800" />
      <div className="h-4 w-1/2 rounded bg-neutral-800" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }).map((_,i)=>(<div key={i} className="h-4 rounded bg-neutral-800"/>))}
      </div>
    </div>
  )
  if (!item) return <div className="p-4">Not found</div>

  // compute toggles inside handlers; no local liked/disliked here
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
  <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: item.content }} />
      <div className="mt-4 flex gap-2 items-center flex-wrap">
  <button className="btn" onClick={likeToggle}><ThumbsUp size={16}/> Like</button>
  <button className="btn" onClick={dislikeToggle}><ThumbsDown size={16}/> Dislike</button>
        {isAuthor && (
          <>
            <button className="btn" onClick={() => (window.location.href = `/articles/new?edit=${item._id}`)}><Pencil size={16}/> Edit</button>
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
            const isCommentAuthor = String(c.author) === String(user?.id)
            return (
              <div key={c._id} className="rounded border border-neutral-800 bg-neutral-900 p-2">
                <div className="text-sm text-neutral-400">{new Date(c.createdAt).toLocaleString()}</div>
                {editingCid === c._id ? (
                  <div className="grid gap-2">
                    <textarea className="textarea" value={editingContent} onChange={e=>setEditingContent(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn btn-primary" onClick={()=>saveEditComment(c._id)}>Save</button>
                      <button className="btn" onClick={()=>{ setEditingCid(''); setEditingContent('') }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-neutral-200 whitespace-pre-wrap">{c.content}</div>
                )}
                <div className="mt-1 text-sm flex items-center gap-2">
                  <span>{(c.likes?.length||0)} likes • {(c.dislikes?.length||0)} dislikes</span>
                  <button className="btn" onClick={() => (cLiked ? unlikeComment(c._id) : likeComment(c._id))}>{cLiked ? 'Unlike' : 'Like'}</button>
                  <button className="btn" onClick={() => (cDisliked ? undislikeComment(c._id) : dislikeComment(c._id))}>{cDisliked ? 'Undislike' : 'Dislike'}</button>
                  {isCommentAuthor && editingCid !== c._id && (
                    <>
                      <button className="btn" onClick={()=>editComment(c._id)}><Pencil size={16}/> Edit</button>
                      <button className="btn" onClick={()=>deleteComment(c._id)}><Trash2 size={16}/> Delete</button>
                    </>
                  )}
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
