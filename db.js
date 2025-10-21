// server/db.js
const mongoose = require('mongoose');

let isConnected = false;

async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('Missing MONGODB_URI in environment');
  }
  if (isConnected) return mongoose.connection;

  // Helpful defaults
  mongoose.set('strictQuery', true);
  if (process.env.MONGOOSE_DEBUG === 'true') mongoose.set('debug', true);

  // Optional: dbName can be supplied separately if your URI omits it
  const dbName = process.env.MONGO_DB_NAME || undefined;

  // Connect (Mongoose 7+ doesn’t need most legacy options)
  await mongoose.connect(uri, {
    dbName,
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10),
    serverSelectionTimeoutMS: 5000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });

  isConnected = true;

  mongoose.connection.on('connected', () => {
    console.log('[mongo] connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[mongo] connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[mongo] disconnected');
  });

  return mongoose.connection;
}

async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.connection.close(true);
  isConnected = false;
}

module.exports = { connectDB, disconnectDB };
