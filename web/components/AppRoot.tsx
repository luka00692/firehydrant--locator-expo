'use client';

import { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from '@/lib/app-state';
import OnboardingScreen from '@/components/screens/OnboardingScreen';
import AuthScreen from '@/components/screens/AuthScreen';
import PackagesScreen from '@/components/screens/PackagesScreen';
import GroupNewScreen from '@/components/screens/GroupNewScreen';
import JoinScreen from '@/components/screens/JoinScreen';
import WaitingScreen from '@/components/screens/WaitingScreen';
import AppShellScreen from '@/components/screens/AppShellScreen';

// Detects the return from a Stripe Checkout redirect (?checkout=success|cancel,
// see backend's CHECKOUT_SUCCESS_URL/CHECKOUT_CANCEL_URL) and, on success,
// either resumes an existing group (repeat purchase) or moves on to naming a
// new one — the webhook already recorded the paket server-side by this point.
function CheckoutReturnHandler() {
  const { setScreen, refreshGroup } = useAppState();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    window.history.replaceState({}, '', window.location.pathname);

    const timer = setTimeout(() => {
      if (checkout === 'success') {
        refreshGroup().then((group) => {
          setScreen(group ? 'app' : 'groupNew');
        });
      } else if (checkout === 'cancel') {
        setMessage('Plačilo je bilo preklicano.');
        setScreen('packages');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshGroup, setScreen]);

  if (!message) return null;
  return (
    <div className="absolute top-3 left-3 right-3 z-[999] bg-[#FCE7E7] text-[#8E1616] text-[13px] rounded-lg px-3.5 py-2.5">
      {message}
    </div>
  );
}

function Screens() {
  const { screen } = useAppState();

  switch (screen) {
    case 'onboarding':
      return <OnboardingScreen />;
    case 'auth':
      return <AuthScreen />;
    case 'packages':
      return <PackagesScreen />;
    case 'groupNew':
      return <GroupNewScreen />;
    case 'join':
      return <JoinScreen />;
    case 'waiting':
      return <WaitingScreen />;
    case 'app':
      return <AppShellScreen />;
    default:
      return <OnboardingScreen />;
  }
}

export default function AppRoot() {
  return (
    <AppStateProvider>
      <div className="relative flex-1 flex flex-col min-h-0">
        <CheckoutReturnHandler />
        <Screens />
      </div>
    </AppStateProvider>
  );
}
