import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function ArticleEditPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { if (editId) { (async () => {
    try { const { data } = await axios.get(`/api/articles/${editId}`); const it = data.item; setTitle(it.title); setContent(it.content); setTags((it.tags||[]).join(', ')); } catch {}
  })() } }, [editId])

  async function save() {
    if (!title.trim() || !content.trim()) return alert('Title and content are required')
    setSubmitting(true)
    try {
      if (editId) {
        const { data } = await axios.put(`/api/articles/${editId}`, { title: title.trim(), content: content.trim(), tags: tags.split(',').map(s=>s.trim()).filter(Boolean) })
        nav(`/articles/${data.item._id}`)
      } else {
        const { data } = await axios.post('/api/articles', { title: title.trim(), content: content.trim(), tags: tags.split(',').map(s=>s.trim()).filter(Boolean) })
        nav(`/articles/${data.item._id}`)
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to publish')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
  <h1 className="text-2xl font-bold mb-4">{editId ? 'Edit article' : 'Write an article'}</h1>
      <div className="grid gap-2">
        <input className="input" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea className="textarea min-h-[300px]" placeholder="Share your knowledge..." value={content} onChange={e=>setContent(e.target.value)} />
        <input className="input" placeholder="Tags (comma separated)" value={tags} onChange={e=>setTags(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn" onClick={()=>nav(-1)}>Cancel</button>
          <button className="btn btn-primary" disabled={submitting} onClick={save}>{submitting? 'Publishing...' : 'Publish'}</button>
        </div>
      </div>
    </div>
  )
}
