// src/controllers/question.controller.js
const mongoose = require('mongoose');
const Theme = require('../models/Theme');
const Question = require('../models/Question');

async function bulkUpsertQuestions(req, res) {
  try {
    const themeId = req.params.id;
    if (!mongoose.isValidObjectId(themeId)) {
      return res.status(400).json({ success: false, message: 'Invalid theme id' });
    }

    const theme = await Theme.findById(themeId);
    if (!theme) return res.status(404).json({ success: false, message: 'Theme not found' });

    const { pairTitles, questions } = req.body || {};
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'No questions provided' });
    }

    // Apply/merge pairTitles if provided
    if (pairTitles && Object.keys(pairTitles).length > 0) {
      theme.pairTitles = { ...theme.pairTitles, ...pairTitles };
      await theme.save();
    }

    // Ensure options are normalized { A, B } even if middleware was bypassed
    const normalized = questions.map((q) => {
      const opts = Array.isArray(q.options)
        ? { A: q.options[0], B: q.options[1] }
        : q.options;
      return { ...q, options: opts };
    });

    // Prepare bulk upserts
    const ops = normalized.map((q) => ({
      updateOne: {
        filter: { themeId, code: q.code },
        update: {
          $set: {
            themeId,
            code: q.code,
            dimension: q.dimension,
            title: q.title,
            scenario: q.scenario,
            options: q.options,
            scores: q.scores
          }
        },
        upsert: true
      }
    }));

    // Note: bulkWrite doesn't run mongoose validators on updates.
    // Our Zod gate takes care of shape; we also rely on Mongo unique index.
    const result = await Question.bulkWrite(ops, { ordered: false });

    return res.json({
      success: true,
      data: {
        upserted: result.upsertedCount || 0,
        modified: result.modifiedCount || 0,
        matched: result.matchedCount || 0
      }
    });
  } catch (err) {
    // Duplicate key or bulk write structure errors
    if (err && err.writeErrors && Array.isArray(err.writeErrors)) {
      const details = err.writeErrors.map((we) => {
        const op = we.op?.updateOne || {};
        const set = op.update?.$set || {};
        return {
          index: we.index,
          code: set.code,
          dimension: set.dimension,
          reason: we.errmsg || we.message || 'Bulk write error'
        };
      });

      return res.status(400).json({
        success: false,
        message: 'Bulk upsert failed for one or more questions',
        error: 'BULK_WRITE_ERROR',
        details
      });
    }

    // Classic duplicate key error outside of writeErrors
    if (err?.code === 11000 || /E11000/.test(err?.message || '')) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error on question code within this theme',
        error: 'DUPLICATE_KEY',
        details: err.keyValue || err.message
      });
    }

    // Fallback
    return res.status(500).json({
      success: false,
      message: 'Unexpected error during bulk upsert',
      error: err?.message || String(err)
    });
  }
}

async function listQuestionsByTheme(req, res) {
  const themeId = req.params.id;
  if (!mongoose.isValidObjectId(themeId)) {
    return res.status(400).json({ success: false, message: 'Invalid theme id' });
  }

  const dimension = req.query?.dimension;
  const theme = await Theme.findById(themeId).lean();
  if (!theme) return res.status(404).json({ success: false, message: 'Theme not found' });

  const filter = { themeId };
  if (dimension) filter.dimension = dimension;

  const questions = await Question.find(filter).sort({ code: 1 }).lean();

  return res.json({
    success: true,
    data: {
      themeId,
      pairTitles: theme.pairTitles || null,
      questions
    }
  });
}

module.exports = {
  bulkUpsertQuestions,
  listQuestionsByTheme
};
