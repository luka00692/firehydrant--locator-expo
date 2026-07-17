'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiRequestError } from './api';
import { clearToken, getToken, setToken } from './auth-storage';
import type { Group, PaketTip, User, Vehicle } from './types';

export type Screen =
  | 'onboarding'
  | 'auth'
  | 'packages'
  | 'checkout'
  | 'groupNew'
  | 'join'
  | 'waiting'
  | 'app';

export type Tab = 'map' | 'group' | 'vehicles' | 'profile';

interface AppState {
  booting: boolean;
  screen: Screen;
  tab: Tab;
  user: User | null;
  group: Group | null;
  vehicles: Vehicle[];
  activeVehicleId: string | null;
  selectedPackage: { tip: PaketTip; qty: number };
  pendingGroupName: string;
}

interface AppActions {
  setScreen: (screen: Screen) => void;
  setTab: (tab: Tab) => void;
  setSelectedPackage: (pkg: { tip: PaketTip; qty: number }) => void;
  setPendingGroupName: (name: string) => void;
  completeAuth: (email: string, uporabniskoIme: string) => Promise<void>;
  refreshGroup: () => Promise<Group | null>;
  refreshVehicles: (groupId: string) => Promise<void>;
  selectVehicle: (id: string | null) => void;
  signOut: () => void;
}

const AppStateContext = createContext<(AppState & AppActions) | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [tab, setTab] = useState<Tab>('map');
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<{ tip: PaketTip; qty: number }>({
    tip: 'napredni',
    qty: 50
  });
  const [pendingGroupName, setPendingGroupName] = useState('');

  const refreshGroup = useCallback(async (): Promise<Group | null> => {
    const groups = await api.myGroups();
    const first = groups[0] ?? null;
    setGroup(first);
    return first;
  }, []);

  const refreshVehicles = useCallback(async (groupId: string) => {
    const list = await api.vehicles(groupId);
    setVehicles(list);
    setActiveVehicleId((current) => current ?? list[0]?.id ?? null);
  }, []);

  // Resume a session on load: if a token is stored, validate it and skip
  // straight past onboarding/auth into the app if the user already has an
  // approved group.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const token = getToken();
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const { user: sessionUser } = await api.session();
        if (cancelled) return;
        setUser(sessionUser);
        const existingGroup = await refreshGroup();
        if (cancelled) return;
        if (existingGroup) {
          setScreen('app');
        } else {
          setScreen('packages');
        }
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          clearToken();
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!group) return;
    const timer = setTimeout(() => refreshVehicles(group.id), 0);
    return () => clearTimeout(timer);
  }, [group, refreshVehicles]);

  const completeAuth = useCallback(
    async (email: string, uporabniskoIme: string) => {
      const res = await api.register(email, uporabniskoIme);
      setToken(res.token);
      setUser(res.user);
      // A returning user may already belong to a group — skip straight to the
      // app instead of always sending them through package selection again.
      const existingGroup = await refreshGroup();
      setScreen(existingGroup ? 'app' : 'packages');
    },
    [refreshGroup]
  );

  const selectVehicle = useCallback((id: string | null) => setActiveVehicleId(id), []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setGroup(null);
    setVehicles([]);
    setActiveVehicleId(null);
    setScreen('onboarding');
  }, []);

  const value = useMemo(
    () => ({
      booting,
      screen,
      tab,
      user,
      group,
      vehicles,
      activeVehicleId,
      selectedPackage,
      pendingGroupName,
      setScreen,
      setTab,
      setSelectedPackage,
      setPendingGroupName,
      completeAuth,
      refreshGroup,
      refreshVehicles,
      selectVehicle,
      signOut
    }),
    [
      booting,
      screen,
      tab,
      user,
      group,
      vehicles,
      activeVehicleId,
      selectedPackage,
      pendingGroupName,
      completeAuth,
      refreshGroup,
      refreshVehicles,
      selectVehicle,
      signOut
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
