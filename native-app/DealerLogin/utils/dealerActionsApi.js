import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE } from '../config';

/**
 * dealerActionsApi — the Dealer Action Center endpoints.
 *
 * Same call style as utils/vehicleDocsApi.js: axios for JSON reads, fetch for
 * the multipart upload (React Native only sets the multipart boundary itself
 * when a FormData is passed to fetch), with the bearer token read from the same
 * `userToken` key every other screen uses.
 */

const UPLOAD_TIMEOUT_MS = 60000; // matches the other upload paths

const authHeaders = async () => {
  const token = await AsyncStorage.getItem('userToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Pending actions across all of this dealer's applications, plus counters. */
export async function fetchDealerActions() {
  const headers = await authHeaders();
  const { data } = await axios.get(`${API_BASE}/api/dealer-actions`, { headers });
  return {
    counters: data?.counters || { pendingActions: 0, completedToday: 0, applicationsAwaitingDealer: 0 },
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

/** Every document and its verification state for one application. */
export async function fetchApplicationActions(applicationId) {
  const headers = await authHeaders();
  const { data } = await axios.get(`${API_BASE}/api/dealer-actions/${applicationId}`, { headers });
  return data;
}

/**
 * Upload a replacement document. `image` is a picker object { uri, type, name }.
 * The server versions the file and sets the status back to Pending — a dealer
 * can never mark their own document verified.
 */
export async function uploadReplacement(applicationId, role, field, image, response = '') {
  const headers = await authHeaders();
  const form = new FormData();
  form.append('document', { uri: image.uri, type: image.type, name: image.name });
  if (response) form.append('response', response);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${API_BASE}/api/dealer-actions/${applicationId}/documents/${role}/${field}`,
      { method: 'POST', body: form, headers, signal: controller.signal }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || `Upload failed (HTTP ${res.status})`);
    }
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

export default { fetchDealerActions, fetchApplicationActions, uploadReplacement };
