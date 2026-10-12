import { Outlet } from 'react-router';
import Nav from './Nav';
import MobileBottomNav from './MobileBottomNav';

export default function Layout() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Nav />
      <main className="app-content pt-14">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
