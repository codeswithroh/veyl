"use client";

import { useState } from "react";

// Token logoUri comes from AVNU's token list and sometimes 404s or hotlink-blocks -
// without this, a failed <img> shows the browser's default broken-image glyph (the
// "square symbol" bug). Falls back to a plain initials badge instead.
export default function TokenLogo({
  src,
  symbol,
  size,
  className,
  fallbackClassName,
}: {
  src: string | null | undefined;
  symbol: string;
  size: number;
  className: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <span className={fallbackClassName}>{symbol.slice(0, 2).toUpperCase()}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
