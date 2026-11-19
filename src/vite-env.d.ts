/// <reference types="vite/client" />

/**
 * Constantes injetadas por `define` em `vite.config.ts`. O Vitest pode não
 * aplicá-las; `buildInfo.ts` só as lê quando `__BUILD_SHA__` existe.
 */
declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string | null
