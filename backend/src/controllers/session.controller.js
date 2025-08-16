const { z } = require('zod');
const Session = require('../models/Session');
const mongoose = require('mongoose');

const createSchema = z.object({
  interviewer: z.string(),
  candidate: z.string(),
  problem: z.string(),
  scheduledAt: z.string().datetime().optional(),
});

exports.createSession = async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const roomId = new Date().getTime().toString(36) + Math.random().toString(36).slice(2,8)
    const created = await Session.create({
      interviewer: data.interviewer,
      candidate: data.candidate,
      problem: data.problem,
      status: 'scheduled',
      roomId,
    });
    res.status(201).json({ item: created });
  } catch (e) {
    next(e);
  }
};

exports.getSession = async (req, res, next) => {
  try {
    const id = req.params.id;
    let s = null;
    if (mongoose.isValidObjectId(id)) {
      s = await Session.findById(id).populate('interviewer candidate problem');
    }
    if (!s) {
      s = await Session.findOne({ roomId: id }).populate('interviewer candidate problem');
    }
    if (!s) return res.status(404).json({ message: 'Not found' });
    res.json({ item: s });
  } catch (e) {
    next(e);
  }
};

// Set or change the problem for a session (interviewer only)
const setProblemSchema = z.object({ problem: z.string() });
exports.setProblem = async (req, res, next) => {
  try {
    const { problem } = setProblemSchema.parse(req.body);
    const s0 = await Session.findById(req.params.id);
    if (!s0) return res.status(404).json({ message: 'Not found' });
    if (s0.interviewer?.toString() !== req.user.uid) return res.status(403).json({ message: 'Forbidden' });
    const s = await Session.findByIdAndUpdate(
      req.params.id,
      { problem },
      { new: true }
    ).populate('interviewer candidate problem');
    res.json({ item: s });
  } catch (e) {
    next(e);
  }
};

const statusSchema = z.object({ status: z.enum(['scheduled', 'live', 'completed', 'cancelled']) });
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const s0 = await Session.findById(req.params.id);
    if (!s0) return res.status(404).json({ message: 'Not found' });
    if (s0.interviewer?.toString() !== req.user.uid) return res.status(403).json({ message: 'Forbidden' });
    const s = await Session.findByIdAndUpdate(
      req.params.id,
      { status, startedAt: status==='live'? new Date(): s0.startedAt, endedAt: status==='completed'? new Date(): s0.endedAt },
      { new: true }
    );
    res.json({ item: s });
  } catch (e) {
    next(e);
  }
};

const scoreSchema = z.object({ scores: z.array(z.object({ criterion: z.string(), score: z.number().min(0).max(10), notes: z.string().optional() })) });
exports.addScore = async (req, res, next) => {
  try {
    const { scores } = scoreSchema.parse(req.body);
    const s0 = await Session.findById(req.params.id);
    if (!s0) return res.status(404).json({ message: 'Not found' });
    if (s0.interviewer?.toString() !== req.user.uid) return res.status(403).json({ message: 'Forbidden' });
    // Replace existing scores with the latest submission to avoid duplicates
    const s = await Session.findByIdAndUpdate(
      req.params.id,
      { $set: { interviewerScores: scores } },
      { new: true }
    );
    res.json({ item: s });
  } catch (e) {
    next(e);
  }
};

const decisionSchema = z.object({ decision: z.enum(['selected', 'rejected', 'on-hold']), notes: z.string().optional() });
exports.finalizeDecision = async (req, res, next) => {
  try {
    const { decision, notes } = decisionSchema.parse(req.body);
    const s = await Session.findByIdAndUpdate(
      req.params.id,
      { finalDecision: decision, notes, endedAt: new Date(), status: 'completed' },
      { new: true }
    );
    if (!s) return res.status(404).json({ message: 'Not found' });

    // Compute average score
    const scores = s.interviewerScores || [];
    const avg = scores.length ? scores.reduce((acc, it) => acc + (it.score || 0), 0) / scores.length : 0;

    // Update candidate metrics
    const User = require('../models/User');
    const candidate = await User.findById(s.candidate);
    if (candidate) {
      const newCount = (candidate.ratingCount || 0) + (scores.length ? 1 : 0);
      const newRating = scores.length
        ? ((candidate.rating || 0) * (candidate.ratingCount || 0) + avg) / newCount
        : candidate.rating || 0;
      candidate.pastInterviews.push({ session: s._id, date: new Date(), score: avg, decision });
      candidate.rating = newRating;
      candidate.ratingCount = newCount;
      await candidate.save();
    }

    res.json({ item: s, avgScore: avg });
  } catch (e) {
    next(e);
  }
};

const codeSchema = z.object({ code: z.string().min(0), language: z.string().optional() });
exports.addCodeSnapshot = async (req, res, next) => {
  try {
    const { code, language } = codeSchema.parse(req.body);
    const s0 = await Session.findById(req.params.id);
    if (!s0) return res.status(404).json({ message: 'Not found' });
    const isParticipant = [s0.interviewer?.toString(), s0.candidate?.toString()].includes(req.user.uid);
    if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });
    const s = await Session.findByIdAndUpdate(req.params.id, { $push: { codeSnapshots: { code, language } } }, { new: true });
    res.json({ item: s });
  } catch (e) {
    next(e);
  }
};

// List sessions for current user (as interviewer or candidate)
exports.listMySessions = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const items = await Session.find({ $or: [{ interviewer: uid }, { candidate: uid }] })
      .sort({ createdAt: -1 })
      .populate('interviewer candidate problem');
    res.json({ items });
  } catch (e) {
    next(e);
  }
};
