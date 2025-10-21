// src/models/Result.js
const { Schema, model } = require('mongoose');

const AnswerSchema = new Schema(
  {
    code: { type: String, required: true },   // question code (e.g., "Q1")
    option: { type: Number, required: true }, // selected option index (0-based preferred)
    score: { type: Number },                  // optional client-computed
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ResultSchema = new Schema(
  {
    // who + which test
    name: { type: String, required: true, trim: true },
    themeId: { type: Schema.Types.ObjectId, ref: 'Theme', required: true, index: true },

    // optional identity hooks
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    sessionId: { type: String },

    // computed on server
    personalityType: { type: String, index: true }, // e.g. "INTJ"
    summary: { type: String }, // duplicate of personalityType if you still consume 'summary'

    // letter scores (E/I/S/N/T/F/J/P) as a Map
    scores: { type: Map, of: Number },

    // tags you may want to store (could mirror profile traits if you wish)
    traits: [{ type: String }],

    // raw answers for traceability
    answers: [AnswerSchema],

    // visibility + misc
    isPublic: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

ResultSchema.index({ themeId: 1, createdAt: -1 });
module.exports = model('Result', ResultSchema);
