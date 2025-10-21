const { StatusCodes } = require('http-status-codes');
const { ok } = require('../utils/APIResponse');
const MBTIPersonality = require('../models/MBTIPersonality');

// lazy-load local dataset (works with .js or .json)
let filePayload = null;
function loadFilePayload() {
  if (filePayload) return filePayload;
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    filePayload = require('../data.js');
    if (filePayload && filePayload.default) filePayload = filePayload.default;
  } catch {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      filePayload = require('../data/mbtiResults.json');
    } catch {
      filePayload = {};
    }
  }
  return filePayload;
}

/**
 * GET /mbti/results
 * Return all personalities as a map keyed by type.
 */
async function getAllResults(_req, res) {
  const docs = await MBTIPersonality.find({}).lean();
  if (docs && docs.length) {
    const map = {};
    for (const d of docs) map[d.type] = d;
    return res.status(StatusCodes.OK).json(ok(map));
  }
  // Fallback to local file
  return res.status(StatusCodes.OK).json(ok(loadFilePayload()));
}

/**
 * GET /mbti/results/:type
 * Return a single personality by type (e.g., INTJ)
 */
async function getResultByType(req, res) {
  const type = String(req.params.type || '').toUpperCase();
  if (!type) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Missing type' });
  }

  const doc = await MBTIPersonality.findOne({ type }).lean();
  if (doc) return res.json(ok(doc));

  // Fallback to local file
  const payload = loadFilePayload();
  const f = payload[type];
  if (!f) {
    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'MBTI type not found' });
  }
  return res.json(ok(f));
}

/**
 * POST /mbti/results/bulk
 * Bulk upsert personalities.
 * Accepts either:
 *  - Array<MBTIResultPro>
 *  - Record<MBTIType, MBTIResultPro>
 */
async function bulkUpsertPersonalities(req, res) {
  const body = req.body || {};
  let arr = [];

  if (Array.isArray(body)) {
    arr = body;
  } else if (body && typeof body === 'object') {
    // convert record to array
    arr = Object.values(body);
  }

  if (!arr.length) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'No personalities provided' });
  }

  const ops = arr
    .filter((p) => p && p.type)
    .map((p) => ({
      updateOne: {
        filter: { type: String(p.type).toUpperCase() },
        update: {
          $set: {
            type: String(p.type).toUpperCase(),
            title: p.title,
            description: p.description,
            traits: p.traits || [],
            strengths: p.strengths || [],
            growth: p.growth || [],
            idealEnvironments: p.idealEnvironments || [],
            communicationStyle: p.communicationStyle || [],
            collaborationTips: p.collaborationTips || [],
          },
        },
        upsert: true,
      },
    }));

  if (!ops.length) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Invalid payload' });
  }

  const result = await MBTIPersonality.bulkWrite(ops, { ordered: false });
  return res.status(StatusCodes.OK).json(ok({ matched: result.matchedCount, modified: result.modifiedCount, upserted: result.upsertedCount }));
}

/**
 * POST /mbti/seed
 * Seed DB from local file dataset (idempotent).
 */
async function seedFromFile(_req, res) {
  const payload = loadFilePayload();
  const arr = Object.values(payload || {}).filter(Boolean);

  if (!arr.length) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'No local dataset found' });
  }

  const ops = arr.map((p) => ({
    updateOne: {
      filter: { type: String(p.type).toUpperCase() },
      update: {
        $set: {
          type: String(p.type).toUpperCase(),
          title: p.title,
          description: p.description,
          traits: p.traits || [],
          strengths: p.strengths || [],
          growth: p.growth || [],
          idealEnvironments: p.idealEnvironments || [],
          communicationStyle: p.communicationStyle || [],
          collaborationTips: p.collaborationTips || [],
        },
      },
      upsert: true,
    },
  }));

  const result = await MBTIPersonality.bulkWrite(ops, { ordered: false });
  return res.status(StatusCodes.OK).json(ok({ seeded: arr.length, matched: result.matchedCount, upserted: result.upsertedCount }));
}

const { sendMail } = require('../utils/mailer');

function buildTypeEmailHTML({ name, p, link }) {
  const traits = (p.traits || []).map(t => `<li>${t}</li>`).join('');
  const strengths = (p.strengths || []).map(t => `<li>${t}</li>`).join('');
  const growth = (p.growth || []).map(t => `<li>${t}</li>`).join('');
  const comms = (p.communicationStyle || []).map(t => `<li>${t}</li>`).join('');
  const collab = (p.collaborationTips || []).map(t => `<li>${t}</li>`).join('');

  return `
  <div style="font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55;color:#0f172a">
    <h2 style="margin:0 0 6px">${p.type} — ${p.title}</h2>
    ${name ? `<p style="margin:0 0 12px;color:#334155">Hi ${name}, here’s your MBTI profile.</p>` : ''}
    <p style="margin:0 0 16px;color:#334155">${p.description || ''}</p>
    ${traits ? `<h4 style="margin:12px 0 6px">Core Traits</h4><ul>${traits}</ul>` : ''}
    ${strengths ? `<h4 style="margin:12px 0 6px">Strengths</h4><ul>${strengths}</ul>` : ''}
    ${growth ? `<h4 style="margin:12px 0 6px">Growth Edges</h4><ul>${growth}</ul>` : ''}
    ${comms ? `<h4 style="margin:12px 0 6px">Communication Style</h4><ul>${comms}</ul>` : ''}
    ${collab ? `<h4 style="margin:12px 0 6px">Collaboration Tips</h4><ul>${collab}</ul>` : ''}
    ${link ? `<p style="margin-top:16px"><a href="${link}">View on site</a></p>` : ''}
  </div>`;
}

/**
 * POST /mbti/results/:type/share-email
 * Body: { to: string, name?: string, subject?: string }
 */
async function shareByTypeEmail(req, res) {
  const type = String(req.params.type || '').toUpperCase();
  const { to, name, subject } = req.body || {};
  if (!type) return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Missing type' });
  if (!to) return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Recipient email required' });

  const doc = await MBTIPersonality.findOne({ type }).lean();
  if (!doc) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'MBTI type not found' });

  const appBase = process.env.APP_BASE_URL || '';
  const link = appBase ? `${appBase.replace(/\/+$/, '')}/result?type=${type}${name ? `&name=${encodeURIComponent(name)}` : ''}` : '';

  const html = buildTypeEmailHTML({ name, p: doc, link });
  const subj = subject || `Your MBTI profile: ${doc.type}`;

  await sendMail({ to, subject: subj, html, text: link ? `Open your profile: ${link}` : undefined });
  return res.json(ok({ sent: true }));
}


module.exports = {
  getAllResults,
  getResultByType,
  bulkUpsertPersonalities,
  seedFromFile,
  shareByTypeEmail
};
