const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } }, { _id: false });

const CommentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  likes: [LikeSchema],
  dislikes: [LikeSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: true });

const ArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  content: { type: String, required: true },
  tags: [{ type: String }],
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  likes: [LikeSchema],
  dislikes: [LikeSchema],
  comments: [CommentSchema],
  views: { type: Number, default: 0 },
  // track unique viewers to avoid double counting; capped growth by not indexing per user elsewhere
  viewsBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ArticleSchema.virtual('score').get(function () { return (this.likes?.length || 0) + (this.comments?.length || 0) * 0.2; });

// Indexes for performance and search
ArticleSchema.index({ createdAt: -1 });
ArticleSchema.index({ views: -1 });
// Full text search on title and content
ArticleSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Article', ArticleSchema);
