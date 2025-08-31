const { Schema, model } = require('mongoose');

const criterionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    weight: { type: Number, required: true, min: 0, max: 1 },
    maxScore: { type: Number, default: 10 },
  },
  { _id: false }
);

const scoringTemplateSchema = new Schema(
  {
    name: { type: String, default: 'Default' },
    criteria: { type: [criterionSchema], default: [] },
    isDefault: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model('ScoringTemplate', scoringTemplateSchema);
