// src/validations/ThemeValidator.js
const { z } = require('zod');

const pairTitlesSchema = z.object({
  EI: z.object({ title: z.string().min(1) }).optional(),
  SN: z.object({ title: z.string().min(1) }).optional(),
  TF: z.object({ title: z.string().min(1) }).optional(),
  JP: z.object({ title: z.string().min(1) }).optional(),
}).partial();

const createThemeSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'title is required'),
    slug: z.string().min(1).optional(),
    description: z.string().min(1, 'description is required'),
    gradient: z.string().min(1, 'gradient is required'),
    iconKey: z.string().min(1, 'iconKey is required'),
    features: z.array(z.string().min(1)).default([]),
    order: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
    pairTitles: pairTitlesSchema.optional(), // ← allow on create too (optional)
  })
});

const updateThemeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    title: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    gradient: z.string().min(1).optional(),
    iconKey: z.string().min(1).optional(),
    features: z.array(z.string().min(1)).optional(),
    order: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
    pairTitles: pairTitlesSchema.optional(), // ← add this
  })
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) })
});

module.exports = { createThemeSchema, updateThemeSchema, idParamSchema };
