import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';

import connectDB from './config/db.js';
import applicationRoutes from './routes/applicationRoutes.js';
import authRoutes from './routes/authRoutes.js';
import pendingFilesRoutes from "./routes/pendingFilesRoutes.js";
import rejectedFilesRoutes from "./routes/rejectedFilesRoutes.js";
import approvedFilesRoutes from "./routes/approvedFilesRoutes.js";
import profileRoutes from './routes/profileRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import rcRoutes from './routes/rcRoutes.js';
import numberPlateRoutes from './routes/numberPlateRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { secureHeaders, rateLimit } from './middleware/security.js';
import { logError } from './utils/log.js';
import { UPLOADS_ROOT } from './utils/fileStorage.js';

// Last-resort process-level handlers — structured logs, process stays observable.
process.on('unhandledRejection', (reason) => {
  logError('unhandled_rejection', { reason: reason?.message || String(reason) });
});
process.on('uncaughtException', (error) => {
  logError('uncaught_exception', { message: error?.message, stack: error?.stack });
});

const app = express();

// Secure response headers (helmet-equivalent) + rate limiting.
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(secureHeaders);

// Parse JSON & URL-encoded bodies (file uploads go through multer separately)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const size = req.headers['content-length'] || 0;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${size} bytes`);
  next();
});

// CORS
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['https://dealerapi.surjitfinance.com'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Health / monitoring endpoints (public, read-only)
app.use('/health', healthRoutes);

// Rate limiting (defense in depth). Stricter on auth + upload.
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, max: 50, message: 'Too many login attempts. Try again later.' }));
app.use('/api/upload', rateLimit({ windowMs: 60_000, max: 60 }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

// Public serving of uploaded IMAGES only (mirrors the previous public Cloudinary
// URLs for in-app display). Non-image files — CIBIL raw JSON, Credit Note PDFs,
// and any other document — are NOT public; they are served only via the
// authenticated /api/files route. This prevents leaking sensitive files.
const PUBLIC_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

// Phase 7 — RC, Number Plate and SPDC images are NOT public. Nothing renders
// them from a public URL (the dealer app only uploads them; the admin portal
// reads them through the authenticated /api/files route), so serving them here
// would expose vehicle documents to anyone who can guess a loan number. Matched
// on the exact basenames written by the vehicle-document endpoints, so the
// pre-existing vehicle photos in the same folder keep working.
const PRIVATE_DOC_BASENAMES = /^(rc-front|rc-back|number-plate|spdc)\.[a-z0-9]+$/i;

app.use('/files', (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (!PUBLIC_IMAGE_EXT.has(ext)) return res.status(404).json({ error: 'Not found' });
  if (PRIVATE_DOC_BASENAMES.test(path.basename(req.path))) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}, express.static(UPLOADS_ROOT, { fallthrough: false, index: false, dotfiles: 'deny' }));

// Routes
app.use('/api/applications', applicationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/pending-files', pendingFilesRoutes);
app.use('/api/rejected', rejectedFilesRoutes);
app.use('/api/approved-files', approvedFilesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
// RC & Number Plate module (dealer side)
app.use('/api/rc', rcRoutes);
app.use('/api/number-plate', numberPlateRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    status: 'success',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  logError('server_error', { method: req.method, path: req.originalUrl, status: statusCode, message: err?.message || String(err) });
  res.status(statusCode).json({
    error: err?.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err?.stack }),
  });
});

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});