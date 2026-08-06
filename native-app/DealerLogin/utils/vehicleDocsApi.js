import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE } from '../config';

/**
 * vehicleDocsApi — the RC & Number Plate endpoints, in one place.
 *
 * Follows the app's established call style: axios for JSON reads and fetch for
 * multipart uploads (React Native must set the multipart boundary itself, which
 * it only does when the body is a FormData passed to fetch), with the bearer
 * token read from the same `userToken` key every other screen uses.
 */

const UPLOAD_TIMEOUT_MS = 60000; // matches ApplicationFormScreen's upload timeout

const authHeaders = async () => {
  const token = await AsyncStorage.getItem('userToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Approved applications belonging to the dealer whose RC is still pending.
 * `search` is applied BY THE BACKEND across Loan Number, Customer Name and
 * Mobile Number — never filter this list locally.
 */
export async function fetchPendingRc(search) {
  const headers = await authHeaders();
  const { data } = await axios.get(`${API_BASE}/api/rc/pending`, {
    headers,
    params: search ? { search } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

/**
 * One approved application, used to fill in the fields the pending list does
 * not carry (Dealer Name, Branch, Loan Amount). Existing dealer endpoint;
 * ownership is enforced server-side.
 */
export async function fetchApprovedApplication(applicationId) {
  const headers = await authHeaders();
  const { data } = await axios.get(`${API_BASE}/api/approved-files/${applicationId}`, { headers });
  return data;
}

/**
 * Approved applications belonging to the dealer whose number plate is still
 * pending. Same server-side search contract as fetchPendingRc.
 */
export async function fetchPendingNumberPlate(search) {
  const headers = await authHeaders();
  const { data } = await axios.get(`${API_BASE}/api/number-plate/pending`, {
    headers,
    params: search ? { search } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

/**
 * POST a multipart body and normalise the outcome.
 *
 * fetch (not axios) so React Native sets the multipart boundary itself — the
 * same approach ApplicationFormScreen uses. Errors carry the server's own
 * message where it sends one, so callers can surface it directly.
 */
async function postMultipart(pathname, form, timeoutMs) {
  const headers = await authHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${pathname}`, {
      method: 'POST',
      body: form,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || `Upload failed (HTTP ${res.status})`);
    }
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

/** A picker object { uri, type, name } as a multipart file part. */
const filePart = (image) => ({ uri: image.uri, type: image.type, name: image.name });

/**
 * Upload both RC images. Field names are the canonical ones the backend expects.
 */
export async function uploadRc(applicationId, front, back, { timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  const form = new FormData();
  form.append('rcFront', filePart(front));
  form.append('rcBack', filePart(back));
  return postMultipart(`/api/rc/upload/${applicationId}`, form, timeoutMs);
}

/**
 * Upload the number plate photo and its number. The plate number is trimmed and
 * upper-cased HERE, so every caller sends the same canonical value regardless of
 * how it was typed.
 */
export async function uploadNumberPlate(applicationId, image, plateNumber, { timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  const form = new FormData();
  form.append('plateImage', filePart(image));
  form.append('plateNumber', normalisePlateNumber(plateNumber));
  return postMultipart(`/api/number-plate/upload/${applicationId}`, form, timeoutMs);
}

/** Canonical plate-number form: trimmed, inner whitespace collapsed, upper-cased. */
export function normalisePlateNumber(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export default {
  fetchPendingRc,
  fetchPendingNumberPlate,
  fetchApprovedApplication,
  uploadRc,
  uploadNumberPlate,
  normalisePlateNumber,
};
