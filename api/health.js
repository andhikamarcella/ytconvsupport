import { storageHealth } from '../lib/cloudinary-store.js';
import { getEmailConfiguration } from '../lib/emailjs.js';
import { json, handleError } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Metode tidak diizinkan.' });
    const storage = await storageHealth();
    const email = getEmailConfiguration();
    return json(res, 200, {
      ok: storage.ok && email.configured,
      service: 'ytconv-support',
      storage,
      email: {
        provider: 'emailjs',
        configured: email.configured,
        missing: email.missing,
        inbox: email.inboxMasked,
        adminTemplateConfigured: Boolean(email.adminTemplateId),
        userTemplateConfigured: Boolean(email.userTemplateId),
        statusTemplateConfigured: Boolean(email.statusTemplateId),
        deliveryVerificationEnabled: Boolean(email.privateKey)
      },
      time: new Date().toISOString()
    });
  } catch (error) {
    return handleError(res, error);
  }
}
