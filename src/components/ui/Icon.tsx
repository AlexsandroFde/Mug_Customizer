import type { SVGProps } from 'react'

/** Traçados em uma grade de 24×24, desenhados com contorno arredondado. */
const PATHS = {
  upload: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M10 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', 'm3 17 5-5 3.5 3.5L15 12l6 6'],
  replace: ['M20 11a8 8 0 0 0-14.3-4.9L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.3 4.9L20 16', 'M20 20v-4h-4'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
  orbit: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 3.5V8H16', 'M12 8.5v7', 'M8.5 12h7'],
  move: ['M12 3v18', 'M3 12h18', 'm9 6 3-3 3 3', 'm9 18 3 3 3-3', 'm6 9-3 3 3 3', 'm18 9 3 3-3 3'],
  zoomIn: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'm20 20-4-4', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'm20 20-4-4', 'M8 11h6'],
  focus: ['M3 8V5a2 2 0 0 1 2-2h3', 'M16 3h3a2 2 0 0 1 2 2v3', 'M21 16v3a2 2 0 0 1-2 2h-3', 'M8 21H5a2 2 0 0 1-2-2v-3', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  center: ['M4 4h16v16H4z', 'M12 8v8', 'M8 12h8'],
  reset: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 3.5V8H8'],
  rotate: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
  alert: ['M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z', 'M12 9.5v4', 'M12 17h.01'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 11v5', 'M12 8h.01'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  mug: ['M5 6h11v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V6z', 'M16 9h1.5a2.5 2.5 0 0 1 0 5H16'],
  transparency: ['M4 4h16v16H4z', 'M4 12h8v8', 'M12 4v8h8'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  eyeOff: [
    'M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2',
    'M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 5.4-1.8',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
    'M3 3l18 18',
  ],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  palette: [
    'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z',
    'M7.5 11.5h.01',
    'M10.5 7.5h.01',
    'M15 8h.01',
  ],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 20h14'],
  camera: ['M4 8h3.2l1.6-2.5h6.4L16.8 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  plus: ['M12 5v14', 'M5 12h14'],
  area: ['M4 8V5a1 1 0 0 1 1-1h3', 'M16 4h3a1 1 0 0 1 1 1v3', 'M20 16v3a1 1 0 0 1-1 1h-3', 'M8 20H5a1 1 0 0 1-1-1v-3', 'M9 9h6v6H9z'],
} as const

export type IconName = keyof typeof PATHS

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}
