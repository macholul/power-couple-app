import { Placeholder } from '@/components/placeholder';

/** Port target for app/(app)/profile/page.tsx — goals, streaks, love notes. */
export default function ProfileScreen() {
  return (
    <Placeholder
      title="my profile"
      route="/profile"
      step="step 9"
      links={[{ label: '← home', href: '/' }]}
    />
  );
}
