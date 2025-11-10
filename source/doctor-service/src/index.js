
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { connectDB } from './db.js';
import doctorRouter from './routes/doctor.js';
import cron from 'node-cron';
import { ObjectId } from 'mongodb';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// CORS
app.use(cors({
  origin: ['http://localhost:9000', 'http://localhost:9001'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());

// --- Static files for uploads ---
const UPLOAD_DIR = path.resolve('uploads'); // cartella a livello progetto
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// serve i file caricati su /files/...
app.use('/files', express.static(UPLOAD_DIR));

// Routes
app.use('/', doctorRouter);

// Health-check
app.get('/health', async (req, res) => {
  try {
    const db = await connectDB();
    const cols = await db.listCollections().toArray();
    res.json({ status: 'OK', collections: cols.map(c => c.name) });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// Home
app.get('/', (_req, res) => {
  res.send('Welcome to a terrible Docker tutorial');
});

async function start() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB Atlas');

    const port = process.env.PORT || 4001; // <— default 4001 per coerenza
    app.listen(port, () => {
      console.log(`🚀 Server listening on http://localhost:${port}`);
    });

    const sendDueReminders = async () => {
      const db = await connectDB();
      const now = new Date();

      // con $expr confronto lastNotifiedAt != nextDueAt
      const due = await db.collection('reminders').aggregate([
        { $match: { active: true } },
        { $match: { $expr: { $and: [
          { $lte: ['$nextDueAt', now] },
          { $ne: ['$lastNotifiedAt', '$nextDueAt'] }
        ]}}}
      ]).toArray();

      for (const r of due) {
        const msg = {
          type: 'reminder',
          text: `È il momento di fare: ${r.title}${r.sector ? ` (${r.sector})` : ''}`,
          patientId: r.patientId,
          doctorId:  r.doctorId,
          reportId:  null,
          createdAt: now,
          fromUserId: r.doctorId,
          toUserId:   r.patientId,
          senderRole: 'doctor',
          readAt:     null
        };
        await db.collection('messages').insertOne(msg);

        // segna che per questa scadenza ho notificato
        await db.collection('reminders').updateOne(
          { _id: r._id },
          { $set: { lastNotifiedAt: r.nextDueAt, updatedAt: new Date() } }
        );
      }
      console.log(`[reminders] sent: ${due.length}`);
    };

    // esegui ogni giorno alle 08:00
    cron.schedule('0 8 * * *', sendDueReminders);
    // opzionale: all'avvio esegui una volta
    sendDueReminders().catch(()=>{});
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
