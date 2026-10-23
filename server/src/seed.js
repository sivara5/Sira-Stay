import { one, run, tx } from './db.js';
import { APPROX_RADIUS_M, fuzzLocation } from './geo.js';
import { encryptJson, newId, nowIso } from './util.js';

const photo = (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;

const OWNERS = [
  { id: 'demo-owner-1', email: 'owner1@demo.sirastay.in', name: 'Senthil Kumar', phone: '+919876500001', available: 1 },
  // Marked unavailable so the "Owner not available, try again later" flow can be tried.
  { id: 'demo-owner-2', email: 'owner2@demo.sirastay.in', name: 'Lakshmi Raman', phone: '+919876500002', available: 0 },
];

const I = {
  living: '1502672260266-1c1ef2d93688',
  apartment: '1560448204-e02f11c3d0e2',
  apartment2: '1522708323590-d24dbb6b0267',
  bedroom: '1505691938895-1758d7feb511',
  kitchen: '1484154218962-a197022b5858',
  living2: '1493809842364-78817add7ffb',
  interior: '1554995207-c18c203602cb',
  interior2: '1586023492125-27b2c045efd7',
  bedroom2: '1615874959474-d609969a20ed',
  bedroom3: '1555854877-bab0e564b8d5',
  bedroom4: '1540518614846-7eded433c457',
  room: '1631049307264-da0ec9d70304',
  kitchen2: '1556909114-f6e7ad7d3136',
  living3: '1507089947368-19c1da9775ae',
  bedroom5: '1598928506311-c55ded91a20c',
  interior3: '1583847268964-b28dc8f51f92',
  kitchen3: '1600566753190-17f0baa2a6c3',
  living4: '1600607687939-ce8a6c25118c',
  bedroom6: '1595526114035-0d45ed16cfbf',
};
const E = {
  villa: '1512917774080-9991f1c4c750',
  modern: '1600596542815-ffad4c1539a9',
  house: '1600585154340-be6161a56a0c',
  house2: '1568605114967-8130f3a36994',
  house3: '1570129477492-45c003edd2be',
  villa2: '1580587771525-78b9dba3b914',
  house4: '1564013799919-ab600027ffc6',
  villa3: '1613490493576-7fde63acd811',
  house5: '1576941089067-2de3c901e126',
};

const LISTINGS = [
  {
    owner: 0, category: 'apartments', title: 'Furnished 1BHK apartment near Tower Park',
    description: 'Bright, well-ventilated first-floor apartment with attached bathroom. Quiet street, 5 minutes walk to Anna Nagar Tower Park and bus stop.',
    rent: 9000, deposit: 30000, booking: 2000, furnishing: 'furnished', amenities: ['wifi', 'power_backup', 'water_24x7'],
    district: 'Chennai', area: 'Anna Nagar', landmark: 'Anna Nagar Tower Park',
    address: '12, 3rd Street, AE Block, Anna Nagar West, Chennai 600040', lat: 13.0878, lng: 80.2101,
    photos: [['interior', I.bedroom], ['interior', I.interior], ['exterior', E.house3]],
  },
  {
    owner: 1, category: 'apartments', title: '2BHK apartment with balcony, Gandhipuram',
    description: 'Spacious apartment for a small family or working professionals. Separate entrance, 24x7 water supply.',
    rent: 6500, deposit: 20000, booking: 1500, furnishing: 'semi_furnished', amenities: ['water_24x7', 'parking'],
    district: 'Coimbatore', area: 'Gandhipuram', landmark: 'Gandhipuram Town Bus Stand',
    address: '45, Cross Cut Road, Gandhipuram, Coimbatore 641012', lat: 11.0168, lng: 76.9674,
    photos: [['interior', I.bedroom2], ['interior', I.room], ['exterior', E.house2]],
  },
  {
    owner: 0, category: 'villas', title: '3BHK private villa with garden, ECR',
    description: 'Independent villa with a private garden, covered car parking and a modular kitchen. 10 minutes from the beach.',
    rent: 65000, deposit: 300000, booking: 15000, furnishing: 'furnished', amenities: ['ac', 'parking', 'power_backup', 'cctv', 'kitchen'],
    district: 'Chennai', area: 'Injambakkam (ECR)', landmark: 'VGP Golden Beach',
    address: '7, Kamaraj Salai, Injambakkam, Chennai 600115', lat: 12.9165, lng: 80.2507,
    photos: [['exterior', E.villa], ['exterior', E.villa2], ['interior', I.living], ['interior', I.kitchen], ['interior', I.bedroom3]],
  },
  {
    owner: 1, category: 'villas', title: 'Modern 4BHK villa, Saravanampatti',
    description: 'Gated community villa near the IT corridor. Clubhouse, children’s play area and 24x7 security.',
    rent: 48000, deposit: 200000, booking: 10000, furnishing: 'semi_furnished', amenities: ['parking', 'cctv', 'power_backup', 'lift'],
    district: 'Coimbatore', area: 'Saravanampatti', landmark: 'KGiSL Tech Park',
    address: '22, Green Meadows, Sathy Road, Saravanampatti, Coimbatore 641035', lat: 11.079, lng: 76.996,
    photos: [['exterior', E.modern], ['exterior', E.villa3], ['interior', I.living4], ['interior', I.kitchen3]],
  },
  {
    owner: 0, category: 'pg', title: 'Ladies PG with food, Velachery',
    description: 'Safe and clean ladies PG with three meals a day, Wi-Fi and washing machine. Walking distance to Velachery MRTS.',
    rent: 7500, deposit: 7500, booking: 1000, furnishing: 'furnished', amenities: ['wifi', 'food', 'washing_machine', 'cctv', 'power_backup'],
    district: 'Chennai', area: 'Velachery', landmark: 'Phoenix MarketCity',
    address: '3, Taramani Link Road, Velachery, Chennai 600042', lat: 12.9791, lng: 80.2209,
    photos: [['interior', I.bedroom4], ['interior', I.interior2], ['exterior', E.house4]],
  },
  {
    owner: 1, category: 'pg', title: 'Gents PG near Periyar Bus Stand',
    description: 'Affordable gents PG with home-style food. Ideal for students and job seekers.',
    rent: 5500, deposit: 5000, booking: 800, furnishing: 'furnished', amenities: ['wifi', 'food', 'water_24x7'],
    district: 'Madurai', area: 'Simmakkal', landmark: 'Periyar Bus Stand',
    address: '18, North Veli Street, Simmakkal, Madurai 625001', lat: 9.9252, lng: 78.1198,
    photos: [['interior', I.room], ['interior', I.bedroom5], ['exterior', E.house5]],
  },
  {
    owner: 0, category: 'house', title: '2BHK independent house, East Tambaram',
    description: 'Ground floor 2BHK with car parking, borewell + corporation water. Close to schools and the railway station.',
    rent: 16000, deposit: 80000, booking: 4000, furnishing: 'semi_furnished', amenities: ['parking', 'water_24x7'],
    district: 'Chennai', area: 'East Tambaram', landmark: 'Tambaram Railway Station',
    address: '9, Bharathi Nagar 2nd Street, East Tambaram, Chennai 600059', lat: 12.9249, lng: 80.1275,
    photos: [['exterior', E.house], ['interior', I.living2], ['interior', I.kitchen2], ['interior', I.bedroom6]],
  },
  {
    owner: 1, category: 'house', title: '3BHK house near Srirangam temple',
    description: 'Traditional-style 3BHK in a peaceful street, two minutes from the Rajagopuram.',
    rent: 14000, deposit: 70000, booking: 3000, furnishing: 'unfurnished', amenities: ['parking'],
    district: 'Tiruchirappalli', area: 'Srirangam', landmark: 'Srirangam Rajagopuram',
    address: '31, North Chitrai Street, Srirangam, Tiruchirappalli 620006', lat: 10.8622, lng: 78.6896,
    photos: [['exterior', E.house2], ['interior', I.living3], ['interior', I.interior3]],
  },
  {
    owner: 0, category: 'room_sharing', title: 'Twin sharing AC room for professionals, OMR',
    description: 'Twin sharing in a fully furnished 3BHK flat. Housekeeping twice a week. 5 minutes to major IT parks.',
    rent: 5000, deposit: 10000, booking: 1000, furnishing: 'furnished', amenities: ['wifi', 'ac', 'washing_machine', 'lift'],
    district: 'Chennai', area: 'Thoraipakkam (OMR)', landmark: 'Thoraipakkam Signal',
    address: 'Flat 4B, Sai Residency, Thoraipakkam, Chennai 600097', lat: 12.9416, lng: 80.2363,
    photos: [['interior', I.apartment], ['interior', I.apartment2], ['exterior', E.house4]],
  },
  {
    owner: 1, category: 'room_sharing', title: 'Triple sharing room near PSG Tech',
    description: 'Budget triple sharing with food for students. Study tables and cupboards for each person.',
    rent: 4000, deposit: 8000, booking: 700, furnishing: 'furnished', amenities: ['wifi', 'food'],
    district: 'Coimbatore', area: 'Peelamedu', landmark: 'PSG College of Technology',
    address: '6, Avinashi Road, Peelamedu, Coimbatore 641004', lat: 11.0247, lng: 77.0028,
    photos: [['interior', I.bedroom3], ['interior', I.interior], ['exterior', E.house3]],
  },
  {
    owner: 0, category: 'house', title: '1BHK portion in K.K. Nagar',
    description: 'First-floor 1BHK portion with separate entrance. Suitable for small families.',
    rent: 9000, deposit: 45000, booking: 2000, furnishing: 'unfurnished', amenities: ['water_24x7'],
    district: 'Madurai', area: 'K.K. Nagar', landmark: 'Madurai District Court',
    address: '14, 80 Feet Road, K.K. Nagar, Madurai 625020', lat: 9.9307, lng: 78.1416,
    photos: [['exterior', E.house5], ['interior', I.living2], ['interior', I.kitchen]],
  },
  {
    owner: 0, category: 'room_sharing', title: 'Twin sharing room near Central Bus Stand',
    description: 'Neat twin sharing room for students and working professionals. Restaurants and ATMs nearby.',
    rent: 5000, deposit: 15000, booking: 1000, furnishing: 'semi_furnished', amenities: ['wifi', 'water_24x7'],
    district: 'Tiruchirappalli', area: 'Cantonment', landmark: 'Central Bus Stand',
    address: '5, Williams Road, Cantonment, Tiruchirappalli 620001', lat: 10.7996, lng: 78.6845,
    photos: [['interior', I.bedroom6], ['interior', I.interior2], ['exterior', E.house]],
  },
];

/** Adds demo owners and listings on first start so the app isn't empty. Disable with SEED_DEMO=false. */
export function seedDemoData() {
  if (one('SELECT COUNT(*) AS n FROM properties').n > 0) return;

  tx(() => {
    for (const o of OWNERS) {
      run(
        `INSERT OR IGNORE INTO users (id, email, role, phone, phone_verified, whatsapp, name, available, kyc_status, kyc_id_type, kyc_id_last4, created_at)
         VALUES (?, ?, 'owner', ?, 1, ?, ?, ?, 'verified', 'aadhaar', '0000', ?)`,
        o.id, o.email, o.phone, o.phone, o.name, o.available, nowIso(),
      );
    }
    LISTINGS.forEach((l, index) => {
      const id = newId();
      const approx = fuzzLocation(l.lat, l.lng);
      // Stagger creation times so "Newest" sorting looks natural.
      const createdAt = new Date(Date.now() - index * 3_600_000).toISOString();
      run(
        `INSERT INTO properties (id, owner_id, category, title, description, rent, deposit, booking_amount, furnishing, amenities,
           district, area, landmark, location_enc, approx_lat, approx_lng, approx_radius_m, doc_type, verification, is_demo,
           created_at, admin_verified_at, admin_verified_by, doc_checked_at, doc_checked_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'property_tax', 'verified', 1, ?, ?, 'demo', ?, 'demo')`,
        id, OWNERS[l.owner].id, l.category, l.title, l.description, l.rent, l.deposit, l.booking, l.furnishing,
        JSON.stringify(l.amenities), l.district, l.area, l.landmark,
        encryptJson({ address: l.address, lat: l.lat, lng: l.lng }), approx.lat, approx.lng, APPROX_RADIUS_M,
        createdAt, createdAt, createdAt,
      );
      l.photos.forEach(([kind, photoId], position) =>
        run('INSERT INTO photos (id, property_id, url, kind, position) VALUES (?, ?, ?, ?, ?)', newId(), id, photo(photoId), kind, position),
      );
    });
  });
  console.log(`[seed] Added ${LISTINGS.length} demo listings (owners: ${OWNERS.map((o) => o.email).join(', ')})`);
}
