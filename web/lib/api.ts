import { getToken } from './auth-storage';
import type {
  AuthResponse,
  User,
  Group,
  Membership,
  JoinRequest,
  Vehicle,
  PaketTip,
  NearestHydrantResult,
  Hydrant,
  ApiError
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export class ApiRequestError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string> | undefined) ?? {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as ApiError;
    throw new ApiRequestError(res.status, err.error || `HTTP ${res.status}`, err.detail);
  }
  return body as T;
}

export const api = {
  register: (email: string, uporabniskoIme: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, uporabniskoIme })
    }),
  session: () => request<{ user: User }>('/api/auth/session'),

  checkout: (tip: PaketTip, stSedezev: number) =>
    request<{ url: string }>('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ tip, st_sedezev: stSedezev })
    }),
  // TEMPORARY demo bypass — records a paket without going through real Stripe
  // payment (see backend/api/groups/index.js). Remove once payments are wired up.
  fakePurchase: (tip: PaketTip, stSedezev: number) =>
    request<{ id: string }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ fakePurchase: { tip, stSedezev } })
    }),

  myGroups: () => request<Group[]>('/api/groups'),
  createGroup: (imeSkupine: string) =>
    request<Group>('/api/groups', { method: 'POST', body: JSON.stringify({ imeSkupine }) }),
  getGroup: (id: string) => request<Group>(`/api/groups/${id}`),
  updateGroup: (id: string, patch: { ime?: string; lokacijaDoma?: { lat: number; lng: number } }) =>
    request<Group>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteGroup: (id: string) => request<void>(`/api/groups/${id}`, { method: 'DELETE' }),

  joinGroup: (imeSkupine: string) =>
    request<Membership>('/api/groups/join', { method: 'POST', body: JSON.stringify({ imeSkupine }) }),
  myJoinStatus: (imeSkupine: string) =>
    request<Membership>(`/api/groups/join?imeSkupine=${encodeURIComponent(imeSkupine)}`),

  pendingRequests: (groupId: string) => request<JoinRequest[]>(`/api/groups/${groupId}/requests`),
  members: (groupId: string) => request<JoinRequest[]>(`/api/groups/${groupId}/members`),
  approveMembership: (id: string) =>
    request<Membership>(`/api/memberships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    }),
  rejectMembership: (id: string) =>
    request<Membership>(`/api/memberships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' })
    }),
  removeMembership: (id: string) => request<void>(`/api/memberships/${id}`, { method: 'DELETE' }),
  setMembershipRole: (id: string, vloga: 'admin' | 'member') =>
    request<Membership>(`/api/memberships/${id}`, { method: 'PATCH', body: JSON.stringify({ vloga }) }),

  vehicles: (groupId: string) => request<Vehicle[]>(`/api/groups/${groupId}/vehicles`),
  addVehicle: (groupId: string, ime: string, premerCevi: number) =>
    request<Vehicle>(`/api/groups/${groupId}/vehicles`, {
      method: 'POST',
      body: JSON.stringify({ ime, premerCevi })
    }),
  updateVehicle: (groupId: string, id: string, patch: { ime?: string; premerCevi?: number }) =>
    request<Vehicle>(`/api/groups/${groupId}/vehicles?vehicleId=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
  removeVehicle: (groupId: string, id: string) =>
    request<void>(`/api/groups/${groupId}/vehicles?vehicleId=${id}`, { method: 'DELETE' }),

  hydrantsInBounds: (bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number }) =>
    request<Hydrant[]>(
      `/api/hydrants?minLat=${bounds.minLat}&minLon=${bounds.minLon}&maxLat=${bounds.maxLat}&maxLon=${bounds.maxLon}`
    ),
  nearestHydrant: (point: { lat: number; lng: number } | { address: string }, premer?: number) =>
    request<NearestHydrantResult>('/api/hydrants/nearest', {
      method: 'POST',
      body: JSON.stringify({ ...point, premer })
    }),
  reportHydrant: (id: number, sporocilo: string) =>
    request<void>(`/api/hydrants/${id}/report`, { method: 'POST', body: JSON.stringify({ sporocilo }) }),
  // Geocoding is folded into /api/hydrants/nearest (see backend/README.md TODO)
  // rather than its own route — this just discards the hydrant/route it also
  // computes and keeps the resolved point.
  geocode: async (q: string) => {
    const { point } = await request<NearestHydrantResult>('/api/hydrants/nearest', {
      method: 'POST',
      body: JSON.stringify({ address: q })
    });
    return point!;
  }
};
