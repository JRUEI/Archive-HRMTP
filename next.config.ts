import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS || false;
const repoName = 'Archive-HRMTP';

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const nextConfig: NextConfig = {
  output: isGithubActions ? 'export' : undefined,
  // *.dev.ts 是本機才有的路由（寫回逐字稿說話者），正式站建置時不認
  ...(isGithubActions ? {} : { pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'dev.ts'] }),
  basePath: isGithubActions ? `/${repoName}` : '',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  ...(isGithubActions
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: securityHeaders,
            },
          ];
        },
      }),
};

export default nextConfig;
