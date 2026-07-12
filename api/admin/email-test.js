import { sendEmailTest, getEmailConfiguration } from '../../lib/emailjs.js';
import { json, handleError } from '../../lib/http.js';
import { requireAdmin } from '../../lib/security.js';

export default async function handler(req, res) {
  try {
    requireAdmin(req);
    if (req.method === 'GET') {
      const config = getEmailConfiguration();
      return json(res, 200, {
        ok: true,
        email: {
          configured: config.configured,
          missing: config.missing,
          inbox: config.inboxMasked,
          privateKeyConfigured: Boolean(config.privateKey)
        }
      });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
    const delivery = await sendEmailTest();
    return json(res, 200, { ok: true, message: 'Permintaan email uji diterima EmailJS.', delivery });
  } catch (error) {
    return handleError(res, error);
  }
}
