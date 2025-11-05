"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"

export function AselsanLogo() {
  const companyLogo = process.env.NEXT_PUBLIC_COMPANY_LOGO
  const router = useRouter()
  const ahtapotLogo = process.env.NEXT_PUBLIC_AHTAPOT_LOGO

  return (
    <div className="flex items-center">
      {companyLogo ? (
        <Image
          src={companyLogo}
          alt="Aselsan 50 Yıl"
          width={140}
          height={50}
          className="h-12 w-auto"
          onClick={() => router.push("/")}
          style={{ cursor: "pointer" }}
          priority
        />
      ) : (
        <div className="h-12 w-35 flex items-center justify-center text-white font-bold text-lg">
          ASELSAN
        </div>
      )}
      <div className="mx-3 h-12 w-px bg-white/30" aria-hidden="true" />
      {ahtapotLogo ? (
        // <Image
        //   src={ahtapotLogo}
        //   alt="Ahtapot"
        //   width={100}
        //   height={100}
        //   className="h-12 w-auto brightness-0 invert"
        //   style={{ cursor: "pointer" }}
        //   onClick={() => router.push("/")}
        //   priority
        // />
        <img src={ahtapotLogo} alt="Ahtapot" className="h-12 w-auto brightness-0 invert" style={{ cursor: "pointer" }} onClick={() => router.push("/")} />
      ) : (
        <div className="h-10 w-11 flex items-center justify-center text-white font-bold text-xs">
          AHTAPOT
        </div>
      )}
    </div>
  )
}
