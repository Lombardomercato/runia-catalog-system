import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { defineConfig, globalIgnores } from 'eslint/config';

const require = createRequire(import.meta.url);
const requireFromEslint = createRequire(require.resolve('eslint/package.json'));
const { FlatCompat } = requireFromEslint('@eslint/eslintrc');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
