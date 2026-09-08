import { Placeholder } from '@/components/placeholder';

/** Port target for app/(auth)/login/page.tsx. */
export default function LoginScreen() {
  return (
    <Placeholder
      title="log in / sign up"
      route="/login"
      step="step 5"
      detail="the (auth) gate sends signed-in users away from here"
      links={[{ label: 'run self tests →', href: '/self-test' }]}
    />
  );
}
