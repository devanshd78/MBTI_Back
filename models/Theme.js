const mongoose = require('mongoose');
const { slugify } = require('../utils/slugify');

const PairTitleSchema = new mongoose.Schema(
  { title: { type: String, required: true, trim: true } },
  { _id: false }
);

const ObjectId = mongoose.Schema.Types.ObjectId;

const ThemeBackgroundSchema = new mongoose.Schema(
  {
    fileId: { type: ObjectId, required: false },        // GridFS _id for desktop/default
    mobileFileId: { type: ObjectId, required: false },  // GridFS _id for mobile (optional)
    overlayOpacity: { type: Number, min: 0, max: 1, default: 0.35 }
  },
  { _id: false }
);

const ThemeMusicSchema = new mongoose.Schema(
  {
    fileId: { type: ObjectId, required: false },        // GridFS _id for audio
    volume: { type: Number, min: 0, max: 1, default: 0.4 },
    loop: { type: Boolean, default: true },
    autoplay: { type: Boolean, default: false }
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

    pairTitles: {
      EI: { type: PairTitleSchema, required: false },
      SN: { type: PairTitleSchema, required: false },
      TF: { type: PairTitleSchema, required: false },
      JP: { type: PairTitleSchema, required: false }
    },

    // NEW: binary assets (GridFS references)
    background: { type: ThemeBackgroundSchema, required: false },
    music: { type: ThemeMusicSchema, required: false }
  },
  { timestamps: true }
);

ThemeSchema.pre('validate', function (next) {
  if (!this.slug && this.title) this.slug = slugify(this.title);
  next();
});

ThemeSchema.index({ title: 'text', description: 'text', features: 'text' });

const Theme = mongoose.model('Theme', ThemeSchema);
module.exports = Theme;
