import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
