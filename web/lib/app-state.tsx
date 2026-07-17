'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  finishOnboarding: () => Promise<void>;
}

const AppStateContext = createContext<(AppState & AppActions) | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
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

  // Onboarding always shows first, every visit — even with a valid session.
  // Resuming that session (and deciding where onboarding should lead: auth,
  // package selection, or straight into an existing group) happens in the
  // background here, and is only applied once the user finishes onboarding
  // (see finishOnboarding), so it never skips the slides.
  const bootRef = useRef<{ promise: Promise<Screen>; resolve: (screen: Screen) => void } | null>(null);
  if (!bootRef.current) {
    let resolve!: (screen: Screen) => void;
    const promise = new Promise<Screen>((res) => {
      resolve = res;
    });
    bootRef.current = { promise, resolve };
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const token = getToken();
      if (!token) {
        bootRef.current!.resolve('auth');
        return;
      }
      try {
        const { user: sessionUser } = await api.session();
        if (cancelled) return;
        setUser(sessionUser);
        const existingGroup = await refreshGroup();
        if (cancelled) return;
        // A returning user who already belongs to a group skips straight to
        // the app, but one who hasn't bought a package/group yet must still
        // go through login/registration before ever seeing the packages
        // screen, even with a still-valid stored session — completeAuth()
        // sends them on to 'packages' itself once they submit the form.
        bootRef.current!.resolve(existingGroup ? 'app' : 'auth');
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          clearToken();
        }
        if (!cancelled) bootRef.current!.resolve('auth');
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishOnboarding = useCallback(async () => {
    const dest = await bootRef.current!.promise;
    setScreen(dest);
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
    // Reset so a subsequent onboarding pass resolves to 'auth' instead of
    // replaying whatever the original (pre-sign-out) session resolved to.
    bootRef.current = { promise: Promise.resolve('auth'), resolve: () => {} };
    setScreen('onboarding');
  }, []);

  const value = useMemo(
    () => ({
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
      signOut,
      finishOnboarding
    }),
    [
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
      signOut,
      finishOnboarding
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
