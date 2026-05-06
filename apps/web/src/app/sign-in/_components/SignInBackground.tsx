"use client"

import { motion } from "framer-motion"

type Orb = {
  blur: number
  color: string
  delay: number
  size: number
  x: string
  y: string
}

const ORBS: ReadonlyArray<Orb> = [
  { blur: 100, color: "rgba(203,172,249,0.08)", delay: 0, size: 400, x: "15%", y: "20%" },
  { blur: 120, color: "rgba(14,165,233,0.07)", delay: 2, size: 500, x: "75%", y: "70%" },
  { blur: 90, color: "rgba(236,72,153,0.05)", delay: 4, size: 350, x: "50%", y: "10%" },
  { blur: 110, color: "rgba(203,172,249,0.06)", delay: 6, size: 450, x: "10%", y: "80%" },
  { blur: 100, color: "rgba(14,165,233,0.06)", delay: 8, size: 380, x: "85%", y: "30%" },
]

export function SignInBackground() {
  return (
    <>
      <div className="bg-grid-pattern pointer-events-none absolute inset-0 opacity-20" />
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          animate={{ x: [0, 30, -20, 0], y: [0, -40, 20, 0] }}
          className="pointer-events-none absolute rounded-full"
          style={{
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: `blur(${orb.blur}px)`,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            width: orb.size,
          }}
          transition={{
            delay: orb.delay,
            duration: 20,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "mirror",
          }}
        />
      ))}
    </>
  )
}
