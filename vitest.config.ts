import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/**/*.spec.ts', 'projects/admin-web/src/**/*.spec.ts'],
    environment: 'node',
  },
});
