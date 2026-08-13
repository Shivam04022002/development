/**
 * API Configuration — the single source of truth for the backend URL.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_BASE. Expo inlines every EXPO_PUBLIC_* variable into the
 *      JS bundle at build time. Set it in `.env` for local / Gradle builds, or
 *      in the `env` block of the build profile in eas.json for EAS builds.
 *   2. API_ENVIRONMENTS[DEFAULT_ENVIRONMENT], used when that variable is absent,
 *      so an unconfigured build still targets a known backend rather than
 *      falling back to nothing.
 *
 * Never write a backend URL anywhere else in the app — import API_BASE instead.
 */

export const API_ENVIRONMENTS = {
  // V2 development server.
  development: 'https://v2api.surjitfinance.com',
  // V1 production. Selected by the `production` EAS build profile.
  production: 'https://dealerapi.surjitfinance.com',
  // Mobile backend on the LAN, for Expo Go against a development machine.
  local: 'http://192.168.29.103:5000',
};

// Backend used when EXPO_PUBLIC_API_BASE is not set.
//
// This is production, so an unconfigured build targets the live backend rather
// than the V2 development server. The failure it prevents is the dangerous
// direction: a release APK built with a plain `gradlew assembleRelease` and no
// .env used to point at V2, which would have had real dealers writing real
// applications into the development database, silently and with no error.
//
// The cost is that a local build with no .env now reaches production, so set
// EXPO_PUBLIC_API_BASE (or use the `development`/`preview` EAS profile, both of
// which pin V2 explicitly) when building for development.
const DEFAULT_ENVIRONMENT = 'production';

const stripTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const FROM_ENV = stripTrailingSlash(process.env.EXPO_PUBLIC_API_BASE);

export const API_BASE = FROM_ENV || API_ENVIRONMENTS[DEFAULT_ENVIRONMENT];

export const IS_PRODUCTION = API_BASE === API_ENVIRONMENTS.production;
