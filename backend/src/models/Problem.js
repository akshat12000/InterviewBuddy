const { Schema, model } = require('mongoose');

const problemSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    statement: { type: String, required: true },
    starterCode: { type: String },
    tags: [String]
  },
  { timestamps: true }
);

module.exports = model('Problem', problemSchema);
