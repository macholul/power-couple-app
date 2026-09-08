import { Gate } from '@/components/gate';
import { Placeholder } from '@/components/placeholder';

/**
 * Port target for app/pairing/page.tsx. It sits outside both groups, exactly
 * as on the web, and carries its own guard: signed-out users belong on login,
 * already-paired users belong in the app.
 */
export default function PairingScreen() {
  return (
    <Gate area="pairing">
      <Placeholder
        title="pair with your person"
        route="/pairing"
        step="step 6"
        detail="one code links your two accounts forever"
      />
    </Gate>
  );
}
