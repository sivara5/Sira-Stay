/** The 38 districts of Tamil Nadu, with spellings owners commonly type instead. */
export const DISTRICTS = {
  Ariyalur: [],
  Chengalpattu: ['Chengalpet'],
  Chennai: ['Madras'],
  Coimbatore: ['Kovai'],
  Cuddalore: [],
  Dharmapuri: [],
  Dindigul: [],
  Erode: [],
  Kallakurichi: [],
  Kanchipuram: ['Kancheepuram'],
  Kanniyakumari: ['Kanyakumari', 'Nagercoil'],
  Karur: [],
  Krishnagiri: [],
  Madurai: [],
  Mayiladuthurai: [],
  Nagapattinam: [],
  Namakkal: [],
  Nilgiris: ['The Nilgiris', 'Ooty', 'Udhagamandalam'],
  Perambalur: [],
  Pudukkottai: ['Pudukottai'],
  Ramanathapuram: [],
  Ranipet: [],
  Salem: [],
  Sivaganga: ['Sivagangai'],
  Tenkasi: [],
  Thanjavur: ['Tanjore'],
  Theni: [],
  Thoothukudi: ['Tuticorin'],
  Tiruchirappalli: ['Trichy', 'Tiruchi', 'Tiruchirapalli'],
  Tirunelveli: ['Nellai'],
  Tirupathur: ['Tirupattur'],
  Tiruppur: ['Tirupur'],
  Tiruvallur: ['Thiruvallur'],
  Tiruvannamalai: ['Thiruvannamalai'],
  Tiruvarur: ['Thiruvarur'],
  Vellore: [],
  Viluppuram: ['Villupuram'],
  Virudhunagar: [],
};

const canonical = new Map();
for (const [name, aliases] of Object.entries(DISTRICTS)) {
  for (const n of [name, ...aliases]) canonical.set(n.toLowerCase(), name);
}

/** "trichy" → "Tiruchirappalli"; null when the text isn't a known district or alias. */
export const canonicalDistrict = (text) => canonical.get(String(text ?? '').trim().toLowerCase()) ?? null;

/** Lower-cased spellings stored listings may use for a district (canonical name + aliases). */
export function districtSpellings(text) {
  const name = canonicalDistrict(text);
  if (!name) return [String(text ?? '').trim().toLowerCase()];
  return [name, ...DISTRICTS[name]].map((n) => n.toLowerCase());
}
