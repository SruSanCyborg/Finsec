import SiriusLanding from "@/components/landing/SiriusLanding";
import { Providers } from "@/lib/providers";

// Sirius landing — structure & animations from Untitled-1.html (glassmorphic
// 2-column panels, right-side 3D stage, day/night toggle, webcam consent),
// rethemed to the app's blue palette, with Clerk auth + CLI integration.
export default function Page() {
  return (
    <Providers>
      <SiriusLanding />
    </Providers>
  );
}
