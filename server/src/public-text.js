import { findLocationLeaks } from './text-leaks.js';
import { HttpError } from './util.js';

const LABELS = {
  title: 'Title',
  description: 'Description',
  district: 'District / City',
  area: 'Area / Locality',
  landmark: 'Nearby landmark',
  comment: 'Review',
};
const LEAK_NAMES = { phone: 'a phone number', pincode: 'a pincode', door: 'a door or house number', street: 'a street address' };

/**
 * Public text — listing details and review comments — must not give the house away: tenants get the
 * address and the owner's phone number only after paying to unlock.
 */
export function assertNoLocationLeaks(fields) {
  for (const [field, value] of Object.entries(fields)) {
    const [leak] = findLocationLeaks(value ?? '');
    if (leak) {
      throw new HttpError(
        400,
        'TEXT_REVEALS_LOCATION',
        `${LABELS[field]} contains ${LEAK_NAMES[leak.kind]} ("${leak.text}"). Remove it — this is shown publicly, and the address and phone number are shared only after unlocking.`,
        { field, kind: leak.kind, match: leak.text },
      );
    }
  }
}
