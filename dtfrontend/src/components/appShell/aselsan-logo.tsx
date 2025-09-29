"use client"

import Image from "next/image"

export function AselsanLogo() {
  const companyLogo = process.env.NEXT_PUBLIC_COMPANY_LOGO
  const ahtapotLogo = process.env.NEXT_PUBLIC_AHTAPOT_LOGO

  return (
    <div className="flex items-center">
      {companyLogo ? (
        <Image
          src={companyLogo}
          alt="Aselsan 50 Yıl"
          width={140}
          height={40}
          className="h-10 w-auto"
          priority
        />
      ) : (
        <div className="h-10 w-35 flex items-center justify-center text-white font-bold text-lg">
          ASELSAN
        </div>
      )}
      <div className="mx-3 h-8 w-px bg-white/30" aria-hidden="true" />
      {ahtapotLogo ? (
        <Image
          src={ahtapotLogo}
          alt="Ahtapot"
          width={44}
          height={44}
          className="h-10 w-auto brightness-0 invert"
          priority
        />
      ) : (
        <div className="h-10 w-11 flex items-center justify-center text-white font-bold text-xs">
          AHTAPOT
        </div>
      )}
    </div>
  )
}
