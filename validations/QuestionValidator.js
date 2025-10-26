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

// Accept either { A, B } or ["A text", "B text"] and normalize to { A, B }
const optionSchema = z
  .union([
    z.object({
      A: z.string().min(1),
      B: z.string().min(1)
    }),
    z.array(z.string().min(1)).length(2)
  ])
  .transform((val) => (Array.isArray(val) ? { A: val[0], B: val[1] } : val));

const scoreSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1)
});

const questionSchema = z
  .object({
    code: z.string().min(1), // e.g., "EI1"
    dimension: z.enum(['EI', 'SN', 'TF', 'JP']),
    title: z.string().min(1),
    scenario: z.string().min(1),
    options: optionSchema,
    scores: scoreSchema
  })
  .superRefine((q, ctx) => {
    const ok = {
      EI: ['E', 'I'],
      SN: ['S', 'N'],
      TF: ['T', 'F'],
      JP: ['J', 'P']
    }[q.dimension];

    if (!ok.includes(q.scores.A) || !ok.includes(q.scores.B)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scores.A and scores.B must match the question dimension letters.',
        path: ['scores']
      });
    }
  });

const bulkUpsertQuestionsSchema = z.object({
  params: z.object({ id: z.string().min(1) }), // themeId
  body: z.object({
    pairTitles: pairTitlesSchema,
    questions: z.array(questionSchema).min(1)
  })
});

const idWithQuerySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z
    .object({
      dimension: z.enum(['EI', 'SN', 'TF', 'JP']).optional()
    })
    .optional()
});

const slugParamSchema = z.object({
  params: z.object({ slug: z.string().min(1) })
});

module.exports = {
  bulkUpsertQuestionsSchema,
  idWithQuerySchema,
  slugParamSchema
};
