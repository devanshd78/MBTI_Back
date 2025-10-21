// src/models/Question.js
const mongoose = require('mongoose');

const OptionSchema = new mongoose.Schema(
  {
    A: { type: String, required: true, trim: true },
    B: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const ScoreSchema = new mongoose.Schema(
  {
    A: { type: String, required: true, trim: true }, // e.g. "E"
    B: { type: String, required: true, trim: true }  // e.g. "I"
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    themeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theme', required: true, index: true },
    code: { type: String, required: true, trim: true },         // e.g. "EI-01"
    dimension: { type: String, enum: ['EI', 'SN', 'TF', 'JP'], required: true },
    title: { type: String, required: true, trim: true },
    scenario: { type: String, required: true, trim: true },
    options: { type: OptionSchema, required: true },
    scores: { type: ScoreSchema, required: true }
  },
  { timestamps: true }
);

// Unique per theme by code (idempotent bulk upserts)
QuestionSchema.index({ themeId: 1, code: 1 }, { unique: true });

const Question = mongoose.model('Question', QuestionSchema);
module.exports = Question;
