import { config } from './config.js';
import { run } from './db.js';
import { sendMail } from './mailer.js';
import { newId, nowIso } from './util.js';

/**
 * Tells the admins about something that needs attention. Always stored for the admin screen
 * (badge + list); emailed to ADMIN_EMAILS when SMTP is configured, otherwise printed in the console.
 * The email is sent in the background so the tenant's request isn't slowed down.
 */
export function notifyAdmins(kind, title, body) {
  const id = newId();
  const willEmail = config.emailProvider === 'smtp' && config.adminEmails.length > 0;
  run(
    'INSERT INTO admin_notifications (id, kind, title, body, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    kind,
    title,
    body,
    willEmail ? 'email' : 'console',
    nowIso(),
  );
  if (!willEmail) {
    console.log(`[admin] ${title}\n${body}`);
    return;
  }
  sendMail({ to: config.adminEmails.join(','), subject: `[Sira Stay] ${title}`, text: body }).catch((err) => {
    console.error('[admin] notification email failed', err);
    run("UPDATE admin_notifications SET channel = 'console' WHERE id = ?", id);
    console.log(`[admin] ${title}\n${body}`);
  });
}
