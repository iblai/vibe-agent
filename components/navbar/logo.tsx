"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

const FALLBACK_LOGO = "/images/iblai-logo.png";

// The org's logo from the platform (the os.ibl.ai pattern), which the creator
// sets in their org settings. The ibl.ai mark only when the platform has none.
export function Logo() {
  const tenant = resolveAppTenant();
  const [logoUrl, setLogoUrl] = useState(
    tenant ? `${config.dmUrl()}/api/core/orgs/${tenant}/logo/` : FALLBACK_LOGO,
  );
  return (
    <Link href="/" className="flex items-center">
      <Image
        src={logoUrl}
        alt="Home"
        width={120}
        height={40}
        className="h-6 w-auto sm:h-7 md:h-8"
        priority
        onError={() => setLogoUrl(FALLBACK_LOGO)}
      />
    </Link>
  );
}
