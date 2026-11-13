/**
 * 内联 SVG 图标集。
 *
 * 硬约束：不引任何图标库、不引 CDN、不引网络字体。全部 `stroke: currentColor`、`strokeWidth 1.2`，
 * 视觉参考 reference/graph-demo 的图标风格。
 */

import type { ReactNode } from 'react';

import type { IconName } from '../../shared/constants';

const PATHS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <path d="M2.2 2.2h5v5h-5zM8.8 2.2h5v5h-5zM2.2 8.8h5v5h-5zM8.8 8.8h5v5h-5z" />
    </>
  ),
  workflow: (
    <>
      <path d="M2 4.2h4.2v3.1H2zM9.8 8.7H14v3.1H9.8z" />
      <path d="M6.2 5.75h2.1v4.5h1.5" />
      <path d="M11.9 8.7V6.6a.9.9 0 0 0-.9-.9H9.4" />
    </>
  ),
  seeds: (
    <>
      <path d="M5.4 4.4h8.2M5.4 8h8.2M5.4 11.6h5.4" />
      <circle cx="2.9" cy="4.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.9" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.9" cy="11.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  assets: (
    <>
      <rect x="2" y="2.4" width="12" height="4.6" rx="1.1" />
      <rect x="2" y="9" width="12" height="4.6" rx="1.1" />
      <circle cx="4.4" cy="4.7" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="4.4" cy="11.3" r="0.75" fill="currentColor" stroke="none" />
      <path d="M7 4.7h4.6M7 11.3h4.6" />
    </>
  ),
  endpoints: (
    <>
      <path d="M3.4 4.3 6.4 8l-3 3.7" />
      <path d="M8.6 11.7h4.2" />
      <path d="M8.6 4.3H13" />
    </>
  ),
  matrix: (
    <>
      <path d="M2.3 2.3h11.4v11.4H2.3zM2.3 6.1h11.4M2.3 9.9h11.4M6 2.3v11.4M9.9 2.3v11.4" />
    </>
  ),
  graph: (
    <>
      <circle cx="3.4" cy="12.4" r="1.9" />
      <circle cx="8" cy="3.4" r="1.9" />
      <circle cx="12.6" cy="12.4" r="1.9" />
      <path d="M4.6 10.8 6.9 5.4M9.1 5.4l2.3 5.4M5.3 12.4h5.4" />
    </>
  ),
  reports: (
    <>
      <path d="M4 1.9h5.1l3 3v9.2H4z" />
      <path d="M9.1 1.9v3h3" />
      <path d="M6.2 8.1h4.2M6.2 10.9h4.2" />
    </>
  ),
  copilot: (
    <>
      <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.15 1.15M11.25 11.25l1.15 1.15M12.4 3.6l-1.15 1.15M4.75 11.25l-1.15 1.15" />
      <circle cx="8" cy="8" r="2.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.7v1.7M8 12.6v1.7M1.7 8h1.7M12.6 8h1.7M3.55 3.55l1.2 1.2M11.25 11.25l1.2 1.2M12.45 3.55l-1.2 1.2M4.75 11.25l-1.2 1.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.9" />
      <path d="M8 1.4v1.3M8 13.3v1.3M1.4 8h1.3M13.3 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9" />
    </>
  ),
  moon: (
    <>
      <path d="M13.2 9.4A5.6 5.6 0 0 1 6.6 2.8a5.6 5.6 0 1 0 6.6 6.6z" />
    </>
  ),
  plus: (
    <>
      <path d="M8 3.4v9.2M3.4 8h9.2" />
    </>
  ),
  trash: (
    <>
      <path d="M2.9 4.6h10.2M6.1 4.6V2.9h3.8v1.7" />
      <path d="M4.2 4.6l.7 8.5h6.2l.7-8.5" />
      <path d="M6.7 7.2v3.6M9.3 7.2v3.6" />
    </>
  ),
  close: (
    <>
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </>
  ),
  check: (
    <>
      <path d="M3 8.4l3.2 3.1L13 4.6" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M4.2 6.4 8 10.2l3.8-3.8" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.1" />
      <path d="M10.1 10.1l3.5 3.5" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M2.8 8h9.6M8.9 4.4 12.5 8l-3.6 3.6" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.2 14 13H2z" />
      <path d="M8 6.2v3.2" />
      <circle cx="8" cy="11.2" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="3.1" y="7" width="9.8" height="6.6" rx="1.2" />
      <path d="M5.5 7V5.1a2.5 2.5 0 0 1 5 0V7" />
      <circle cx="8" cy="10.3" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  free: (
    <>
      <path d="M2.6 12.4c1.6-5.6 7-8 10.4-8" />
      <path d="M9.7 4.1h3.5v3.5" />
      <path d="M2.6 7.4h2.2M2.6 9.9h1.4" />
    </>
  ),
  spinner: (
    <>
      <circle cx="8" cy="8" r="5.6" strokeDasharray="22 13" />
    </>
  ),
  folder: (
    <>
      <path d="M1.9 4.3h4.3l1.2 1.7h6.7v6.7a1 1 0 0 1-1 1H2.9a1 1 0 0 1-1-1z" />
      <path d="M1.9 4.3V3.4a1 1 0 0 1 1-1h2.4l1.1 1.9" />
    </>
  ),
  spark: (
    <>
      <path d="M8 1.9l1.5 4.6 4.6 1.5-4.6 1.5L8 14.1l-1.5-4.6L1.9 8l4.6-1.5z" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
