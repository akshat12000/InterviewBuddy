const { z } = require('zod');
const Session = require('../models/Session');
const ScoringTemplate = require('../models/ScoringTemplate');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

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
    // attach default scoring template if exists
    let tmpl = await ScoringTemplate.findOne({ isDefault: true });
    if (!tmpl) {
      // minimal default
      tmpl = { name: 'Default', criteria: [
        { key: 'problem_solving', label: 'Problem Solving', weight: 0.4, maxScore: 10 },
        { key: 'code_quality', label: 'Code Quality', weight: 0.3, maxScore: 10 },
        { key: 'communication', label: 'Communication', weight: 0.2, maxScore: 10 },
        { key: 'culture_fit', label: 'Culture Fit', weight: 0.1, maxScore: 10 },
      ]};
    }
    const created = await Session.create({
      interviewer: data.interviewer,
      candidate: data.candidate,
      problem: data.problem,
      status: 'scheduled',
      scoringTemplate: { name: tmpl.name, criteria: tmpl.criteria },
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

// Scoring templates
exports.getDefaultScoringTemplate = async (req, res, next) => {
  try {
    const tmpl = await ScoringTemplate.findOne({ isDefault: true });
    if (!tmpl) {
      return res.json({
        template: {
          name: 'Default',
          criteria: [
            { key: 'problem_solving', label: 'Problem Solving', weight: 0.4, maxScore: 10 },
            { key: 'code_quality', label: 'Code Quality', weight: 0.3, maxScore: 10 },
            { key: 'communication', label: 'Communication', weight: 0.2, maxScore: 10 },
            { key: 'culture_fit', label: 'Culture Fit', weight: 0.1, maxScore: 10 },
          ]
        }
      });
    }
    res.json({ template: { name: tmpl.name, criteria: tmpl.criteria } });
  } catch (e) { next(e); }
};

const setTemplateSchema = z.object({
  name: z.string().min(1),
  criteria: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    weight: z.number().min(0).max(1),
    maxScore: z.number().min(1).max(100).default(10)
  })).min(1)
});

exports.setDefaultScoringTemplate = async (req, res, next) => {
  try {
    const data = setTemplateSchema.parse(req.body);
    // Normalize weights to sum ~1 if they don't
    const total = data.criteria.reduce((a, c) => a + c.weight, 0) || 1;
    const normalized = data.criteria.map(c => ({ ...c, weight: +(c.weight / total).toFixed(4) }));
    const doc = await ScoringTemplate.findOneAndUpdate(
      { isDefault: true },
      { name: data.name, criteria: normalized, isDefault: true },
      { upsert: true, new: true }
    );
    res.json({ template: { name: doc.name, criteria: doc.criteria } });
  } catch (e) { next(e); }
};

// Export PDF summary for a session
exports.exportSessionPdf = async (req, res, next) => {
  try {
    const id = req.params.id;
    const s = await Session.findById(id).populate('interviewer candidate problem');
    if (!s) return res.status(404).json({ message: 'Not found' });
    // Only interviewer or candidate can export
    const isParticipant = [s.interviewer?.id?.toString(), s.candidate?.id?.toString()].includes(req.user.uid);
    if (!isParticipant) return res.status(403).json({ message: 'Forbidden' });

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="session-${s.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).text('Interview Summary', { align: 'center' }).moveDown(0.5);
    doc.fontSize(11).text(`Session ID: ${s.id}`);
    doc.text(`Interviewer: ${s.interviewer?.name || s.interviewer}`);
    doc.text(`Candidate: ${s.candidate?.name || s.candidate}`);
    doc.text(`Problem: ${s.problem?.title || s.problem}`);
    doc.text(`Status: ${s.status}`);
    if (s.startedAt) doc.text(`Started: ${new Date(s.startedAt).toLocaleString()}`);
    if (s.endedAt) doc.text(`Ended: ${new Date(s.endedAt).toLocaleString()}`);
    doc.moveDown();

    // Scores table
    const criteria = (s.scoringTemplate?.criteria || []).filter(c =>
      String(c.key).toLowerCase() !== 'culture_fit' && String(c.label).toLowerCase() !== 'culture fit'
    );
    const scores = s.interviewerScores || [];
    const scoreMap = new Map(scores.map(x => [x.criterion, x]));
    let weightedTotal = 0, totalWeight = 0;
    doc.fontSize(13).text('Scores');
    doc.moveDown(0.5);
    doc.fontSize(11);
    criteria.forEach(c => {
      const sc = scoreMap.get(c.key) || scoreMap.get(c.label) || { score: 0, notes: '' };
      const weight = typeof c.weight === 'number' ? c.weight : 0;
      const maxScore = c.maxScore || 10;
      const normalizedScore = Math.max(0, Math.min(maxScore, sc.score || 0)) / maxScore;
      weightedTotal += normalizedScore * weight;
      totalWeight += weight;
      doc.text(`• ${c.label} (${Math.round(weight*100)}%): ${sc.score ?? '-'} / ${maxScore}`);
      if (sc.notes) doc.text(`  Notes: ${sc.notes}`);
    });
    // If no template, compute simple average
    let finalScore = 0;
    if (totalWeight > 0) finalScore = +(weightedTotal / totalWeight * 10).toFixed(2);
    else if (scores.length) finalScore = +(scores.reduce((a,it)=>a+(it.score||0),0)/scores.length).toFixed(2);
    doc.moveDown();
    doc.fontSize(12).text(`Final Score: ${finalScore}/10`);

    // Decision and notes
    if (s.finalDecision) doc.text(`Decision: ${s.finalDecision}`);
    if (s.notes) {
      doc.moveDown(0.5);
      doc.fontSize(12).text('Final Notes:');
      doc.fontSize(11).text(s.notes);
    }

    doc.end();
  } catch (e) {
    next(e);
  }
};
