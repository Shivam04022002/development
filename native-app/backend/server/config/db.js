import mongoose from "mongoose";

// Main DB (for dealer)
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Production-tuned connection pool + timeouts (override via env).
      maxPoolSize: Number(process.env.MONGO_MAX_POOL || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL || 2),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT || 10000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT || 45000),
    });
    console.log(`Main MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Main DB connection error: ${error.message}`);
    process.exit(1);
  }
};
export default connectDB;

