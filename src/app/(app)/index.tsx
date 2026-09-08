import { Placeholder } from '@/components/placeholder';
import { useRequireViewer } from '@/lib/viewer';

/** Port target for app/(app)/page.tsx — both partners' day, streaks, month grid. */
export default function HomeScreen() {
  const viewer = useRequireViewer();

  return (
    <Placeholder
      title="home"
      route="/"
      step="step 7"
      detail={
        viewer
          ? `${viewer.profile.display_name} & ${viewer.partner.display_name}`
          : undefined
      }
      links={[{ label: 'profile →', href: '/profile' }]}
    />
  );
}
