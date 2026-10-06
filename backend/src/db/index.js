import { MongoClient } from 'mongodb';
import config from '../config.js';
import { logServer, logError } from '../utils/logger.js';

let client = null;
let db = null;

export async function connectMongo() {
  if (db) return db;

  const uri = config.mongoUri;
  const dbName = config.mongoDbName;

  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  try {
    await client.connect();
    db = client.db(dbName);
    logServer(`MongoDB connected: ${dbName}`);
    return db;
  } catch (error) {
    logError('MONGO', `Connection failed: ${error.message}`);
    throw error;
  }
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logServer('MongoDB connection closed');
  }
}

export function getDb() {
  if (!db) {
    throw new Error('MongoDB not initialized. Call connectMongo() first.');
  }
  return db;
}

export function isConnected() {
  return db !== null && client?.topology?.isConnected() === true;
}