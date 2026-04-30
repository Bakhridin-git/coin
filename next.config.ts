import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    /**
     * В dev-режиме оптимизатор next/image (sharp) сильно грузит CPU на больших каталогах.
     * В продакшне оптимизация остаётся включённой.
     */
    unoptimized: process.env.NODE_ENV === 'development'
  }
};

export default nextConfig;

