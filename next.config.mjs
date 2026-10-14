/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional local build mode for machines with limited available memory.
  ...(process.env.FOLIO_LOW_MEMORY_BUILD === "1"
    ? { experimental: { cpus: 1 } }
    : {}),
};

export default nextConfig;
