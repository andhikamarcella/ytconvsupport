import { json, handleError } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
    return json(res, 200, {
      ok: true,
      appName: process.env.APP_NAME || 'YTConv',
      supportEmail: process.env.SUPPORT_EMAIL || 'help.ytconv@proton.me',
      mainAppUrl: process.env.MAIN_APP_URL || 'https://ytconv.onrender.com',
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
      turnstileEnabled: Boolean(process.env.TURNSTILE_SITE_KEY)
    });
  } catch (error) {
    return handleError(res, error);
  }
}
