// scripts/rescore-results.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); // .env ONLY

const mongoose = require('mongoose');
const Result = require('../models/Result');
const Question = require('../models/Question');
const MBTIPersonality = require('../models/MBTIPersonality');

// ----------------- scoring helpers -----------------
const LETTERS = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'];
const PAIRS = [
  ['E', 'I'],
  ['S', 'N'],
  ['T', 'F'],
  ['J', 'P'],
];

function getOptionsLength(q) {
  const opts = q?.options;
  if (Array.isArray(opts)) return opts.length;
  if (opts && typeof opts === 'object') return Object.keys(opts).length;
  return 2;
}

// Normalize chosen option to a 0-based index given options length (if known)
function normalizeOptionIndex(chosen, optionsLen) {
  if (Number.isInteger(chosen)) {
    if (optionsLen == null) return chosen < 0 ? 0 : chosen;
    if (chosen >= 0 && chosen < optionsLen) return chosen;
    if (chosen === optionsLen) return chosen - 1; // sloppy 1-based last
    return Math.max(0, Math.min(optionsLen - 1, chosen - 1));
  }
  const n = Number(chosen);
  if (!Number.isNaN(n)) return n;
  return 0;
}

// Apply scoring for a single question/answer index across supported shapes
function applyScoring(acc, question, optIdx) {
  const scores = question.scores;

  // A) Array-of-deltas: scores[optIdx] is an object like { E:1 }
  if (Array.isArray(scores)) {
    const entry = scores[optIdx] || {};
    for (const k of Object.keys(entry)) {
      const K = String(k).toUpperCase();
      if (!LETTERS.includes(K)) continue;
      acc[K] = (acc[K] || 0) + Number(entry[k] || 0);
    }
    return;
  }

  if (scores && typeof scores === 'object') {
    // A.1) Option-label map: { A:'E', B:'I' } or { A:['E','N'] }
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const label = optionLabels[optIdx] ?? String(optIdx);
    if (Object.prototype.hasOwnProperty.call(scores, label)) {
      const val = scores[label];
      const letters = Array.isArray(val) ? val : String(val || '').split('');
      for (const raw of letters) {
        const L = String(raw).toUpperCase();
        if (LETTERS.includes(L)) acc[L] = (acc[L] || 0) + 1;
      }
      return;
    }

    // B) Letter-map: { E:[1,0], I:[0,1] } or { E:1, I:0 }
    let matchedLetterMap = false;
    for (const k of Object.keys(scores)) {
      const K = String(k).toUpperCase();
      if (!LETTERS.includes(K)) continue;
      matchedLetterMap = true;
      const v = scores[k];
      const add = Array.isArray(v) ? Number(v[optIdx] || 0) : Number(v || 0);
      acc[K] = (acc[K] || 0) + add;
    }
    if (matchedLetterMap) return;
  }

  // C) Fallback: decide by dimension + index position
  const dim = String(question.dimension || '').toUpperCase().replace(/[^A-Z]/g, '');
  const [a, b] = [dim[0], dim[1]];
  if (LETTERS.includes(a) && LETTERS.includes(b)) {
    const n = getOptionsLength(question) ?? 2;
    const midpoint = (n - 1) / 2;
    const chosen = optIdx > midpoint ? b : (optIdx < midpoint ? a : null);
    if (chosen) acc[chosen] = (acc[chosen] || 0) + 1;
  }
}

function decideType(letterTotals) {
  const out = [];
  for (const [a, b] of PAIRS) {
    const sa = Number(letterTotals[a] || 0);
    const sb = Number(letterTotals[b] || 0);
    out.push(sa > sb ? a : (sb > sa ? b : b)); // tie => second letter
  }
  return out.join('');
}

// ----------------- main -----------------
(async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Set MONGO_URI (or MONGODB_URI) in backend/.env');

    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    // Optional: pass a themeId to limit scope: node scripts/rescore-results.js <themeId>
    const themeFilter =
      process.argv[2] && process.argv[2] !== '--all' ? { themeId: process.argv[2] } : {};

    let scanned = 0;
    let updated = 0;

    const cursor = Result.find(themeFilter).lean().cursor();
    for await (const r of cursor) {
      scanned++;

      const qs = await Question.find({ themeId: r.themeId }).lean();
      const qMap = new Map(qs.map(q => [q.code, q]));

      const totals = {};
      for (const a of r.answers || []) {
        const q = qMap.get(a.code);
        if (!q) continue;
        const optIdx = normalizeOptionIndex(a.option, getOptionsLength(q));
        applyScoring(totals, q, optIdx);
      }

      const type = decideType(totals);

      // Update only if type or scores changed
      const needsUpdate =
        type !== r.personalityType ||
        JSON.stringify(r.scores || {}) !== JSON.stringify(totals);

      if (needsUpdate) {
        const personality = await MBTIPersonality.findOne({ type }).lean();
        await Result.updateOne(
          { _id: r._id },
          {
            $set: {
              personalityType: type,
              summary: type,
              scores: totals,
              traits: Array.isArray(personality?.traits) ? personality.traits : r.traits,
            },
          }
        );
        updated++;
        console.log(`↺ ${r._id} ${r.personalityType || '—'} → ${type}`);
      }

      if (scanned % 100 === 0) {
        console.log(`...processed ${scanned} (updated ${updated})`);
      }
    }

    console.log(`✅ Done. Scanned ${scanned}, updated ${updated}.`);
  } catch (err) {
    console.error('❌ Rescore failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
