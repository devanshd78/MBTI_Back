// server/routes/resultRoutes.js
const express = require('express');
const router = express.Router();

const {
  createResult,
  getResultById,
  listResultsByTheme,
  shareResultByEmail,
  deleteResult
} = require('../controller/resultController'); // <-- fixed path

// Create + compute result for a theme
router.post('/:id/theme', createResult);

// List results for a theme (optional ?include=personality)
router.get('/:id/theme', listResultsByTheme);

// Show single result (enriched with personality)
router.get('/:id', getResultById);
router.post('/:id/share-email', shareResultByEmail);
router.delete('/:id', deleteResult);

module.exports = router;
