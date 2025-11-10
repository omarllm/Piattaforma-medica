// src/routes/doctor.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';

import { connectDB } from '../db.js';
import { requireDoctor } from '../middleware/requireDoctor.js';
import { uploadSingle } from '../middleware/uploader.js';

const router = express.Router();

/**
 * GET /me
 */
router.get('/me', (req, res) => {
  const auth = req.headers.authorization?.split(' ')[1];
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(auth, process.env.JWT_SECRET);
    return res.json({ userId: payload.sub || payload.userId, role: payload.role });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * GET /patients
 * Pazienti assegnati al dottore (via isdoctorof)
 */
router.get('/patients', requireDoctor, async (req, res) => {
  try {
    const db      = await connectDB();
    const users   = db.collection('users');
    const linkCol = db.collection('isdoctorof');

    const doctorIdStr = req.userId || req.user?.id;
    if (!doctorIdStr) return res.status(401).json({ error: 'Unauthorized' });
    const doctorId = new ObjectId(doctorIdStr);

    const link = await linkCol.findOne({ doctorId });
    if (!link || !Array.isArray(link.patients) || link.patients.length === 0) {
      return res.json([]);
    }

    const pats = await users
      .find({ _id: { $in: link.patients }, role: 'patient' }, { projection: { email: 1 } })
      .toArray();

    res.json(pats.map(p => ({ _id: p._id, email: p.email })));
  } catch (err) {
    console.error('GET /patients', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /patients/:email/add
 */
router.post('/patients/:email/add', requireDoctor, async (req, res) => {
  try {
    const db      = await connectDB();
    const users   = db.collection('users');
    const linkCol = db.collection('isdoctorof');

    const doctorIdStr = req.userId || req.user?.id;
    if (!doctorIdStr) return res.status(401).json({ error: 'Unauthorized' });
    const doctorId = new ObjectId(doctorIdStr);

    const patientEmail = String(req.params.email || '').trim().toLowerCase();
    const patient = await users.findOne({ email: patientEmail, role: 'patient' });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    await linkCol.updateOne(
      { doctorId },
      { $addToSet: { patients: patient._id } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('POST /patients/:email/add', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /patients/:email/remove
 */
router.delete('/patients/:email/remove', requireDoctor, async (req, res) => {
  try {
    const db      = await connectDB();
    const users   = db.collection('users');
    const linkCol = db.collection('isdoctorof');

    const patientEmail = req.params.email;
    const doctorId     = req.userId;

    const patient = await users.findOne({ email: patientEmail, role: 'patient' });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const result = await linkCol.updateOne(
      { doctorId: new ObjectId(doctorId) },
      { $pull: { patients: patient._id } }
    );

    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    console.error('DELETE /patients/:email/remove', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /my-patients (legacy: email-only)
 */
router.get('/my-patients', requireDoctor, async (req, res) => {
  try {
    const db      = await connectDB();
    const users   = db.collection('users');
    const linkCol = db.collection('isdoctorof');

    const doctorIdStr = req.userId || req.user?.id;
    if (!doctorIdStr) return res.status(401).json({ error: 'Unauthorized' });
    const doctorId = new ObjectId(doctorIdStr);

    const link = await linkCol.findOne({ doctorId });
    if (!link || !Array.isArray(link.patients) || link.patients.length === 0) {
      return res.json([]);
    }

    const pats = await users
      .find({ _id: { $in: link.patients } }, { projection: { email: 1, _id: 0 } })
      .toArray();

    res.json(pats.map(p => p.email));
  } catch (err) {
    console.error('GET /my-patients', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /patients/:id/profile
 */
router.get('/patients/:id/profile', requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid patient id' });

    const db = await connectDB();
    const patientId = new ObjectId(id);

    const doctorIdStr = req.userId || req.user?.id;
    if (!doctorIdStr) return res.status(401).json({ error: 'Unauthorized' });
    const doctorId = new ObjectId(doctorIdStr);

    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    const patient = await db.collection('users').findOne(
      { _id: patientId, role: 'patient' },
      { projection: { password: 0 } }
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    let reports = [];
    try {
      reports = await db.collection('reports')
        .find({ patientId })
        .project({
          filename: 1,
          url: 1,
          comment: 1,
          shared: 1,
          shareMessage: 1,
          sharedAt: 1,
          doctorId: 1,
          doctorName: 1, 
          sector: 1,                // <— aggiunto
          createdAt: 1
        })
        .sort({ createdAt: -1 })
        .toArray();
    } catch {
      reports = [];
    }

    const summary = {
      totalReports: reports.length
    };

    res.json({ patient, reports, summary });
  } catch (e) {
    console.error('GET /patients/:id/profile', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /patient-id-by-email/:email
 */
router.get('/patient-id-by-email/:email', requireDoctor, async (req, res) => {
  try {
    const db = await connectDB();
    const patient = await db.collection('users').findOne(
      { email: req.params.email, role: 'patient' },
      { projection: { _id: 1 } }
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ _id: patient._id });
  } catch (err) {
    console.error('GET /patient-id-by-email/:email', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /patients/all — per Search Patients
 */
router.get('/patients/all', requireDoctor, async (_req, res) => {
  try {
    const db    = await connectDB();
    const users = db.collection('users');
    const all = await users
      .find({ role: 'patient' }, { projection: { email: 1 } })
      .toArray();
    res.json(all.map(p => ({ _id: p._id, email: p.email })));
  } catch (err) {
    console.error('GET /patients/all', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /patients/:id/messages  — dottore -> paziente (opzionale reportId)
 */
router.post('/patients/:id/messages', requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const { text = '', reportId = null } = req.body || {};
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid patient id' });

    const clean = String(text || '').trim();
    if (!clean) return res.status(400).json({ error: 'Message text is required' });

    const db        = await connectDB();
    const patientId = new ObjectId(id);
    const doctorId  = new ObjectId(req.userId);

    // autorizzazione: il paziente deve essere assegnato al dottore
    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    let reportRef = null;
    if (reportId && ObjectId.isValid(reportId)) {
      const rep = await db.collection('reports').findOne({ _id: new ObjectId(reportId), patientId });
      if (rep) reportRef = rep._id;
    }

    const now = new Date();
    const doc = {
      doctorId,
      patientId,
      reportId: reportRef,
      text: clean,
      createdAt: now,
      // schema coerente col patient-service
      fromUserId: doctorId,
      toUserId:   patientId,
      senderRole: 'doctor',
      readAt:     null
    };

    await db.collection('messages').insertOne(doc);
    res.status(201).json({ success: true, message: doc });
  } catch (err) {
    console.error('POST /patients/:id/messages', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /patients/:id/reports — upload file report
 */
router.post('/patients/:id/reports', requireDoctor, (req, res) => {
  uploadSingle(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.message });

      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid patient id' });

      const db = await connectDB();
      const patientId = new ObjectId(id);
      const doctorId  = new ObjectId(req.userId);

      const me = await db.collection('users').findOne(
        { _id: doctorId },
        { projection: { name: 1, email: 1 } }
      );

      const doctorName = me?.name || me?.email || 'Unknown Doctor';


      const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: patientId });
      if (!rel) return res.status(403).json({ error: 'Forbidden' });

      if (!req.file) return res.status(400).json({ error: 'Missing file' });

      const { comment = '' } = req.body;

        // nuovo: settore del report (opzionale). Se non indicato, uso il "sector" del medico o 'general'
        let sector = (req.body.sector || '').trim();
        if (!sector) {
          try {
            const me = await db.collection('users').findOne(
              { _id: doctorId },
              { projection: { sector: 1, specialty: 1 } }
            );
            sector = me?.sector || me?.specialty || 'general';
          } catch { sector = 'general'; }
        }

      const doc = {
        patientId,
        doctorId,
        doctorName,
        filename:   req.file.originalname,
        storedName: req.file.filename,
        mimeType:   req.file.mimetype,
        size:       req.file.size,
        url:        `/files/${req.file.filename}`,
        comment,
        sector,                 // <— nuovo campo
        shared: false,
        shareMessage: '',
        sharedAt: null,
        createdAt: new Date()
      };

      await db.collection('reports').insertOne(doc);
      res.status(201).json({ success: true, report: doc });
    } catch (e) {
      console.error('POST /patients/:id/reports', e);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

/**
 * DELETE /reports/:id — elimina report + (best-effort) file
 */
router.delete('/reports/:id', requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid report id' });

    const db       = await connectDB();
    const reports  = db.collection('reports');
    const linkCol  = db.collection('isdoctorof');
    const doctorId = new ObjectId(req.userId);

    const report = await reports.findOne({ _id: new ObjectId(id) });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // proprietario o medico assegnato al paziente
    let allowed = String(report.doctorId) === String(doctorId);
    if (!allowed && report.patientId) {
      const rel = await linkCol.findOne({ doctorId, patients: report.patientId });
      allowed = !!rel;
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    await reports.deleteOne({ _id: report._id });

    try {
      const fileName = report.storedName || (report.url || '').split('/').pop();
      if (fileName) {
        const filePath = path.resolve('uploads', fileName);
        fs.unlink(filePath, () => {});
      }
    } catch {}

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /reports/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /reports/:id/share  { shared: boolean, message?: string }
 */
router.put('/reports/:id/share', requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid report id' });

    const { shared, message = '' } = req.body || {};
    if (typeof shared !== 'boolean') {
      return res.status(400).json({ error: 'shared must be boolean' });
    }

    const db = await connectDB();
    const reports = db.collection('reports');

    const rep = await reports.findOne({ _id: new ObjectId(id) });
    if (!rep) return res.status(404).json({ error: 'Report not found' });

    // medico assegnato a quel paziente
    const rel = await db.collection('isdoctorof').findOne({
      doctorId: new ObjectId(req.userId),
      patients: rep.patientId
    });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    const update = {
      shared,
      shareMessage: message,
      sharedAt: shared ? new Date() : null
    };

    await reports.updateOne({ _id: rep._id }, { $set: update });
    res.json({ success: true, reportId: rep._id, ...update });
  } catch (e) {
    console.error('PUT /reports/:id/share', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /my/messages  — elenco messaggi del dottore (arricchiti con nome paziente)
// GET /my/messages — tutti i messaggi che mi riguardano (doc↔patient e doc↔doc)
// Enrich: patientName/email, otherDoctorId/Name per thread doc↔doc
router.get('/my/messages', requireDoctor, async (req, res) => {
  try {
    const db = await connectDB();
    const meId = new ObjectId(req.userId);

    const rows = await db.collection('messages').aggregate([
      // io come mittente o destinatario
      { $match: { $or: [ { fromUserId: meId }, { toUserId: meId } ] } },
      { $sort: { createdAt: 1 } },

      // paziente
      { $lookup: {
          from: 'users',
          localField: 'patientId',
          foreignField: '_id',
          as: 'pat'
        }
      },
      // altro dottore (solo se type === 'docdoc')
      { $addFields: {
          otherDoctorId: {
            $cond: [
              { $eq: ['$type', 'docdoc'] },
              { $cond: [ { $eq: ['$fromUserId', meId] }, '$toDoctorId', '$fromDoctorId' ] },
              null
            ]
          }
        }
      },
      { $lookup: {
          from: 'users',
          localField: 'otherDoctorId',
          foreignField: '_id',
          as: 'peer'
        }
      },

      // flag lato server: fromMe / toMe
      { $addFields: {
          fromMe: { $eq: ['$fromUserId', meId] },
          toMe:   { $eq: ['$toUserId',   meId] },
          patientName:  { $ifNull: [ { $first: '$pat.fullName' }, { $first: '$pat.name' } ] },
          patientEmail: { $first: '$pat.email' },
          otherDoctorName: {
            $ifNull: [ { $first: '$peer.fullName' }, { $first: '$peer.name' } ]
          },
          otherDoctorEmail: { $first: '$peer.email' }
        }
      },

      { $project: {
          _id:1, text:1, createdAt:1, readAt:1, type:1, severity:1,
          // contesto
          patientId:1, reportId:1,
          // routing universale
          fromUserId:1, toUserId:1, senderRole:1,
          // per doc↔doc
          fromDoctorId:1, toDoctorId:1, otherDoctorId:1, otherDoctorName:1, otherDoctorEmail:1,
          // per elenco
          patientName:1, patientEmail:1,
          // flag
          fromMe:1, toMe:1
        }
      }
    ]).toArray();

    res.json(rows);
  } catch (e) {
    console.error('GET /my/messages', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// PUT /my/read-patient/:patientId  — marca letti i general da quel paziente
router.put('/my/read-patient/:patientId', requireDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!ObjectId.isValid(patientId)) return res.status(400).json({ error: 'Invalid patientId' });
    const db = await connectDB();
    await db.collection('messages').updateMany(
      { toUserId: new ObjectId(req.userId), patientId: new ObjectId(patientId), reportId: null, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /my/read-patient/:patientId', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// PUT /my/read-thread/:reportId  — marca letti i messaggi del thread report
router.put('/my/read-thread/:reportId', requireDoctor, async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid reportId' });
    const db = await connectDB();
    await db.collection('messages').updateMany(
      { toUserId: new ObjectId(req.userId), reportId: new ObjectId(reportId), readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /my/read-thread/:reportId', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /reports/:id/alert  { severity: "low"|"medium"|"high", message?: string }
router.post('/reports/:id/alert', requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid report id' });

    const { severity = 'high', message = '' } = req.body || {};
    const sev = String(severity).toLowerCase();
    if (!['low','medium','high'].includes(sev)) {
      return res.status(400).json({ error: 'severity must be low|medium|high' });
    }

    const db = await connectDB();
    const doctorId = new ObjectId(req.userId);

    const rep = await db.collection('reports').findOne({ _id: new ObjectId(id) });
    if (!rep) return res.status(404).json({ error: 'Report not found' });

    // autorizzazione: proprietario o dottore assegnato al paziente
    const okOwner = String(rep.doctorId) === String(doctorId);
    const okRel   = await db.collection('isdoctorof').findOne({ doctorId, patients: rep.patientId });
    if (!okOwner && !okRel) return res.status(403).json({ error: 'Forbidden' });

    const now = new Date();
    const doc = {
      doctorId,
      patientId: rep.patientId,
      reportId:  rep._id,
      text: (message || '').trim() || 'Doctor flagged this report as concerning.',
      type: 'alert',                 // <— nuovo
      severity: sev,                 // <— nuovo
      createdAt: now,
      fromUserId: doctorId,
      toUserId:   rep.patientId,
      senderRole: 'doctor',
      readAt:     null
    };

    await db.collection('messages').insertOne(doc);
    res.status(201).json({ success: true, message: doc });
  } catch (e) {
    console.error('POST /reports/:id/alert', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /patients/:id/other-doctors
// Ritorna i dottori (diversi da me) che hanno in carico lo stesso paziente
router.get('/patients/:id/other-doctors', requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid patient id' });

    const db = await connectDB();
    const patientId = new ObjectId(id);
    const meId = new ObjectId(req.userId);

    // Autorizzazione: io devo essere effettivamente il dottore del paziente
    const iAmDoctor = await db.collection('isdoctorof').findOne({ doctorId: meId, patients: patientId });
    if (!iAmDoctor) return res.status(403).json({ error: 'Forbidden' });

    // Cerca tutti i dottori che hanno quel paziente
    const links = await db.collection('isdoctorof')
      .find({ patients: patientId })
      .project({ doctorId: 1, _id: 0 })
      .toArray();

    const doctorIds = links
      .map(l => l.doctorId)
      .filter(id => String(id) !== String(meId)); // escludi me stesso

    if (doctorIds.length === 0) return res.json([]);

    // Prendi dati base dei dottori
    const docs = await db.collection('users')
      .find({ _id: { $in: doctorIds }, role: 'doctor' })
      .project({ _id: 1, email: 1, name: 1, fullName: 1, phone: 1 })
      .toArray();

    res.json(docs.map(d => ({
      _id: d._id,
      name: d.fullName || d.name || null,
      email: d.email || null,
      phone: d.phone || null,
    })));
  } catch (e) {
    console.error('GET /patients/:id/other-doctors', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /patients/:patientId/doctors/:otherId/messages  { text }
// Invia un messaggio doc→doc sul caso di un paziente condiviso
router.post('/patients/:patientId/doctors/:otherId/messages', requireDoctor, async (req, res) => {
  try {
    const { patientId, otherId } = req.params;
    if (!ObjectId.isValid(patientId) || !ObjectId.isValid(otherId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const db = await connectDB();
    const meId = new ObjectId(req.userId);
    const pId  = new ObjectId(patientId);
    const oId  = new ObjectId(otherId);

    // entrambi devono avere il paziente in carico
    const links = await db.collection('isdoctorof').find({ patients: pId }).project({ doctorId:1 }).toArray();
    const docIds = new Set(links.map(l => String(l.doctorId)));
    if (!docIds.has(String(meId)) || !docIds.has(String(oId))) {
      return res.status(403).json({ error: 'Not allowed (patient not shared by both doctors)' });
    }

    const now = new Date();
    const doc = {
      type: 'docdoc',
      text,
      createdAt: now,
      readAt: null,

      patientId: pId,
      reportId: null,

      // routing generico
      fromUserId: meId,
      toUserId:   oId,
      senderRole: 'doctor',

      // comodi per lookup/filtri
      fromDoctorId: meId,
      toDoctorId:   oId
    };

    await db.collection('messages').insertOne(doc);
    res.status(201).json({ success: true, message: doc });
  } catch (e) {
    console.error('POST /patients/:patientId/doctors/:otherId/messages', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// PUT /my/read-doctor-peer/:patientId/:otherId — marca come letti i doc↔doc per quel paziente/collega
router.put('/my/read-doctor-peer/:patientId/:otherId', requireDoctor, async (req, res) => {
  try {
    const { patientId, otherId } = req.params;
    if (!ObjectId.isValid(patientId) || !ObjectId.isValid(otherId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }
    const db = await connectDB();
    const meId = new ObjectId(req.userId);

    await db.collection('messages').updateMany(
      {
        type: 'docdoc',
        patientId: new ObjectId(patientId),
        toUserId:  meId,
        $or: [
          { fromDoctorId: new ObjectId(otherId) },
          { toDoctorId:   new ObjectId(otherId) } // per completezza
        ],
        readAt: null
      },
      { $set: { readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /my/read-doctor-peer/:patientId/:otherId', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// === REMINDERS ===

// Crea un piano di promemoria (follow-up) per il paziente
// POST /patients/:id/reminders  { title, sector?, frequencyDays, firstDueAt?, notes?, sendNow? }
router.post('/patients/:id/reminders', requireDoctor, async (req, res) => {
  try {
    const db = await connectDB();
    const patientId = new ObjectId(req.params.id);
    const doctorId  = new ObjectId(req.userId);

    // autorizzazione dottore → paziente
    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    const { title, sector = 'General', frequencyDays, firstDueAt, notes = '', sendNow } = req.body || {};
    if (!title || !frequencyDays) {
      return res.status(400).json({ error: 'title and frequencyDays are required' });
    }

    const now  = new Date();
    const freq = Number(frequencyDays);
    const nextDueAt = firstDueAt ? new Date(firstDueAt) : new Date(now.getTime() + freq * 86400000);

    const doc = {
      patientId, doctorId,
      title: String(title).trim(),
      sector: String(sector).trim(),
      frequencyDays: freq,
      nextDueAt,
      lastCompletedAt: null,
      lastNotifiedAt: null,
      active: true,
      notes: String(notes).trim(),
      createdAt: now,
      updatedAt: now
    };

    const ins = await db.collection('reminders').insertOne(doc);
    doc._id = ins.insertedId;

    // === Opzione A: invio immediato (se richiesto) ===
    const wantsSendNow = (sendNow === true || sendNow === 'true' || sendNow === 1 || sendNow === '1');
    if (wantsSendNow) {
      await db.collection('messages').insertOne({
        type: 'reminder',
        text: `${doc.title} scheduled`, 
        patientId: doc.patientId,
        doctorId:  doc.doctorId,
        reportId:  null,
        createdAt: new Date(),
        when: doc.nextDueAt,        // 👈 data che la timeline deve mostrare
        reminderId: doc._id,        // 👈 legame diretto
        fromUserId: doc.doctorId,
        toUserId:   doc.patientId,
        senderRole: 'doctor',
        readAt:     null,
        meta: { reminderId: doc._id, firstImmediate: true }
      });

      // evita doppione con il cron: marca la scadenza come notificata
      const notifiedAt = doc.nextDueAt || new Date();
      await db.collection('reminders').updateOne(
        { _id: doc._id },
        { $set: { lastNotifiedAt: notifiedAt, updatedAt: new Date() } }
      );
      doc.lastNotifiedAt = notifiedAt;
    }

    res.status(201).json({ success: true, reminder: doc });
  } catch (e) {
    console.error('POST /patients/:id/reminders', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// Lista piani per un paziente
// GET /patients/:id/reminders
router.get('/patients/:id/reminders', requireDoctor, async (req, res) => {
  try {
    const db = await connectDB();
    const patientId = new ObjectId(req.params.id);
    const doctorId  = new ObjectId(req.userId);

    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    const list = await db.collection('reminders')
      .find({ patientId })
      .sort({ nextDueAt: 1 })
      .toArray();
    res.json(list);
  } catch (e) {
    console.error('GET /patients/:id/reminders', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Aggiorna un piano
// PUT /reminders/:rid  { title?, sector?, frequencyDays?, nextDueAt?, active?, notes? }
router.put('/reminders/:rid', requireDoctor, async (req, res) => {
  try {
    const db = await connectDB();
    const rid = new ObjectId(req.params.rid);
    const doctorId = new ObjectId(req.userId);

    const r = await db.collection('reminders').findOne({ _id: rid });
    if (!r) return res.status(404).json({ error: 'Reminder not found' });

    // Solo un dottore che ha in carico il paziente può modificare
    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: r.patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    const patch = { updatedAt: new Date() };
    const { title, sector, frequencyDays, nextDueAt, active, notes } = req.body || {};
    if (title != null) patch.title = String(title).trim();
    if (sector != null) patch.sector = String(sector).trim();
    if (frequencyDays != null) patch.frequencyDays = Number(frequencyDays);
    if (nextDueAt != null) patch.nextDueAt = new Date(nextDueAt);
    if (active != null) patch.active = !!active;
    if (notes != null) patch.notes = String(notes).trim();

    await db.collection('reminders').updateOne({ _id: rid }, { $set: patch });
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /reminders/:rid', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Completa un piano (il paziente ha fatto le analisi) -> sposta nextDueAt in avanti
// POST /reminders/:rid/complete
// POST /reminders/:rid/complete
router.post('/reminders/:rid/complete', requireDoctor, async (req, res) => {
  try {
    const db       = await connectDB();
    const rid      = new ObjectId(req.params.rid);
    const doctorId = new ObjectId(req.userId);

    const r = await db.collection('reminders').findOne({ _id: rid });
    if (!r) return res.status(404).json({ error: 'Reminder not found' });

    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: r.patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    const now     = new Date();
    const days    = Number(r.frequencyDays || 0);
    const nextDue = new Date(now.getTime() + days * 86400000);

    // 1) chiudi il reminder corrente
    await db.collection('reminders').updateOne(
      { _id: rid },
      { $set: { active: false, lastCompletedAt: now, updatedAt: now } }
    );

    // 2) crea il nuovo reminder
    const nextDoc = {
      patientId: r.patientId,
      doctorId,
      title: r.title,
      sector: r.sector,
      frequencyDays: r.frequencyDays,
      nextDueAt: nextDue,
      lastCompletedAt: null,
      lastNotifiedAt: null,
      active: true,
      notes: r.notes || '',
      createdAt: now,
      updatedAt: now
    };
    const ins = await db.collection('reminders').insertOne(nextDoc);
    nextDoc._id = ins.insertedId;

    // 3) ⬇️ QUI dentro incolla il blocco che ti ho passato (conversione + nuovo scheduled)
    // --- conversione scheduled → completed + nuovo scheduled ---
    // 3) CONVERTI il messaggio "scheduled" ESISTENTE → 'reminder_completed'
    // 3) CONVERTI il vecchio "scheduled" → "reminder_completed" via legame diretto
    const up = await db.collection('messages').updateOne(
      { patientId: r.patientId, type: 'reminder', reminderId: r._id },
      { $set: {
          type: 'reminder_completed',
          text: `${r.title || 'Follow-up'} completed`,
          updatedAt: now
        }
      }
    );
    // opzionale: se non ha convertito nulla, puoi loggare ma NON creare un "completed" nuovo
    // if (up.modifiedCount === 0) console.warn('No scheduled message to convert for reminder', r._id);

    // 4) NUOVO "scheduled" (blu) legato AL NUOVO reminder
    await db.collection('messages').insertOne({
      patientId: r.patientId,
      doctorId,
      type: 'reminder',
      text: `${r.title || 'Follow-up'} scheduled`,
      createdAt: now,
      when: nextDue,
      reminderId: nextDoc._id,   // 👈 legame diretto al NUOVO reminder
      fromUserId: doctorId,
      toUserId: r.patientId,
      senderRole: 'doctor',
      readAt: null
    });



    // --- fine blocco ---

    res.json({ success: true, nextReminder: nextDoc });
  } catch (e) {
    console.error('POST /reminders/:rid/complete', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /reminders/:rid — elimina un piano di promemoria
// DELETE /reminders/:rid — elimina reminder + messaggi collegati via reminderId
router.delete('/reminders/:rid', requireDoctor, async (req, res) => {
  try {
    const db       = await connectDB();
    const rid      = new ObjectId(req.params.rid);
    const doctorId = new ObjectId(req.userId);

    const r = await db.collection('reminders').findOne({ _id: rid });
    if (!r) return res.status(404).json({ error: 'Reminder not found' });

    const rel = await db.collection('isdoctorof').findOne({ doctorId, patients: r.patientId });
    if (!rel) return res.status(403).json({ error: 'Forbidden' });

    await db.collection('reminders').deleteOne({ _id: rid });

    // Solo messaggi con legame diretto
    const delRes = await db.collection('messages').deleteMany({
      patientId: r.patientId,
      reminderId: rid
    });

    res.json({ success: true, deletedMessages: delRes.deletedCount || 0 });
  } catch (e) {
    console.error('DELETE /reminders/:rid', e);
    res.status(500).json({ error: 'Server error' });
  }
});






export default router;
