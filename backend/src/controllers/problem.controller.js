const { z } = require('zod');
const Problem = require('../models/Problem');

exports.listProblems = async (req, res, next) => {
  try {
    const items = await Problem.find().sort({ createdAt: -1 }).select('title slug difficulty tags createdAt');
    res.json({ items });
  } catch (e) {
    next(e);
  }
};

exports.getProblem = async (req, res, next) => {
  try {
    const item = await Problem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json({ item });
  } catch (e) {
    next(e);
  }
};

const createSchema = z.object({
  title: z.string().min(3),
  slug: z.string().min(3),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  statement: z.string().min(10),
  starterCode: z.string().optional(),
  tags: z.array(z.string()).optional()
});

exports.createProblem = async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const exists = await Problem.findOne({ slug: data.slug });
    if (exists) return res.status(409).json({ message: 'Slug already exists' });
    const created = await Problem.create(data);
    res.status(201).json({ item: created });
  } catch (e) {
    next(e);
  }
};
