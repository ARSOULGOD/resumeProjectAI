import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        environment: "node",
        include: [ "src/**/*.test.js" ],
        // ai.service.js constructs GoogleGenAI at module load, so any test that
        // pulls it in transitively needs a key present even when it is mocked.
        env: {
            AI_API_KEY: "test-key-not-used"
        }
    }
})
