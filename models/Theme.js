// src/models/Theme.js
const mongoose = require('mongoose');
const { slugify } = require('../utils/slugify');

const PairTitleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const ThemeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, unique: true },
    description: { type: String, required: true, trim: true },
    gradient: { type: String, required: true, trim: true },
    iconKey: { type: String, required: true, trim: true },
    features: { type: [String], default: [] },
    order: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },

    // NEW: optional group titles per MBTI pair
    pairTitles: {
      EI: { type: PairTitleSchema, required: false },
      SN: { type: PairTitleSchema, required: false },
      TF: { type: PairTitleSchema, required: false },
      JP: { type: PairTitleSchema, required: false }
    }
  },
  { timestamps: true }
);

ThemeSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  }
  next();
});

ThemeSchema.index({ title: 'text', description: 'text', features: 'text' });

const Theme = mongoose.model('Theme', ThemeSchema);
module.exports = Theme;
