export interface User {
  id: string;
  email: string;
  uporabniskoIme: string;
  nacinPrijave: 'email' | 'google' | 'apple';
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: string;
}

export interface Group {
  id: string;
  lastnikId: string;
  ime: string;
  stSedezev: number;
  createdAt: string;
  lat: number | null;
  lng: number | null;
  /** Only present on GET /api/groups (list of the caller's own groups). */
  vloga?: Vloga;
}

export type Vloga = 'admin' | 'member';
export type ClanstvoStatus = 'pending' | 'approved' | 'rejected';

export interface Membership {
  id: string;
  uporabnikId: string;
  skupinaId: string;
  vloga: Vloga;
  status: ClanstvoStatus;
  createdAt: string;
}

export interface JoinRequest extends Membership {
  uporabniskoIme: string;
  email: string;
}

export interface Vehicle {
  id: string;
  skupinaId: string;
  ime: string;
  premerCevi: number;
  createdAt: string;
}

export type PaketTip = 'osnovni' | 'napredni' | 'premium';

export interface Hydrant {
  id: number;
  lat: number;
  lon: number;
  properties: Record<string, string>;
}

export interface NearestHydrantResult {
  hydrant: Hydrant;
  route: {
    distance: number;
    /** Road driving time in seconds; null when only a straight-line fallback is available. */
    duration: number | null;
    coordinates?: [number, number][];
    /** true when OSRM road routing was unavailable and this is a direct-line fallback. */
    straightLine?: boolean;
  } | null;
  point?: { lat: number; lon: number };
}

export interface ApiError {
  error: string;
  detail?: string;
}
