import { LandingHero } from '@/components/LandingHero';
import { RecentToolsChip } from '@/components/RecentToolsChip';
import { ToolsBox } from '@/components/tools/ToolsBox';

/**
 * Landing route — server-rendered hero + crawlable tool links.
 * The interactive shell chrome comes from the persistent group layout.
 */
export default function HomePage() {
  return (
    <div className="animate-enter flex w-full max-w-full min-w-0 flex-col gap-8 md:gap-10">
      <LandingHero />
      <RecentToolsChip />
      <ToolsBox />
    </div>
  );
}
