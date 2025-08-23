const express = require('express');
const { auth, optionalAuth } = require('../utils/auth');
const ctrl = require('../controllers/article.controller');

const router = express.Router();

// list & read
router.get('/', optionalAuth, ctrl.listArticles);
router.get('/:id', optionalAuth, ctrl.getArticle);

// create/update/delete
router.post('/', auth, ctrl.createArticle);
router.put('/:id', auth, ctrl.updateArticle);
router.delete('/:id', auth, ctrl.deleteArticle);

// likes
router.post('/:id/like', auth, ctrl.likeArticle);
router.post('/:id/unlike', auth, ctrl.unlikeArticle);
router.post('/:id/dislike', auth, ctrl.dislikeArticle);
router.post('/:id/undislike', auth, ctrl.undislikeArticle);

// comments
router.post('/:id/comments', auth, ctrl.addComment);
router.delete('/:id/comments/:cid', auth, ctrl.deleteComment);
router.post('/:id/comments/:cid/like', auth, ctrl.likeComment);
router.post('/:id/comments/:cid/unlike', auth, ctrl.unlikeComment);
router.post('/:id/comments/:cid/dislike', auth, ctrl.dislikeComment);
router.post('/:id/comments/:cid/undislike', auth, ctrl.undislikeComment);

module.exports = router;
