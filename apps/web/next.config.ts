import type { NextConfig } from "next";
import { parseEnvironment } from "./src/lib/environment";

// Next has loaded .env.local (or, on Vercel and in the GitHub workflow, the
// project's settings) by the time it reads this file, so a missing or wrong
// value stops the build here. See src/lib/environment.ts.
parseEnvironment(process.env.NEXT_PUBLIC_ENVIRONMENT);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
