'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/app-state';
import BottomTabBar from '@/components/BottomTabBar';
import MapTab from '@/components/tabs/MapTab';
import GroupTab from '@/components/tabs/GroupTab';
import VehiclesTab from '@/components/tabs/VehiclesTab';
import ProfileTab from '@/components/tabs/ProfileTab';

export default function AppShellScreen() {
  const { tab } = useAppState();
  const [requestCount, setRequestCount] = useState(0);

  return (
    <div className="flex-1 flex flex-col relative min-h-0">
      <div className="absolute inset-0" style={{ display: tab === 'map' ? 'flex' : 'none', flexDirection: 'column' }}>
        <MapTab />
      </div>
      <div className="absolute inset-0" style={{ display: tab === 'group' ? 'flex' : 'none', flexDirection: 'column' }}>
        <GroupTab onRequestsChange={setRequestCount} />
      </div>
      <div className="absolute inset-0" style={{ display: tab === 'vehicles' ? 'flex' : 'none', flexDirection: 'column' }}>
        <VehiclesTab />
      </div>
      <div className="absolute inset-0" style={{ display: tab === 'profile' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ProfileTab />
      </div>

      <div className="absolute left-0 right-0 bottom-0 z-[800]">
        <BottomTabBar hasRequests={requestCount > 0} />
      </div>
    </div>
  );
}
