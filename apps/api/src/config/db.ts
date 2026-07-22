import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Connects to MongoDB using the configured URI.
 */
export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  console.log('MongoDB connected');
}

/**
 * Disconnects from MongoDB (used in tests/seed cleanup).
 */
export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
