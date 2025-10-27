// src/controllers/result.controller.js
const { isValidObjectId } = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Theme = require('../models/Theme');
const Question = require('../models/Question'); // <-- needed for scoring
const Result = require('../models/Result');
const MBTIPersonality = require('../models/MBTIPersonality');
const { ok } = require('../utils/APIResponse');
const { ApiError } = require('../utils/APIError');

// ----------------- helpers -----------------
const LETTERS = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'];
const PAIRS = [
  ['E', 'I'],
  ['S', 'N'],
  ['T', 'F'],
  ['J', 'P'],
];

function parseSort(s) {
  return String(s || '-createdAt')
    .split(',')
    .reduce((acc, part) => {
      const [keyRaw, dirRaw] = part.split(':');
      const key = keyRaw.trim();
      const dir = (dirRaw?.trim() || (key.startsWith('-') ? 'desc' : 'asc')).toLowerCase();
      const cleanKey = key.replace(/^-/, '');
      acc[cleanKey] = dir === 'desc' ? -1 : 1;
      return acc;
    }, {});
}

// Normalize chosen option to 0-based index, if we know options length
function normalizeOptionIndex(chosen, optionsLen) {
  if (Number.isInteger(chosen) && chosen >= 0 && chosen < (optionsLen ?? Infinity)) return chosen;
  if (Number.isInteger(chosen) && optionsLen && chosen === optionsLen) return chosen - 1; // sloppy 1-based last
  if (Number.isInteger(chosen) && chosen > 0 && optionsLen) return Math.max(0, Math.min(optionsLen - 1, chosen - 1));
  return Number(chosen) || 0; // fallback
}

function applyScoring(acc, question, optIdx) {
  const scores = question.scores;

  // Case A: scores is an array where each index is an object of letter deltas
  if (Array.isArray(scores)) {
    const entry = scores[optIdx] || {};
    for (const k of Object.keys(entry)) {
      if (!LETTERS.includes(k)) continue;
      acc[k] = (acc[k] || 0) + Number(entry[k] || 0);
    }
    return;
  }

  // Case A.1: scores is an OPTION-LABEL map, e.g. { A: 'E', B: 'I' } or { A: ['E','N'], B: ['I'] }
  if (scores && typeof scores === 'object' && !Array.isArray(scores)) {
    const optionLabels = ['A','B','C','D','E','F'];
    const label = optionLabels[optIdx] ?? String(optIdx);
    if (Object.prototype.hasOwnProperty.call(scores, label)) {
      const val = scores[label];
      const letters = Array.isArray(val) ? val : String(val || '').split('');
      for (const raw of letters) {
        const L = String(raw).toUpperCase();
        if (LETTERS.includes(L)) {
          acc[L] = (acc[L] || 0) + 1;
        }
      }
      return;
    }
  }

  // Case B: scores is a map of letter -> [per-option values] OR letter -> constant
  if (scores && typeof scores === 'object' && !Array.isArray(scores)) {
    let matchedLetterMap = false;
    for (const k of Object.keys(scores)) {
      if (!LETTERS.includes(k)) continue;
      matchedLetterMap = true;
      const v = scores[k];
      const add = Array.isArray(v) ? Number(v[optIdx] || 0) : Number(v || 0);
      acc[k] = (acc[k] || 0) + add;
    }
    if (matchedLetterMap) return;
    // If keys weren't letters and we didn't score, fall through to the dimension fallback
  }

  // Case C: no usable scores; infer from dimension + option index
  if (question.dimension && typeof question.dimension === 'string') {
    const dim = question.dimension.toUpperCase().replace(/[^A-Z]/g, '');
    const [a, b] = [dim[0], dim[1]];
    if (LETTERS.includes(a) && LETTERS.includes(b)) {
      // use options length if it's an array; otherwise assume 2
      const n = Array.isArray(question.options) ? question.options.length : 2;
      const midpoint = (n - 1) / 2;
      const chosenLetter = optIdx > midpoint ? b : (optIdx < midpoint ? a : null);
      if (chosenLetter) acc[chosenLetter] = (acc[chosenLetter] || 0) + 1;
    }
  }
}


// Turn letter totals into a 4-letter MBTI code (tie breaks to second letter for determinism)
function decideType(letterTotals) {
  const out = [];
  for (const [a, b] of PAIRS) {
    const sa = Number(letterTotals[a] || 0);
    const sb = Number(letterTotals[b] || 0);
    out.push(sa > sb ? a : (sb > sa ? b : b)); // tie -> b
  }
  return out.join('');
}

// hydrate MBTI personality profile
async function attachPersonality(type) {
  if (!type) return null;
  const profile = await MBTIPersonality.findOne({ type: String(type).toUpperCase() }).lean();
  return profile || null;
}

// ----------------- controllers -----------------

/**
 * POST /themes/:id/results
 * Body: { name: string, answers: [{ code: string, option: number }], isPublic?, meta? }
 * Computes MBTI on server, stores Result, and returns { result, personality }
 */
async function createResult(req, res) {
  const { id: themeId } = req.params;
  if (!isValidObjectId(themeId)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid theme id');

  const theme = await Theme.findById(themeId).lean();
  if (!theme) throw new ApiError(StatusCodes.NOT_FOUND, 'Theme not found');

  const { name, answers = [], isPublic = false, meta, userId, sessionId } = req.body || {};
  if (!name || typeof name !== 'string') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Name is required');
  }

  // Pull all questions for this theme once
  const qMap = new Map();
  const questions = await Question.find({ themeId }).lean();
  for (const q of questions) qMap.set(q.code, q);

  // Aggregate letter scores
  const totals = {};
  for (const ans of answers) {
    const q = qMap.get(ans.code);
    if (!q) continue;
    const optIdx = normalizeOptionIndex(ans.option, Array.isArray(q.options) ? q.options.length : undefined);
    applyScoring(totals, q, optIdx);
  }

  // Decide MBTI type from letter totals
  const mbtiType = decideType(totals);

  // Optional: copy profile traits into result.traits (snapshot)
  const personality = await attachPersonality(mbtiType);
  const snapshotTraits = Array.isArray(personality?.traits) ? personality.traits : undefined;

  // Build & save Result
  const payload = {
    name,
    themeId,
    userId: userId || undefined,
    sessionId: sessionId || undefined,
    personalityType: mbtiType,
    summary: mbtiType, // keep legacy field if your FE reads 'summary'
    scores: totals,    // Map<string, number> is fine; mongoose handles plain objects into Map
    traits: snapshotTraits,
    answers: Array.isArray(answers) ? answers : [],
    isPublic: !!isPublic,
    meta: meta || undefined,
  };

  const doc = await Result.create(payload);

  // Return enriched
  return res
    .status(StatusCodes.CREATED)
    .json(ok({ ...doc.toObject(), personality }));
}

/**
 * GET /results/:id
 * Returns saved Result + attached personality
 */
async function getResultById(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');

  const doc = await Result.findById(id).lean();
  if (!doc) throw new ApiError(StatusCodes.NOT_FOUND, 'Result not found');

  const personality = await attachPersonality(doc.personalityType || doc.summary);
  return res.json(ok({ ...doc, personality }));
}

/**
 * GET /themes/:id/results
 * List results (pagination & optional filters), WITHOUT/with personality (toggle via ?include=personality)
 */
async function listResultsByTheme(req, res) {
  const { id: themeId } = req.params;
  if (!isValidObjectId(themeId)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid theme id');

  const themeExists = await Theme.exists({ _id: themeId });
  if (!themeExists) throw new ApiError(StatusCodes.NOT_FOUND, 'Theme not found');

  const { page = '1', limit = '10', sort = '-createdAt', userId, isPublic, include } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const sortObj = parseSort(sort);
  const filter = { themeId };

  if (userId) {
    if (!isValidObjectId(userId)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid userId');
    filter.userId = userId;
  }
  if (typeof isPublic !== 'undefined') {
    filter.isPublic = isPublic === 'true' || isPublic === '1';
  }

  const [items, total] = await Promise.all([
    Result.find(filter).sort(sortObj).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Result.countDocuments(filter),
  ]);

  let data = items;
  if (String(include).toLowerCase() === 'personality') {
    // attach in parallel
    const enriched = await Promise.all(
      items.map(async (it) => {
        const personality = await attachPersonality(it.personalityType || it.summary);
        return { ...it, personality };
      })
    );
    data = enriched;
  }

  return res.json(
    ok(data, {
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  );
}

/**
 * PATCH /results/:id
 * Allows narrow updates
 */
async function updateResult(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');

  const allowed = ['name', 'summary', 'personalityType', 'scores', 'traits', 'answers', 'meta', 'isPublic', 'sessionId', 'userId'];
  const update = {};
  for (const key of allowed) {
    if (key in req.body) update[key] = req.body[key];
  }

  const doc = await Result.findByIdAndUpdate(id, update, { new: true, runValidators: true, lean: true });
  if (!doc) throw new ApiError(StatusCodes.NOT_FOUND, 'Result not found');

  const personality = await attachPersonality(doc.personalityType || doc.summary);
  return res.json(ok({ ...doc, personality }));
}

/**
 * DELETE /results/:id
 */
async function deleteResult(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');

  const doc = await Result.findByIdAndDelete(id);
  if (!doc) throw new ApiError(StatusCodes.NOT_FOUND, 'Result not found');

  return res.status(StatusCodes.NO_CONTENT).send();
}

// ...existing imports
const { sendMail } = require('../utils/mailer');

function buildResultEmailHTML({ name, result, personality, link }) {
  const p = personality || {};
  const type = (p.type || result?.personalityType || result?.summary || '—').toUpperCase();
  const title = p.title || '';
  const description = p.description || '';

  const traits = (p.traits || []).map(t => `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 10px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#0f172a;font-size:13px;line-height:1">${escapeHtml(t)}</span>`).join('');
  const strengths = (p.strengths || []).map(t => `<li style="margin:0 0 6px 0">${escapeHtml(t)}</li>`).join('');
  const growth = (p.growth || []).map(t => `<li style="margin:0 0 6px 0">${escapeHtml(t)}</li>`).join('');
  const comms = (p.communicationStyle || []).map(t => `<li style="margin:0 0 6px 0">${escapeHtml(t)}</li>`).join('');
  const collab = (p.collaborationTips || []).map(t => `<li style="margin:0 0 6px 0">${escapeHtml(t)}</li>`).join('');

  const accent = pickAccent(type); // {bg, text, border}

  // hidden preheader (improves open-rate)
  const preheader = `Your ${type} result${name ? ` for ${name}` : ''} — ${title}`;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(type)} — ${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1220;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;max-height:0;max-width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1220;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
            <!-- Header -->
            <tr>
              <td style="padding:24px 24px;border-bottom:1px solid #e2e8f0;background:${accent.bg};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left">
                      <div style="font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;color:${accent.text};opacity:0.9;margin-bottom:6px;">
                        MBTI Result${name ? ` for ${escapeHtml(name)}` : ''}
                      </div>
                      <div style="font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-weight:800;font-size:24px;line-height:1.25;color:${accent.text}">
                        ${escapeHtml(type)} <span style="opacity:0.9">— ${escapeHtml(title)}</span>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <!-- Description -->
                  ${description ? `
                    <tr>
                      <td style="padding:0 0 18px 0;">
                        <p style="margin:0;font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#334155;">
                          ${escapeHtml(description)}
                        </p>
                      </td>
                    </tr>
                  ` : ''}

                  <!-- Traits -->
                  ${traits ? `
                    <tr>
                      <td style="padding:0 0 8px 0;">
                        <h4 style="margin:0 0 8px 0;font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#0f172a;text-transform:uppercase;letter-spacing:.02em;">Core Traits</h4>
                        <div>${traits}</div>
                      </td>
                    </tr>
                  ` : ''}

                  <!-- Strengths -->
                  ${strengths ? sectionList('Strengths', strengths) : ''}

                  <!-- Growth -->
                  ${growth ? sectionList('Growth Edges', growth) : ''}

                  <!-- Communication -->
                  ${comms ? sectionList('Communication Style', comms) : ''}

                  <!-- Collaboration -->
                  ${collab ? sectionList('Collaboration Tips', collab) : ''}

                  <!-- CTA -->
                  ${link ? `
                    <tr>
                      <td style="padding-top:18px;">
                        ${cta(link, 'View your full result', accent)}
                        <div style="font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;color:#64748b;margin-top:12px;">
                          or copy & paste: <span style="color:#0f172a">${escapeHtml(link)}</span>
                        </div>
                      </td>
                    </tr>
                  ` : ''}

                  <!-- Note -->
                  <tr>
                    <td style="padding-top:18px;">
                      <p style="margin:0;font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;color:#64748b;">
                        You’re more than any type—use this as a lens, not a label.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>

          </table>

          <!-- Footer -->
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;margin-top:12px;">
            <tr>
              <td align="center" style="font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;color:#94a3b8;">
                Sent by Your App • © ${new Date().getFullYear()}
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  // --- helpers ---
  function sectionList(title, itemsHtml) {
    return `
      <tr>
        <td style="padding:16px 0 0 0;">
          <h4 style="margin:0 0 8px 0;font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#0f172a;text-transform:uppercase;letter-spacing:.02em;">
            ${escapeHtml(title)}
          </h4>
          <ul style="margin:0;padding:0 0 0 18px;font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;">
            ${itemsHtml}
          </ul>
        </td>
      </tr>
    `;
  }

  function cta(url, label, accent) {
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td align="center" bgcolor="${accent.btnBg}" style="border-radius:10px;">
            <a href="${escapeAttr(url)}"
               style="display:inline-block;padding:12px 18px;font-family:System-UI,Segoe UI,Roboto,Arial,sans-serif;font-weight:600;font-size:14px;color:${accent.btnText};text-decoration:none;border-radius:10px;border:1px solid ${accent.btnBorder};">
              ${escapeHtml(label)}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  function pickAccent(t) {
    // simple palette by MBTI "family"
    const key = (t || '').toUpperCase();
    if (/^EN|^ES|^ESTJ|^ENTJ|^ESTP/.test(key)) return mk('#e6f1ff', '#0b1220', '#bfdbfe');
    if (/^IN|^ISFP|^INFJ|^INTJ|^ISTP/.test(key)) return mk('#f1eaff', '#0b1220', '#ddd6fe');
    if (/^IS|^ESFJ|^ISFJ|^ESFP/.test(key)) return mk('#ecfdf5', '#0b1220', '#a7f3d0');
    // default blue
    return mk('#eef6ff', '#0b1220', '#c7d2fe');
    function mk(bg, text, border) {
      return {
        bg,
        text,
        border,
        btnBg: '#0ea5e9',
        btnText: '#ffffff',
        btnBorder: '#0284c7'
      };
    }
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function escapeAttr(s = '') {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
}

/**
 * POST /results/:id/share-email
 * Body: { to: string, subject?: string, message?: string }
 */
async function shareResultByEmail(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid id');

  const { to, subject, message } = req.body || {};
  if (!to) throw new ApiError(StatusCodes.BAD_REQUEST, 'Recipient email required');

  const result = await Result.findById(id).lean();
  if (!result) throw new ApiError(StatusCodes.NOT_FOUND, 'Result not found');

  const personality = await attachPersonality(result.personalityType || result.summary);

  const appBase = process.env.APP_BASE_URL || '';
  const viewLink = appBase ? `${appBase.replace(/\/+$/, '')}/result?rid=${id}&name=${encodeURIComponent(result.name || '')}` : '';

  const html = buildResultEmailHTML({
    name: result.name,
    result,
    personality,
    link: viewLink,
  });

  const subj =
    subject ||
    `Your MBTI result: ${personality?.type || result.personalityType || result.summary || ''}`;

  const text = `${message ? message + '\n\n' : ''}Open your result: ${viewLink}`;

  await sendMail({ to, subject: subj, html, text });
  return res.json(ok({ sent: true }));
}


module.exports = {
  createResult,
  getResultById,
  listResultsByTheme,
  updateResult,
  deleteResult,
  shareResultByEmail
};
