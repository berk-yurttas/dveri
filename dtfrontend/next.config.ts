import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/sap-proxy/:path*',
        destination: 'http://vdi-ahtapot01:8500/:path*',
      },
    ];
  },
  images: {
    domains: ['127.0.0.1', 'vdi-ahtapot01', '18.210.5.151', '10.60.139.11', 'localhost', 'api.dicebear.com', 'korykos.aselsan.com.tr', 'portal.aselsan.com.tr'],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8090',
        pathname: '/api/files/**',
      },
      {
        protocol: 'https',
        hostname: 'korykos.aselsan.com.tr',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'portal.aselsan.com.tr',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.mjs': ['.mts', '.mjs']
      }
    };

    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false
      }
    });

    return config;
  }
};

export default nextConfig;
