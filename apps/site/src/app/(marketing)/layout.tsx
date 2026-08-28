import { Nav } from '../../components/Nav';
import { SmoothScroll } from '../../components/SmoothScroll';

/**
 * Everything except the dashboard.
 *
 * The nav and the smooth scroll live here rather than in the root layout, because neither belongs
 * on the tool: a fixed marketing bar sitting over a live moderation log is wrong, and interpolated
 * scrolling on something a creator is trying to read and act on is worse. Route groups keep that
 * separation without putting `(marketing)` in any URL.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <Nav />
      {children}
    </>
  );
}
