import React from 'react';

/**
 * Loading placeholders.
 *
 * Every loading state in the app was the word "Loading..." in grey text, which
 * gives no sense of what is coming or how much. Skeletons preview the shape of
 * the content and stop the layout jumping when data lands.
 *
 * Marked aria-hidden with a polite live-region label, so screen readers hear
 * "Loading" once instead of reading out a wall of empty boxes.
 */

export const SkeletonBar = ({ width = '100%', height = 12, style = {} }) => (
  <span
    className="skeleton-shimmer"
    style={{
      display: 'block',
      width,
      height,
      borderRadius: 6,
      background: '#e2e8f0',
      ...style,
    }}
  />
);

export const SkeletonText = ({ lines = 3, lastWidth = '60%' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBar key={i} width={i === lines - 1 ? lastWidth : '100%'} />
    ))}
  </div>
);

/** Mirrors the stat-card row used across the dashboards. */
export const SkeletonStats = ({ count = 4 }) => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{
          flex: '1 1 140px', padding: 20, borderRadius: 16,
          background: '#fff', border: '1px solid #e2e8f0',
        }}
      >
        <SkeletonBar width={40} height={40} style={{ borderRadius: 12, marginBottom: 16 }} />
        <SkeletonBar width="50%" height={22} style={{ marginBottom: 8 }} />
        <SkeletonBar width="75%" height={10} />
      </div>
    ))}
  </div>
);

export const SkeletonList = ({ rows = 3 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 12, border: '1px solid #f1f5f9', borderRadius: 10,
        }}
      >
        <SkeletonBar width={32} height={32} style={{ borderRadius: '50%', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          <SkeletonBar width="45%" height={11} style={{ marginBottom: 6 }} />
          <SkeletonBar width="70%" height={9} />
        </span>
      </div>
    ))}
  </div>
);

/** Wrap any skeleton so assistive tech announces the load once. */
export const LoadingRegion = ({ label = 'Loading', children }) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>
);

export default SkeletonBar;
