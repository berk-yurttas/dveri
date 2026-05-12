"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"

export function AselsanLogo() {
  const companyLogo = process.env.NEXT_PUBLIC_COMPANY_LOGO
  const router = useRouter()
  const ahtapotLogo = process.env.NEXT_PUBLIC_AHTAPOT_LOGO
  const platform = process.env.NEXT_PUBLIC_PLATFORM

  return (
    <div className="flex items-center">
      {companyLogo ? (
        <img src={companyLogo} alt="Aselsan" className="h-8 w-auto brightness-0 invert" style={{ cursor: "pointer" }} onClick={() => router.push("/")} />
      ) : (
        <div className="h-12 w-35 flex items-center justify-center text-white font-bold text-lg">
          ASELSAN
        </div>
      )}
      <div className="mx-3 h-12 w-px bg-white/30" aria-hidden="true" />
      {ahtapotLogo ? (
        <img src={ahtapotLogo} alt="Ahtapot" className="h-12 w-auto brightness-0 invert" style={{ cursor: "pointer" }} onClick={() => router.push("/")} />
      ) : (
        <div className="h-10 w-11 flex items-center justify-center text-white font-bold text-xs">
          AHTAPOT
        </div>
      )}
      {platform === "romiot" && (
        <>
          <div className="mx-3 h-12 w-px bg-white/30" aria-hidden="true" />
          <img src="/kutay.png" alt="Kutay" className="h-12 w-auto brightness-0 invert" style={{ cursor: "pointer" }} onClick={() => router.push("/")} />
        </>
      )}
    </div>
  )
}
