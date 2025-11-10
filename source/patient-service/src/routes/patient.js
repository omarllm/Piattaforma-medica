// source/patient-service/src/routes/patient.js
import express from 'express';
import { ObjectId } from 'mongodb';
import { connectDB } from '../db.js';
import { requirePatient } from '../middleware/requirePatient.js';

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { Readable } from 'stream';

const execFileAsync = promisify(execFile);
const router = express.Router();
const DOCTOR_PUBLIC_BASE = process.env.DOCTOR_PUBLIC_BASE || 'http://doctor:4001';



// helper: path assoluto sicuro
function absPath(p) { return p ? path.resolve(p) : null; }

/* --------------------------------- Helpers -------------------------------- */

function getPatientObjectId(req, res) {
  const raw = req.userId || (req.user && (req.user.sub || req.user.userId));
  if (!raw) { res.status(401).json({ error: 'Unauthorized (missing user id)' }); return null; }
  const idStr = String(raw);
  if (!ObjectId.isValid(idStr)) { res.status(400).json({ error: 'Invalid user id format' }); return null; }
  return new ObjectId(idStr);
}

// helper: ricava un URL fetchabile dal record report
function buildFetchableURL(r) {
  const u = r?.url || r?.fileUrl || r?.downloadUrl;
  if (!u) return null;
  try {
    const src = new URL(u, DOCTOR_PUBLIC_BASE);
    // normalizza: usa sempre host interno 'doctor:4001'
    const base = new URL(DOCTOR_PUBLIC_BASE);
    const out  = new URL(src.pathname + src.search, base);
    return out.toString();
  } catch {
    return null;
  }
}

function defaultPrefs() {
  return {
    channels: { inApp: true, email: false, sms: false },
    digest:   { mode: 'immediate' },
    quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'local' }
  };
}

// Sanitizzazione numero di telefono
function sanitizePhone(p) {
  if (!p) return '';
  return String(p).replace(/[^\d+]/g, '').slice(0, 20);
}

/* ---------------------------------- Routes -------------------------------- */

// GET /me (debug)
router.get('/me', requirePatient, (req, res) => {
  res.json({ userId: req.userId, role: req.userRole });
});

// GET /my/shared-reports
router.get('/my/shared-reports', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;

    const db = await connectDB();
    const list = await db.collection('reports').aggregate([
      { $match: { patientId, shared: true } },
      { $sort: { sharedAt: -1, createdAt: -1 } },
      {
        $lookup: {
          from: 'messages',
          let: { repId: '$_id', pId: '$patientId' },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$reportId', '$$repId'] },
              { $eq: ['$patientId', '$$pId'] }
            ]}} },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 1, text: 1, createdAt: 1, fromUserId: 1, toUserId: 1, readAt: 1 } }
          ],
          as: 'lastMsg'
        }
      },
      { $addFields: { lastMessage: { $first: '$lastMsg' } } },
      {
        $project: {
          _id: 1, filename: 1, url: 1, comment: 1, shareMessage: 1,
          shared: 1, sharedAt: 1, doctorId: 1, createdAt: 1, lastMessage: 1
        }
      }
    ]).toArray();

    res.json(list);
  } catch (err) {
    console.error('GET /my/shared-reports', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/messages — lista messaggi del paziente (arricchita con doctorName)
router.get('/my/messages', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res);
    if (!patientId) return;

    const db = await connectDB();
    const msgs = await db.collection('messages').aggregate([
      { $match: { patientId } },
      { $sort: { createdAt: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doc'
        }
      },
      {
        $addFields: {
          doctorName: {
            $ifNull: [
              { $first: '$doc.fullName' },
              { $ifNull: [{ $first: '$doc.name' }, { $first: '$doc.email' }] }
            ]
          }
        }
      },
      {
        $project: {
          _id: 1, text: 1, createdAt: 1, readAt: 1,
          doctorId: 1, reportId: 1,
          fromUserId: 1, toUserId: 1,
          senderRole: 1,
          doctorName: 1,
          type: 1,
          severity: 1
        }
      }
    ]).toArray();

    res.json(msgs);
  } catch (err) {
    console.error('GET /my/messages', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /my/messages/:id/read — segna come letto (imposta readAt)
router.put('/my/messages/:id/read', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res);
    if (!patientId) return;

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid message id' });

    const db = await connectDB();
    const result = await db.collection('messages').updateOne(
      { _id: new ObjectId(id), toUserId: patientId, readAt: null },
      { $set: { readAt: new Date() } }
    );

    if (!result.matchedCount) return res.status(404).json({ error: 'Message not found or already read' });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /my/messages/:id/read', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /my/messages { reportId?: string, toDoctorId?: string, text: string }
router.post('/my/messages', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res);
    if (!patientId) return;

    const db = await connectDB();
    const { reportId, toDoctorId, text } = req.body || {};

    const clean = String(text || '').trim();
    if (!clean) return res.status(400).json({ error: 'Text is required' });

    let doctorIdObj = null;
    let reportIdObj = null;

    if (reportId) {
      if (!ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid reportId' });
      reportIdObj = new ObjectId(reportId);
      // il report dev'essere del paziente e condiviso
      const rep = await db.collection('reports').findOne({ _id: reportIdObj, patientId, shared: true });
      if (!rep) return res.status(404).json({ error: 'Report not found or not shared' });
      doctorIdObj = rep.doctorId;
    } else {
      if (!toDoctorId || !ObjectId.isValid(toDoctorId)) return res.status(400).json({ error: 'toDoctorId required' });
      doctorIdObj = new ObjectId(toDoctorId);
    }

    const now = new Date();
    const doc = {
      patientId,
      doctorId: doctorIdObj,
      reportId: reportIdObj || null,
      text: clean,
      createdAt: now,
      fromUserId: patientId,
      toUserId: doctorIdObj,
      senderRole: 'patient',
      readAt: null
    };

    await db.collection('messages').insertOne(doc);
    res.status(201).json({ success: true, message: doc });
  } catch (err) {
    console.error('POST /my/messages', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/unread-count — conteggio messaggi indirizzati al paziente e non letti
router.get('/my/unread-count', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res);
    if (!patientId) return;

    const db  = await connectDB();
    const cnt = await db.collection('messages').countDocuments({ toUserId: patientId, readAt: null });
    res.json({ unread: cnt });
  } catch (err) {
    console.error('GET /my/unread-count', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /my/read-thread/:reportId
router.put('/my/read-thread/:reportId', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;

    const { reportId } = req.params;
    if (!ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid reportId' });

    const db = await connectDB();
    await db.collection('messages').updateMany(
      { toUserId: patientId, reportId: new ObjectId(reportId), readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /my/read-thread/:reportId', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /my/read-doctor/:doctorId
router.put('/my/read-doctor/:doctorId', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;

    const { doctorId } = req.params;
    if (!ObjectId.isValid(doctorId)) return res.status(400).json({ error: 'Invalid doctorId' });

    const db = await connectDB();
    await db.collection('messages').updateMany(
      { toUserId: patientId, doctorId: new ObjectId(doctorId), reportId: null, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /my/read-doctor/:doctorId', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/alerts-count
router.get('/my/alerts-count', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;
    const db = await connectDB();
    const n = await db.collection('messages').countDocuments({
      toUserId: patientId, type: 'alert', readAt: null
    });
    res.json({ unreadAlerts: n });
  } catch (e) {
    console.error('GET /my/alerts-count', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/reminders-count — numero reminder non letti
router.get('/my/reminders-count', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;
    const db = await connectDB();
    const n = await db.collection('messages').countDocuments({
      toUserId: patientId, type: 'reminder', readAt: null
    });
    res.json({ unreadReminders: n });
  } catch (e) {
    console.error('GET /my/reminders-count', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/profile -> name, email, phone, language, timezone, notificationPrefs
router.get('/my/profile', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;

    const db = await connectDB();
    const user = await db.collection('users').findOne(
      { _id: patientId },
      { projection: { name:1, email:1, phone:1, language:1, timezone:1, notificationPrefs:1 } }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const prefs = { ...defaultPrefs(), ...(user.notificationPrefs || {}) };
    res.json({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      language: user.language || 'en',
      timezone: user.timezone || 'local',
      notificationPrefs: prefs
    });
  } catch (e) {
    console.error('GET /my/profile', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /my/profile  { name?, phone?, language?, timezone? }
router.put('/my/profile', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;

    const patch = {};
    if (req.body.name != null)      patch.name = String(req.body.name).trim().slice(0, 100);
    if (req.body.phone != null)     patch.phone = sanitizePhone(req.body.phone);
    if (req.body.language != null)  patch.language = String(req.body.language).trim().slice(0, 10);
    if (req.body.timezone != null)  patch.timezone = String(req.body.timezone).trim().slice(0, 64);

    const db = await connectDB();
    await db.collection('users').updateOne({ _id: patientId }, { $set: patch });
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /my/profile', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /my/notification-prefs  { channels?, digest?, quietHours? }
router.put('/my/notification-prefs', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;

    const body = req.body || {};
    const prefs = defaultPrefs();

    if (body.channels) {
      prefs.channels.inApp = !!body.channels.inApp;
      prefs.channels.email  = !!body.channels.email;
      prefs.channels.sms    = !!body.channels.sms;
    }
    if (body.digest) {
      const m = String(body.digest.mode || '').toLowerCase();
      prefs.digest.mode = ['immediate','daily','weekly'].includes(m) ? m : 'immediate';
      if (body.digest.dailyHour != null)  prefs.digest.dailyHour  = Math.max(0, Math.min(23, Number(body.digest.dailyHour)));
      if (body.digest.weeklyDow != null)  prefs.digest.weeklyDow  = Math.max(0, Math.min(6,  Number(body.digest.weeklyDow))); // 0=Sun
      if (body.digest.weeklyHour != null) prefs.digest.weeklyHour = Math.max(0, Math.min(23, Number(body.digest.weeklyHour)));
    }
    if (body.quietHours) {
      prefs.quietHours.enabled  = !!body.quietHours.enabled;
      prefs.quietHours.start    = String(body.quietHours.start || '22:00');
      prefs.quietHours.end      = String(body.quietHours.end   || '07:00');
      prefs.quietHours.timezone = String(body.quietHours.timezone || 'local').slice(0, 64);
    }

    const db = await connectDB();
    await db.collection('users').updateOne(
      { _id: patientId },
      { $set: { notificationPrefs: prefs } }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /my/notification-prefs', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/reminders
router.get('/my/reminders', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;
    const db = await connectDB();
    const reminders = await db.collection('reminders')
      .find({ patientId, active: true }, {
        projection: {
          title:1, sector:1, frequencyDays:1,
          nextDueAt:1, lastNotifiedAt:1, lastCompletedAt:1,
          notes:1, updatedAt:1
        }
      })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json({ reminders });
  } catch (e) {
    console.error('GET /my/reminders', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/reports/:id/pdf — conversione singolo report → PDF (fs OR fetch)
router.get('/my/reports/:id/pdf', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res); if (!patientId) return;
    const db = await connectDB();

    const rid = new ObjectId(req.params.id);
    const r = await db.collection('reports').findOne(
      { _id: rid, patientId },
      { projection: { title:1, sector:1, filePath:1, mimetype:1, size:1, createdAt:1, url:1, fileUrl:1, downloadUrl:1 } }
    );
    if (!r) return res.status(404).json({ error: 'Report not found' });

    // fallback mimetype se non presente
    let mime = r.mimetype || '';
    if (!mime && r.filePath) {
      const ext = (r.filePath.split('.').pop() || '').toLowerCase();
      if (['txt','csv','log'].includes(ext)) mime = 'text/plain';
      else if (ext === 'pdf') mime = 'application/pdf';
      else if (['png','jpg','jpeg','gif','bmp','webp'].includes(ext)) {
        mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      }
    }

    
    r.mimetype = mime;
    // fallback MIME anche da URL (se non ricavato da filePath)
    if (!r.mimetype && (r.url || r.fileUrl || r.downloadUrl)) {
      try {
        const href = (r.url || r.fileUrl || r.downloadUrl);
        const pathname = new URL(href, DOCTOR_PUBLIC_BASE).pathname || '';
        const ext = (pathname.split('.').pop() || '').toLowerCase();
        if (['txt','csv','log'].includes(ext)) r.mimetype = 'text/plain';
        else if (ext === 'pdf') r.mimetype = 'application/pdf';
        else if (['png','jpg','jpeg','gif','bmp','webp'].includes(ext)) {
          r.mimetype = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        }
      } catch(_) {}
    }


    const src = absPath(r.filePath);
    const hasLocal = src && fs.existsSync(src);
    const remoteURL = buildFetchableURL(r);

    // helper per ottenere contenuto dal "backend giusto"
    async function getText() {
      if (hasLocal) return fs.readFileSync(src, 'utf8');
      if (remoteURL) {
        const fr = await fetch(remoteURL, { headers: { Authorization: req.headers.authorization || '' } });
        if (!fr.ok) throw new Error(`fetch text HTTP ${fr.status}`);
        return await fr.text();
      }
      throw new Error('no source');
    }
    async function getBuffer() {
      if (hasLocal) return fs.readFileSync(src);
      if (remoteURL) {
        const fr = await fetch(remoteURL, { headers: { Authorization: req.headers.authorization || '' } });
        if (!fr.ok) throw new Error(`fetch bin HTTP ${fr.status}`);
        return Buffer.from(await fr.arrayBuffer());
      }
      throw new Error('no source');
    }

    async function streamPdfDirect(disposition) {
      try {
        // locale: stream
        if (hasLocal) {
          const stat = fs.statSync(src);
          res.setHeader('Content-Type', 'application/pdf');
          if (disposition) res.setHeader('Content-Disposition', disposition);
          res.setHeader('Content-Length', stat.size);
          return fs.createReadStream(src).pipe(res);
        }

        // remoto: bufferizza e invia
        if (remoteURL) {
          const fr = await fetch(remoteURL, { headers: { Authorization: req.headers.authorization || '' } });
          if (!fr.ok) {
            const msg = await fr.text().catch(()=>'');
            return res.status(fr.status).json({ error: `Upstream error ${fr.status}`, detail: msg });
          }
          const buf = Buffer.from(await fr.arrayBuffer());
          res.setHeader('Content-Type', 'application/pdf');
          if (disposition) res.setHeader('Content-Disposition', disposition);
          res.setHeader('Content-Length', buf.length);
          return res.end(buf);
        }

        return res.status(404).json({ error: 'File not found on server' });
      } catch (err) {
        console.error('streamPdfDirect error:', err);
        if (!res.headersSent) return res.status(500).json({ error: 'Internal error while streaming PDF' });
        try { res.end(); } catch {}
      }
    }




    // === PDF nativo → pass-through (locale o remoto)
    const urlPath = (() => {
      try { return new URL(remoteURL || '', DOCTOR_PUBLIC_BASE).pathname || ''; }
      catch { return ''; }
    })();

    if ((r.mimetype || '').startsWith('application/pdf')
        || (src && src.toLowerCase().endsWith('.pdf'))
        || urlPath.toLowerCase().endsWith('.pdf')) {
      return streamPdfDirect(`attachment; filename="${(r.title||'report')}.pdf"`);
    }
    // text/* → genera PDF con il testo
    if ((r.mimetype||'').startsWith('text/')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(r.title||'report')}.pdf"`);
      const doc = new PDFDocument({ autoFirstPage: false });
      doc.pipe(res);
      doc.addPage({ size: 'A4', margins: { top: 60, left: 60, right: 60, bottom: 60 } });
      doc.fontSize(16).text(r.title || 'Report', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(
        `Sector: ${r.sector || '—'} • Date: ${r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}`
      );
      doc.moveDown(0.5);
      try {
        let text = await getText();
        const LIMIT = 100000;
        if (text.length > LIMIT) text = text.slice(0, LIMIT) + '\n\n[... truncated ...]';
        doc.fillColor('#000').font('Courier').fontSize(11).text(text, { lineGap: 2 });
      } catch (e) {
        doc.fillColor('#a00').fontSize(11).text(`(Error reading file: ${e.message})`);
      }
      doc.end();
      return;
    }

    // image/* → incapsula immagine
    if ((r.mimetype||'').startsWith('image/')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(r.title||'report')}.pdf"`);
      const doc = new PDFDocument({ autoFirstPage: true, size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 40 } });
      doc.pipe(res);
      try {
        const buf = await getBuffer();
        const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const pageH = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
        doc.fontSize(14).text(r.title || 'Report', { underline: true });
        doc.moveDown(0.5);
        doc.image(buf, { fit: [pageW, pageH - 40], align: 'center', valign: 'center' });
      } catch (e) {
        doc.fontSize(12).fillColor('#a00').text(`(Error reading image: ${e.message})`);
      }
      doc.end();
      return;
    }

    // altri tipi → LibreOffice se presente (resta identico: prova src o scarica prima)
    // se non hai LibreOffice, toglilo o lascia 415
    if (hasLocal) {
      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medexport-'));
        const args = [ '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, src ];
        await execFileAsync('soffice', args, { timeout: 60_000 });
        const base = path.basename(src).replace(path.extname(src), '.pdf');
        const outPdf = path.join(tmpDir, base);
        if (fs.existsSync(outPdf)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${(r.title||'report')}.pdf"`);
          const stream = fs.createReadStream(outPdf);
          stream.on('close', () => fs.rmSync(tmpDir, { recursive: true, force: true }));
          return stream.pipe(res);
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (err) {
        // fallthrough
      }
    }



    } catch (e) {
      console.error('GET /my/reports/:id/pdf', e);
      if (!res.headersSent) res.status(500).json({ error: 'Server error' });
    }
    });
/**
 * GET /my/timeline  — history (passato)
 * Query:
 *   - limit (default 20, max 200)
 *   - types (csv opzionale, es: "reminder,reminder_sent,alert,reminder_completed")
 */
router.get('/my/timeline', requirePatient, async (req, res) => {
  try {
    const patientId = getPatientObjectId(req, res);
    if (!patientId) return;

    const db = await connectDB();

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10) || 20, 200));

    // Tipi inclusi (di default: reminder, reminder_sent, alert, reminder_completed)
    const defaultTypes = ['reminder', 'reminder_sent', 'alert', 'reminder_completed'];
    const types = String(req.query.types || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const inTypes = (types.length ? types : defaultTypes);

    const msgs = await db.collection('messages').aggregate([
      { $match: { patientId, type: { $in: inTypes } } },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      // Join opzionale per ottenere doctorName
      {
        $lookup: {
          from: 'users',
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doc'
        }
      },
      {
        $addFields: {
          doctorName: {
            $ifNull: [
              { $first: '$doc.fullName' },
              { $ifNull: [ { $first: '$doc.name' }, { $first: '$doc.email' } ] }
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          type: 1,
          text: 1,
          createdAt: 1,
          when: 1,
          readAt: 1,
          channel: 1,
          severity: 1,
          doctorId: 1,
          reportId: 1,
          doctorName: 1
        }
      }
    ]).toArray();

    // Normalizza shape per il frontend
    const toTitle = (m) => {
      if (m.text && m.text.trim()) return m.text.trim();
      if (m.type === 'alert') return 'Doctor alert';
      if (m.type === 'reminder_completed') return 'Follow-up completed';
      if (m.type && m.type.startsWith('reminder')) return 'Reminder';
      return 'Notification';
    };

    const timeline = msgs.map(m => ({
      _id: m._id,
      kind: 'notification',
      type: m.type,                                    // 'alert' | 'reminder' | 'reminder_sent' | 'reminder_completed'
      title: toTitle(m),
      when: m.when || m.createdAt,                               // data dell’evento
      status: m.readAt ? 'read' : 'sent',
      channel: m.channel || null,
      severity: m.severity || null,
      doctorId: m.doctorId || null,
      doctorName: m.doctorName || null,
      reportId: m.reportId || null,
      completed: m.type === 'reminder_completed'       // flag comodo per il frontend (pallino verde)
    }));

    res.json({ timeline, summary: { history: timeline.length } });
  } catch (err) {
    console.error('GET /my/timeline', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
