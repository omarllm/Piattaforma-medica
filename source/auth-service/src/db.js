// src/db.js
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('🔑 MONGODB_URI is not defined in .env');

const client = new MongoClient(uri);

let dbInstance = null;

export async function connectDB() {
  if (!dbInstance) {
    // Effettua la connessione solo la prima volta
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');
    dbInstance = client.db(process.env.DB_NAME || 'labmed');
  }
  return dbInstance;
}
