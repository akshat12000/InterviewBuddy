const { z } = require('zod');
const User = require('../models/User');
const Session = require('../models/Session');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.uid).select('-password');
    res.json({ user });
  } catch (e) {
    next(e);
  }
};

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  bio: z.string().max(500).optional()
});

exports.updateProfile = async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(req.user.uid, data, { new: true }).select('-password');
    res.json({ user });
  } catch (e) {
    next(e);
  }
};

exports.getMyInterviews = async (req, res, next) => {
  try {
    const asInterviewer = await Session.find({ interviewer: req.user.uid }).populate('candidate problem');
    const asCandidate = await Session.find({ candidate: req.user.uid }).populate('interviewer problem');
    res.json({ asInterviewer, asCandidate });
  } catch (e) {
    next(e);
  }
};

exports.findByEmail = async (req, res, next) => {
  try {
    const email = String(req.query.email || '').toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email }).select('id _id name email role');
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ user });
  } catch (e) {
    next(e);
  }
};
