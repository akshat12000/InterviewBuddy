const { Schema, model } = require('mongoose');

const scoreSchema = new Schema(
  {
    criterion: String,
    score: Number,
    notes: String
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
    finalDecision: { type: String, enum: ['selected', 'rejected', 'on-hold'] },
    notes: String,
    roomId: { type: String, index: true }
  },
  { timestamps: true }
);

module.exports = model('Session', sessionSchema);
