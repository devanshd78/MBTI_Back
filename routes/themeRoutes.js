// src/routes/theme.routes.js
const { Router } = require('express');
const {
  createTheme,
  listThemes,
  getThemeById,
  updateTheme,
  deleteTheme,
  getThemeBySlug
} = require('../controller/themeController');
const { validateResource } = require('../middleware/validateResources');
const { createThemeSchema, idParamSchema, updateThemeSchema } = require('../validations/ThemeValidator');

const { bulkUpsertQuestions, listQuestionsByTheme } = require('../controller/questionController');
const { bulkUpsertQuestionsSchema, idWithQuerySchema, slugParamSchema } = require('../validations/QuestionValidator');

const router = Router();

// THEMES (GET/POST only)
router.get('/', listThemes);
router.get('/slug/:slug', validateResource(slugParamSchema), getThemeBySlug);
router.get('/:id', validateResource(idParamSchema), getThemeById);
router.post('/', validateResource(createThemeSchema), createTheme);
router.post('/:id/update', validateResource(updateThemeSchema), updateTheme);
router.post('/:id/delete', validateResource(idParamSchema), deleteTheme);

// QUESTIONS under a THEME (GET/POST only)
router.get('/:id/questions', validateResource(idWithQuerySchema), listQuestionsByTheme);
router.post('/:id/questions/bulk', validateResource(bulkUpsertQuestionsSchema), bulkUpsertQuestions);

module.exports = router;
