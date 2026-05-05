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
    (alphaTraceApiBase.startsWith("http") ? alphaTraceApiBase : "http://127.0.0.1:8802/api")
  const apiProxyTarget = alphaTraceProxyBase.replace(/\/api\/?$/i, "")

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
          if (pathname === "/dashboard" || pathname?.startsWith("/dashboard/")) {
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
    port: 8802,
    allowedHosts: true,  // Allow all hosts for flexible deployment
    proxy: {
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
