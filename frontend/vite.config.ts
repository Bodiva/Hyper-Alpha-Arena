import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import pkg from "./package.json"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const alphaTraceApiBase =
    process.env.VITE_ALPHA_TRACE_API_BASE_URL ||
    env.VITE_ALPHA_TRACE_API_BASE_URL ||
    "/api"
  const alphaTraceProxyBase =
    process.env.VITE_ALPHA_TRACE_API_PROXY_TARGET ||
    env.VITE_ALPHA_TRACE_API_PROXY_TARGET ||
    (alphaTraceApiBase.startsWith("http") ? alphaTraceApiBase : "http://127.0.0.1:20088/api")
  const apiProxyTarget = alphaTraceProxyBase.replace(/\/api\/?$/i, "")
  const researchWorkbenchProxyTarget =
    process.env.VITE_ALPHA_TRACE_RESEARCH_WORKBENCH_PROXY_TARGET ||
    env.VITE_ALPHA_TRACE_RESEARCH_WORKBENCH_PROXY_TARGET ||
    apiProxyTarget

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    {
      name: "alphatrace-dashboard-fallback",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const pathname = req.url?.split("?")[0]
          if (
            pathname === "/dashboard" ||
            pathname?.startsWith("/dashboard/") ||
            pathname === "/research" ||
            pathname?.startsWith("/research/") ||
            pathname === "/runtime-logs" ||
            pathname === "/logs"
          ) {
            req.url = "/index.html"
          }
          next()
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 20080,
    allowedHosts: true,  // Allow all hosts for flexible deployment
    proxy: {
      '/api/alpha-trace/research-workbench': {
        target: researchWorkbenchProxyTarget,
        changeOrigin: true,
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: apiProxyTarget.replace(/^http/i, "ws"),
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    },
  },
  }
})
