const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['interviewer', 'candidate'], required: true },
    bio: String,
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    pastInterviews: [
      {
        session: { type: Schema.Types.ObjectId, ref: 'Session' },
        date: Date,
        score: Number,
        decision: { type: String, enum: ['selected', 'rejected', 'on-hold'] }
      }
    ]
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
