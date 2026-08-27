/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // The dashboard is a window onto the connector; it holds no build-time data of its own.
  env: {},
  // The floating dev badge sits over the graph and would be in every frame of the demo.
  devIndicators: false,
};
