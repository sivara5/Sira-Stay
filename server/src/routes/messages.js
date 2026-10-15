import { Router } from 'express';

import { requireRegistered } from '../auth.js';
import { all, one, run } from '../db.js';
import { getPropertyOr404, hasContactAccess } from '../services.js';
import { HttpError, newId, nowIso, requireString } from '../util.js';

export const conversationsRouter = Router();

/** Conversations are keyed by (property, tenant). Owners see one thread per interested tenant. */
function threadAccess(req) {
  const property = getPropertyOr404(req.params.propertyId);
  const tenantId = req.params.tenantId;
  const isOwner = property.owner_id === req.user.id;
  const isTenant = tenantId === req.user.id && !isOwner;
  if (!isOwner && !isTenant) throw new HttpError(403, 'FORBIDDEN', 'You are not part of this conversation.');
  if (isTenant && !hasContactAccess(req.user, property)) {
    throw new HttpError(403, 'LOCKED', 'Unlock owner contact to message the owner.');
  }
  return { property, tenantId, isOwner };
}

function toMessage(m, userId) {
  return { id: m.id, kind: m.kind, body: m.body, createdAt: m.created_at, mine: m.sender_id === userId, system: m.sender_id === null };
}

conversationsRouter.get('/', requireRegistered, (req, res) => {
  const threads = all(
    `SELECT m.property_id, m.tenant_id, MAX(m.created_at) AS last_at
       FROM messages m JOIN properties p ON p.id = m.property_id
      WHERE m.tenant_id = ? OR p.owner_id = ?
      GROUP BY m.property_id, m.tenant_id
      ORDER BY last_at DESC`,
    req.user.id,
    req.user.id,
  );
  res.json({
    conversations: threads.map((t) => {
      const property = one('SELECT id, title, owner_id FROM properties WHERE id = ?', t.property_id);
      const isOwner = property.owner_id === req.user.id;
      const other = one('SELECT name, email FROM users WHERE id = ?', isOwner ? t.tenant_id : property.owner_id);
      const last = one(
        'SELECT * FROM messages WHERE property_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        t.property_id,
        t.tenant_id,
      );
      const unread = one(
        `SELECT COUNT(*) AS n FROM messages WHERE property_id = ? AND tenant_id = ? AND ${isOwner ? 'read_by_owner' : 'read_by_tenant'} = 0
           AND (sender_id IS NULL OR sender_id <> ?)`,
        t.property_id,
        t.tenant_id,
        req.user.id,
      ).n;
      const cover = one('SELECT url FROM photos WHERE property_id = ? ORDER BY position LIMIT 1', property.id);
      return {
        propertyId: property.id,
        tenantId: t.tenant_id,
        propertyTitle: property.title,
        coverPhoto: cover?.url ?? null,
        otherName: other.name || (isOwner ? other.email.split('@')[0] : 'Owner'),
        lastMessage: toMessage(last, req.user.id),
        unread,
        role: isOwner ? 'owner' : 'tenant',
      };
    }),
  });
});

conversationsRouter.get('/:propertyId/:tenantId', requireRegistered, (req, res) => {
  const { property, tenantId, isOwner } = threadAccess(req);
  run(
    `UPDATE messages SET ${isOwner ? 'read_by_owner' : 'read_by_tenant'} = 1 WHERE property_id = ? AND tenant_id = ?`,
    property.id,
    tenantId,
  );
  const messages = all('SELECT * FROM messages WHERE property_id = ? AND tenant_id = ? ORDER BY created_at', property.id, tenantId);
  const other = one('SELECT name, email, available FROM users WHERE id = ?', isOwner ? tenantId : property.owner_id);
  res.json({
    propertyTitle: property.title,
    otherName: other.name || (isOwner ? other.email.split('@')[0] : 'Owner'),
    ownerAvailable: isOwner ? undefined : Boolean(other.available),
    messages: messages.map((m) => toMessage(m, req.user.id)),
  });
});

conversationsRouter.post('/:propertyId/:tenantId', requireRegistered, (req, res) => {
  const { property, tenantId, isOwner } = threadAccess(req);
  const body = requireString(req.body?.body, 'Message', { min: 1, max: 1000 });
  const id = newId();
  run(
    `INSERT INTO messages (id, property_id, tenant_id, sender_id, kind, body, created_at, read_by_tenant, read_by_owner)
     VALUES (?, ?, ?, ?, 'text', ?, ?, ?, ?)`,
    id,
    property.id,
    tenantId,
    req.user.id,
    body,
    nowIso(),
    isOwner ? 0 : 1,
    isOwner ? 1 : 0,
  );
  res.status(201).json({ message: toMessage(one('SELECT * FROM messages WHERE id = ?', id), req.user.id) });
});
