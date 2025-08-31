const { Schema, model } = require('mongoose');

const scoreSchema = new Schema(
  {
    criterion: String,
    score: Number,
    notes: String
  },
  { _id: false }
);

const criterionTemplateSchema = new Schema(
  {
    key: String,
    label: String,
    weight: Number, // 0..1
    maxScore: { type: Number, default: 10 },
  },
  { _id: false }
);

const scoringTemplateSchema = new Schema(
  {
    name: { type: String, default: 'Default' },
    criteria: [criterionTemplateSchema],
  },
  { _id: false }
);

const sessionSchema = new Schema(
  {
    interviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
    status: { type: String, enum: ['scheduled', 'live', 'completed', 'cancelled'], default: 'scheduled' },
    startedAt: Date,
    endedAt: Date,
    codeSnapshots: [
      {
        at: { type: Date, default: Date.now },
        code: String,
        language: { type: String, default: 'javascript' }
      }
    ],
    interviewerScores: [scoreSchema],
  scoringTemplate: scoringTemplateSchema,
    finalDecision: { type: String, enum: ['selected', 'rejected', 'on-hold'] },
    notes: String,
    roomId: { type: String, index: true }
  },
  { timestamps: true }
);

module.exports = model('Session', sessionSchema);
