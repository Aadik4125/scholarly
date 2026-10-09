import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

interface CountUpProps {
  value: number
  suffix?: string
  decimals?: number
  duration?: number
}

export default function CountUp({ value, suffix = '', decimals = 0, duration = 0.8 }: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <span>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}
