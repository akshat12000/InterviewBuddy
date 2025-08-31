const { z } = require('zod');
const Article = require('../models/Article');
const sanitizeHtml = require('sanitize-html');

function makeSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 120);
}

const createSchema = z.object({ title: z.string().min(3), content: z.string().min(1), tags: z.array(z.string()).optional() });
const updateSchema = z.object({ title: z.string().min(3).optional(), content: z.string().min(1).optional(), tags: z.array(z.string()).optional() });

function byIdOrSlug(id) {
  return id && /^[a-f0-9]{24}$/i.test(id) ? { _id: id } : { slug: id };
}

exports.createArticle = async (req, res, next) => {
  try {
    const { title, content, tags } = createSchema.parse(req.body || {});
    const authorId = (req.user && (req.user.uid || req.user.id)) || null;
    if (!authorId) return res.status(401).json({ message: 'Unauthorized' });
    const slugBase = makeSlug(title) || `post-${Date.now()}`;
    let slug = slugBase;
    let i = 1;
    while (await Article.findOne({ slug })) {
      slug = `${slugBase}-${i++}`;
    }
    const safe = sanitizeHtml(content, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','h1','h2','h3','pre','code']), allowedAttributes: { a: ['href','name','target','rel'], img: ['src','alt','title'] }, allowedSchemes: ['http','https','mailto'] });
    const art = await Article.create({ title, slug, content: safe, tags: tags || [], author: authorId });
    res.status(201).json({ item: art });
  } catch (e) { next(e); }
};

exports.updateArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const patch = updateSchema.parse(req.body || {});
    patch.updatedAt = new Date();
  if (patch.title) patch.slug = makeSlug(patch.title);
  if (patch.content) patch.content = sanitizeHtml(patch.content, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','h1','h2','h3','pre','code']), allowedAttributes: { a: ['href','name','target','rel'], img: ['src','alt','title'] }, allowedSchemes: ['http','https','mailto'] });
  const art = await Article.findOneAndUpdate({ _id: id, author: req.user.uid }, { $set: patch }, { new: true });
    if (!art) return res.status(404).json({ message: 'Article not found' });
    res.json({ item: art });
  } catch (e) { next(e); }
};

exports.deleteArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
  const del = await Article.findOneAndDelete({ _id: id, author: req.user.uid });
    if (!del) return res.status(404).json({ message: 'Article not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.getArticle = async (req, res, next) => {
  try {
  const { id } = req.params;
  // Support fetch by slug or id
  const query = id.match(/^[a-f0-9]{24}$/i) ? { _id: id } : { slug: id };
  const art = await Article.findOne(query).populate('author', '_id name email');
    if (!art) return res.status(404).json({ message: 'Article not found' });
    // Count a view at most once per authenticated user
    const viewerId = req.user?.uid || req.user?.id;
    if (viewerId && !art.viewsBy?.some(v => String(v) === String(viewerId))) {
      await Article.updateOne({ _id: id }, { $addToSet: { viewsBy: viewerId }, $inc: { views: 1 } });
      art.views += 1;
    }
    res.json({ item: art });
  } catch (e) { next(e); }
};

exports.listArticles = async (req, res, next) => {
  try {
    const { q = '', sort = 'new', page = '1', limit = '10', tag } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const filter = {};
    if (q) {
      // use text search if possible
      filter.$text = { $search: q };
    }
    if (tag) filter.tags = tag;
    if (sort === 'votes') {
      const pipeline = [
        { $match: filter },
        { $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } }, commentsCount: { $size: { $ifNull: ['$comments', []] } } } },
        { $sort: { likesCount: -1, commentsCount: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit, 10) },
  { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' } },
  { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
  { $project: { comments: 0, author: { _id: '$author._id', name: '$author.name' } } }
      ];
      const items = await Article.aggregate(pipeline);
      const total = await Article.countDocuments(filter);
      return res.json({ items, total });
    } else {
      let sortSpec = { createdAt: -1 };
      if (sort === 'views') sortSpec = { views: -1, createdAt: -1 };
      const projection = q ? { score: { $meta: 'textScore' } } : {};
  const items = await Article.find(filter, projection).sort(q ? { score: { $meta: 'textScore' }, createdAt: -1 } : sortSpec).skip(skip).limit(parseInt(limit, 10)).select('-comments').populate('author', '_id name');
      const total = await Article.countDocuments(filter);
      return res.json({ items, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
    }
  } catch (e) { next(e); }
};

exports.likeArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
  // remove dislike if present, then add like if not present
    await Article.updateOne(byIdOrSlug(id), { $pull: { dislikes: { user: req.user.uid } } });
    await Article.updateOne({ ...byIdOrSlug(id), 'likes.user': { $ne: req.user.uid } }, { $push: { likes: { user: req.user.uid } } });
    const art = await Article.findOne(byIdOrSlug(id)).select('likes dislikes views');
  res.json({ likes: art?.likes?.length || 0, dislikes: art?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.unlikeArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Article.updateOne(byIdOrSlug(id), { $pull: { likes: { user: req.user.uid } } });
    const art = await Article.findOne(byIdOrSlug(id)).select('likes dislikes');
    res.json({ likes: art?.likes?.length || 0, dislikes: art?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.dislikeArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    // remove like if present, then add dislike if not present
    await Article.updateOne(byIdOrSlug(id), { $pull: { likes: { user: req.user.uid } } });
    await Article.updateOne({ ...byIdOrSlug(id), 'dislikes.user': { $ne: req.user.uid } }, { $push: { dislikes: { user: req.user.uid } } });
    const art = await Article.findOne(byIdOrSlug(id)).select('likes dislikes');
    res.json({ likes: art?.likes?.length || 0, dislikes: art?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.undislikeArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Article.updateOne(byIdOrSlug(id), { $pull: { dislikes: { user: req.user.uid } } });
    const art = await Article.findOne(byIdOrSlug(id)).select('likes dislikes');
    res.json({ likes: art?.likes?.length || 0, dislikes: art?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.addComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = z.object({ content: z.string().min(1) }).parse(req.body || {});
    const update = { $push: { comments: { author: req.user.uid, content: body.content, likes: [] } } };
    const art = await Article.findOneAndUpdate(byIdOrSlug(id), update, { new: true });
    if (!art) return res.status(404).json({ message: 'Article not found' });
    res.status(201).json({ item: art.comments[art.comments.length - 1] });
  } catch (e) { next(e); }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const { id, cid } = req.params;
    // allow comment author or article author
    const art = await Article.findOne(byIdOrSlug(id)).select('author comments');
    if (!art) return res.status(404).json({ message: 'Article not found' });
    const comment = art.comments.id(cid);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (String(comment.author) !== req.user.uid && String(art.author) !== req.user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await Article.updateOne(byIdOrSlug(id), { $pull: { comments: { _id: cid } } });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.updateComment = async (req, res, next) => {
  try {
    const { id, cid } = req.params;
    const body = z.object({ content: z.string().min(1) }).parse(req.body || {});
    const safe = sanitizeHtml(body.content, { allowedTags: [], allowedAttributes: {} });
    // Only comment author can edit
    const updated = await Article.findOneAndUpdate(
      { ...byIdOrSlug(id), 'comments._id': cid, 'comments.author': req.user.uid },
      { $set: { 'comments.$.content': safe, 'comments.$.updatedAt': new Date() } },
      { new: true }
    ).select('comments');
    if (!updated) return res.status(404).json({ message: 'Comment not found or not authorized' });
    const c = updated.comments.id(cid);
    res.json({ item: c });
  } catch (e) { next(e); }
};

exports.likeComment = async (req, res, next) => {
  try {
    const { id, cid } = req.params;
    await Article.updateOne(
      { ...byIdOrSlug(id), 'comments._id': cid },
      {
        $addToSet: { 'comments.$.likes': { user: req.user.uid } },
        $pull: { 'comments.$.dislikes': { user: req.user.uid } }
      }
    );
    const art = await Article.findOne(byIdOrSlug(id)).select('comments');
    const c = art?.comments?.id(cid);
    res.json({ likes: c?.likes?.length || 0, dislikes: c?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.unlikeComment = async (req, res, next) => {
  try {
    const { id, cid } = req.params;
    await Article.updateOne(
      { ...byIdOrSlug(id), 'comments._id': cid },
  { $pull: { 'comments.$.likes': { user: req.user.uid } } }
    );
    const art = await Article.findOne(byIdOrSlug(id)).select('comments');
    const c = art?.comments?.id(cid);
    res.json({ likes: c?.likes?.length || 0, dislikes: c?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.dislikeComment = async (req, res, next) => {
  try {
    const { id, cid } = req.params;
    await Article.updateOne(
      { ...byIdOrSlug(id), 'comments._id': cid },
      {
        $addToSet: { 'comments.$.dislikes': { user: req.user.uid } },
        $pull: { 'comments.$.likes': { user: req.user.uid } }
      }
    );
    const art = await Article.findOne(byIdOrSlug(id)).select('comments');
    const c = art?.comments?.id(cid);
    res.json({ likes: c?.likes?.length || 0, dislikes: c?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};

exports.undislikeComment = async (req, res, next) => {
  try {
    const { id, cid } = req.params;
    await Article.updateOne(
      { ...byIdOrSlug(id), 'comments._id': cid },
      { $pull: { 'comments.$.dislikes': { user: req.user.uid } } }
    );
    const art = await Article.findOne(byIdOrSlug(id)).select('comments');
    const c = art?.comments?.id(cid);
    res.json({ likes: c?.likes?.length || 0, dislikes: c?.dislikes?.length || 0 });
  } catch (e) { next(e); }
};
