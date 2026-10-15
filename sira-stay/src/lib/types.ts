export type Role = 'tenant' | 'owner';
export type RegistrationStep = 'role' | 'phone' | 'kyc' | 'done';
export type Language = 'en' | 'ta';

export const CATEGORIES = ['rooms', 'villas', 'pg', 'house', 'room_sharing'] as const;
export type Category = (typeof CATEGORIES)[number];

export const AMENITIES = ['wifi', 'ac', 'parking', 'power_backup', 'water_24x7', 'washing_machine', 'kitchen', 'food', 'cctv', 'lift'] as const;
export type Amenity = (typeof AMENITIES)[number];

export type Furnishing = 'unfurnished' | 'semi_furnished' | 'furnished';
export type PropertyStatus = 'AVAILABLE' | 'BOOKED' | 'WITHDRAWN';
export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'FAILED' | 'CANCELLED';
export type RefundStatus = 'under_review' | 'processing' | 'refunded' | 'rejected' | null;
export type RefundReason = 'duplicate' | 'technical' | 'withdrawn';

export type Me = {
  id: string;
  email: string;
  role: Role | null;
  phone: string | null;
  phoneVerified: boolean;
  whatsapp: string | null;
  name: string | null;
  language: Language;
  available: boolean;
  kycStatus: 'none' | 'pending' | 'verified' | 'rejected';
  kycIdType: string | null;
  kycIdLast4: string | null;
  registrationStep: RegistrationStep;
};

export type LatLng = { lat: number; lng: number };

export type PropertyCard = {
  id: string;
  category: Category;
  title: string;
  rent: number;
  deposit: number;
  bookingAmount: number;
  furnishing: Furnishing;
  district: string;
  area: string;
  landmark: string;
  approxLocation: LatLng & { radiusM: number };
  coverPhoto: string | null;
  photoCount: number;
  verified: boolean;
  availableFrom: string | null;
  createdAt: string;
  isOwner: boolean;
  unlocked: boolean;
  status: PropertyStatus;
  bookedFrom?: string;
  bookedUntil?: string;
  distanceKm?: number;
};

export type OwnerContact = { id?: string; name: string | null; phone: string; whatsapp: string; available: boolean };

export type PropertyDetail = PropertyCard & {
  description: string;
  amenities: Amenity[];
  photos: { id: string; url: string; kind: 'interior' | 'exterior' }[];
  bookedPeriods: { moveInDate: string; endDate: string }[];
  unlockFee: number;
  owner: OwnerContact | null;
  exactLocation: (LatLng & { address: string }) | null;
};

export type OwnerListing = PropertyCard & {
  verification: 'pending' | 'verified';
  unlockCount: number;
  bookings: {
    id: string;
    moveInDate: string;
    endDate: string;
    amount: number;
    status: BookingStatus;
    tenantName: string | null;
    tenantEmail: string;
    tenantPhone: string | null;
  }[];
};

export type Booking = {
  id: string;
  status: BookingStatus;
  amount: number;
  moveInDate: string;
  endDate: string;
  durationMonths: number;
  bookingDate: string;
  holdExpiresAt: number | null;
  property: Pick<PropertyCard, 'id' | 'title' | 'category' | 'area' | 'district' | 'landmark' | 'rent' | 'coverPhoto' | 'approxLocation' | 'status'>;
  payment: { id: string; status: string; refundStatus: RefundStatus } | null;
  owner?: OwnerContact;
  exactLocation?: LatLng;
};

export type Payment = {
  id: string;
  purpose: 'unlock' | 'booking';
  propertyId: string;
  bookingId: string | null;
  amount: number;
  currency: string;
  provider: 'mock' | 'razorpay';
  status: 'created' | 'paid' | 'failed';
  isDuplicate: boolean;
  refundStatus: RefundStatus;
  refundReason: RefundReason | null;
  createdAt: string;
  paidAt: string | null;
  propertyTitle?: string;
  propertyWithdrawn?: boolean;
};

export type Checkout = {
  provider: 'mock' | 'razorpay';
  keyId?: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  prefill: { email: string; contact: string | null };
};

export type PaymentResult = { payment: Payment; unlocked?: boolean; bookingStatus?: BookingStatus | null };

export type Message = { id: string; kind: 'text' | 'missed_call'; body: string; createdAt: string; mine: boolean; system: boolean };

export type Conversation = {
  propertyId: string;
  tenantId: string;
  propertyTitle: string;
  coverPhoto: string | null;
  otherName: string;
  lastMessage: Message;
  unread: number;
  role: Role;
};
