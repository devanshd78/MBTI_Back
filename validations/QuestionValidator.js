// src/validations/question.validation.js
const { z } = require('zod');

const pairTitlesSchema = z
  .object({
    EI: z.object({ title: z.string().min(1) }).optional(),
    SN: z.object({ title: z.string().min(1) }).optional(),
    TF: z.object({ title: z.string().min(1) }).optional(),
    JP: z.object({ title: z.string().min(1) }).optional()
  })
  .partial()
  .optional();

const optionSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1)
});

const scoreSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1)
});

const questionSchema = z.object({
  code: z.string().min(1),                                  // e.g., "EI-01"
  dimension: z.enum(['EI', 'SN', 'TF', 'JP']),
  title: z.string().min(1),
  scenario: z.string().min(1),
  options: optionSchema,
  scores: scoreSchema
})
.refine(q => {
  const ok = {
    EI: ['E', 'I'],
    SN: ['S', 'N'],
    TF: ['T', 'F'],
    JP: ['J', 'P']
  }[q.dimension];

  return ok.includes(q.scores.A) && ok.includes(q.scores.B);
}, { message: 'scores.A and scores.B must match the question dimension letters.' });

const bulkUpsertQuestionsSchema = z.object({
  params: z.object({ id: z.string().min(1) }), // themeId
  body: z.object({
    pairTitles: pairTitlesSchema,
    questions: z.array(questionSchema).min(1)
  })
});

const idWithQuerySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    dimension: z.enum(['EI', 'SN', 'TF', 'JP']).optional()
  }).optional()
});

const slugParamSchema = z.object({
  params: z.object({ slug: z.string().min(1) })
});

module.exports = {
  bulkUpsertQuestionsSchema,
  idWithQuerySchema,
  slugParamSchema
};
