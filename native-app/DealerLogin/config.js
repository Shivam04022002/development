/**
 * API Configuration
 *
 * Set IS_PRODUCTION to true when building APK for production.
 * Set to false for local development with Expo Go.
 */

const IS_PRODUCTION = true;

const PRODUCTION_API = 'https://dealerapi.surjitfinance.com';
const LOCAL_API = 'http://192.168.29.103:5000';

export const API_BASE = IS_PRODUCTION ? PRODUCTION_API : LOCAL_API;

export const getApiUrl = (endpoint) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE}${path}`;
};

export default { API_BASE, IS_PRODUCTION, getApiUrl };
