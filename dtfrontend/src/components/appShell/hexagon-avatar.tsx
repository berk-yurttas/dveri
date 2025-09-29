"use client"

import Image from "next/image"

interface HexagonAvatarProps {
  src: string
  alt: string
  size?: number
}

export function HexagonAvatar({ src, alt, size = 40 }: HexagonAvatarProps) {
  const clipPath = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"

  return (
    <div
      className="relative"
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          clipPath,
          border: "2px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <img
          src={src || "/placeholder.svg"}
          alt={alt}
          width={size}
          height={size}
          className="object-cover w-full h-full"
        />
      </div>
    </div>
  )
}
