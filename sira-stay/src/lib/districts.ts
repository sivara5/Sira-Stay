import type { Language } from './types';

/** The 38 districts of Tamil Nadu. `name` matches the value stored on listings. */
export const DISTRICTS = [
  { name: 'Ariyalur', ta: 'அரியலூர்' },
  { name: 'Chengalpattu', ta: 'செங்கல்பட்டு' },
  { name: 'Chennai', ta: 'சென்னை' },
  { name: 'Coimbatore', ta: 'கோயம்புத்தூர்' },
  { name: 'Cuddalore', ta: 'கடலூர்' },
  { name: 'Dharmapuri', ta: 'தருமபுரி' },
  { name: 'Dindigul', ta: 'திண்டுக்கல்' },
  { name: 'Erode', ta: 'ஈரோடு' },
  { name: 'Kallakurichi', ta: 'கள்ளக்குறிச்சி' },
  { name: 'Kanchipuram', ta: 'காஞ்சிபுரம்' },
  { name: 'Kanniyakumari', ta: 'கன்னியாகுமரி' },
  { name: 'Karur', ta: 'கரூர்' },
  { name: 'Krishnagiri', ta: 'கிருஷ்ணகிரி' },
  { name: 'Madurai', ta: 'மதுரை' },
  { name: 'Mayiladuthurai', ta: 'மயிலாடுதுறை' },
  { name: 'Nagapattinam', ta: 'நாகப்பட்டினம்' },
  { name: 'Namakkal', ta: 'நாமக்கல்' },
  { name: 'Nilgiris', ta: 'நீலகிரி' },
  { name: 'Perambalur', ta: 'பெரம்பலூர்' },
  { name: 'Pudukkottai', ta: 'புதுக்கோட்டை' },
  { name: 'Ramanathapuram', ta: 'இராமநாதபுரம்' },
  { name: 'Ranipet', ta: 'இராணிப்பேட்டை' },
  { name: 'Salem', ta: 'சேலம்' },
  { name: 'Sivaganga', ta: 'சிவகங்கை' },
  { name: 'Tenkasi', ta: 'தென்காசி' },
  { name: 'Thanjavur', ta: 'தஞ்சாவூர்' },
  { name: 'Theni', ta: 'தேனி' },
  { name: 'Thoothukudi', ta: 'தூத்துக்குடி' },
  { name: 'Tiruchirappalli', ta: 'திருச்சிராப்பள்ளி' },
  { name: 'Tirunelveli', ta: 'திருநெல்வேலி' },
  { name: 'Tirupathur', ta: 'திருப்பத்தூர்' },
  { name: 'Tiruppur', ta: 'திருப்பூர்' },
  { name: 'Tiruvallur', ta: 'திருவள்ளூர்' },
  { name: 'Tiruvannamalai', ta: 'திருவண்ணாமலை' },
  { name: 'Tiruvarur', ta: 'திருவாரூர்' },
  { name: 'Vellore', ta: 'வேலூர்' },
  { name: 'Viluppuram', ta: 'விழுப்புரம்' },
  { name: 'Virudhunagar', ta: 'விருதுநகர்' },
] as const;

export type District = (typeof DISTRICTS)[number]['name'];

/** Shown before "View All Districts". */
export const DEFAULT_DISTRICTS: District[] = ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli'];

export const districtLabel = (name: string, lang: Language) =>
  lang === 'ta' ? (DISTRICTS.find((d) => d.name === name)?.ta ?? name) : name;

/** Lets Tamil users search "மதுரை" — listings store English district names. */
export const searchTerm = (text: string) => DISTRICTS.find((d) => d.ta === text.trim())?.name ?? text.trim();
