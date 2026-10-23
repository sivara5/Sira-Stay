/**
 * Finds details in public listing text (title, description, district, area, landmark) that give away the
 * house before a tenant pays to unlock: phone numbers, door/house numbers, pincodes and street addresses.
 *
 * Mirrors server/src/text-leaks.js rule for rule; both are tested against shared/location-leak-cases.json.
 */
export type LeakKind = 'phone' | 'pincode' | 'door' | 'street';
export type LocationLeak = { kind: LeakKind; text: string };

type Rule = { kind: LeakKind; pattern: RegExp; skip?: (before: string, after: string) => boolean };

// Words between a number and a street name that make it a landmark or a distance, not an address.
const NOT_ADDRESS = '(?:near|opp|opposite|behind|beside|next|off|from|to|via|towards)';
const UNITS = '(?:min|mins|minute|minutes|km|kms|m|mtr|mtrs|meter|meters|metre|metres|feet|ft|bhk|floor|floors|sq|sqft|walk|walking|cents|acre|acres)';
// Kinds of street a door number sits on (not "Nagar" — area names are public).
const STREET = '(?:street|st|road|rd|salai|lane|ln|cross|avenue|ave|theru|veedhi)';
const DOOR_NO = String.raw`\d{1,4}[a-z]?(?:\s*\/\s*\d{1,4}[a-z]?)?`;
const WORD = String.raw`[a-z0-9.'&-]+`;
// A 6-digit number is an amount, not a pincode, right after a money word ("Deposit 150000", "Rent is
// 120000", "Rs.120000") or right before one ("150000/-", "120000 per month", "150000 rupees").
const MONEY = '(?:₹|rs\\.?|inr|rupees?|rent|deposit|advance|maintenance|price|cost|amount|fees?|charges?|budget|emi|salary|token|lease|total|payable|worth)';
const MONEY_BEFORE = new RegExp(String.raw`(?:^|[^a-z])${MONEY}(?![a-z])[^a-z0-9]*(?:[a-z0-9]+[^a-z0-9]+){0,2}$`, 'i');
const MONEY_AFTER = /^\s*(?:\/-|rs\b|rupees?\b|inr\b|only\b|per\b|p\.?\s?m\b|\/\s*(?:month|mo|year|yr|annum)\b|lakhs?\b|deposit\b|advance\b|rent\b|maintenance\b)/i;

const RULES: Rule[] = [
  // Mobile numbers, digits may be split by spaces, dots or dashes: "98765 43210", "+91 98765-43210".
  { kind: 'phone', pattern: /(?<![\d+])(?:(?:\+|00)?91[\s.-]{0,2})?[6-9](?:[\s.-]{0,2}\d){9}(?!\d)/g },
  // Landlines with the STD code: "044 2345 6789", "0422-2345678".
  { kind: 'phone', pattern: /(?<!\d)0(?:[\s.-]{0,2}\d){10}(?!\d)/g },
  // Indian pincodes, 6 digits starting 1–9 ("560038", "400 001") — but not amounts or decimals.
  {
    kind: 'pincode',
    pattern: /(?<!\d)(?<!\d[.,])[1-9]\d{2} ?\d{3}(?!\d)(?![.,]\d)/g,
    skip: (before, after) => MONEY_BEFORE.test(before) || MONEY_AFTER.test(after),
  },
  // "Door No 12", "D.No. 5/2", "Plot No: 45", "Flat No 4B", "House number 7".
  {
    kind: 'door',
    pattern: new RegExp(
      String.raw`\b(?:door|house|flat|plot|apartment|apt|unit|block|villa|site|shop|h|d)\.?\s*(?:no\b\.?|number|#)\s*[:.#-]?\s*${DOOR_NO}\b`,
      'gi',
    ),
  },
  // "Flat 4B", "Plot 45", "Door 12".
  { kind: 'door', pattern: new RegExp(String.raw`\b(?:door|flat|plot)\s*[:#-]?\s*${DOOR_NO}\b`, 'gi') },
  // "No. 12", "No 12/3", "Old No 5" — but not "No 2-wheeler parking".
  { kind: 'door', pattern: new RegExp(String.raw`\bno\b\.?\s*[:#-]?\s*${DOOR_NO}\b(?!\s*-?\s*wheeler)`, 'gi') },
  // "#23"
  { kind: 'door', pattern: new RegExp(String.raw`(?<![\w&])#\s*${DOOR_NO}\b`, 'gi') },
  // Tamil "எண் 12" (number), as in "கதவு எண் 12".
  { kind: 'door', pattern: new RegExp(String.raw`எண்\s*[:.#-]?\s*${DOOR_NO}(?![\d/])`, 'gi') },
  // "12, 3rd Street", "22, Green Meadows, Sathy Road": a door number, a comma, then a street within four words.
  {
    kind: 'street',
    pattern: new RegExp(String.raw`\b${DOOR_NO}\s*,\s*(?:(?!${NOT_ADDRESS}\b)${WORD}[\s,]+){0,4}${STREET}\b`, 'gi'),
  },
  // "18 Gandhi Street": no comma, so at most two words between, none a distance or size ("5 min to GST Road").
  {
    kind: 'street',
    pattern: new RegExp(String.raw`\b${DOOR_NO}\s+(?:(?!(?:${NOT_ADDRESS}|${UNITS})\b)${WORD}\s+){0,2}${STREET}\b`, 'gi'),
  },
  // "3rd Street", "2nd Cross", "4th Lane": small residential streets (not "2nd Avenue" or "1st Main Road").
  { kind: 'street', pattern: /\b\d{1,3}(?:st|nd|rd|th)\s+(?:street|st|cross|lane|ln|theru)\b/gi },
  // Tamil: "12, காந்தி தெரு" and "3வது தெரு".
  { kind: 'street', pattern: /\d{1,4}\s*,\s*(?:[^\s,]+[\s,]+){0,3}(?:தெரு|வீதி|சாலை)/g },
  { kind: 'street', pattern: /\d{1,3}\s*(?:வது|ஆவது)\s*(?:குறுக்குத்\s*)?(?:தெரு|வீதி)/g },
];

/** Every leak in `text`, in reading order. Where two rules match the same words, the earlier, longer one wins. */
export function findLocationLeaks(text: string): LocationLeak[] {
  const found: { kind: LeakKind; start: number; end: number; text: string }[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (rule.skip?.(text.slice(0, start), text.slice(end))) continue;
      found.push({ kind: rule.kind, start, end, text: m[0].trim() });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const leaks: LocationLeak[] = [];
  let reached = -1;
  for (const f of found) {
    if (f.start < reached) continue;
    leaks.push({ kind: f.kind, text: f.text });
    reached = f.end;
  }
  return leaks;
}
