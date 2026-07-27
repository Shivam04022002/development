// config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Production-tuned connection pool + timeouts (override via env).
      maxPoolSize: Number(process.env.MONGO_MAX_POOL || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL || 2),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT || 10000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT || 45000),
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
   
export default connectDB;
