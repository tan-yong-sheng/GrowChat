// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ESLint configuration', () => {
  it('has .eslintrc.json file', () => {
    const configPath = path.join(process.cwd(), '.eslintrc.json');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('has valid ESLint config structure', () => {
    const configPath = path.join(process.cwd(), '.eslintrc.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config).toHaveProperty('env');
    expect(config).toHaveProperty('extends');
    expect(config).toHaveProperty('parserOptions');
    expect(config).toHaveProperty('rules');
  });

  it('extends eslint:recommended', () => {
    const configPath = path.join(process.cwd(), '.eslintrc.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.extends).toContain('eslint:recommended');
  });
});

describe('Prettier configuration', () => {
  it('has .prettierrc file', () => {
    const configPath = path.join(process.cwd(), '.prettierrc');
    const altConfigPath = path.join(process.cwd(), '.prettierrc.json');
    expect(fs.existsSync(configPath) || fs.existsSync(altConfigPath)).toBe(true);
  });

  it('has valid Prettier config structure', () => {
    let config;
    const configPath = path.join(process.cwd(), '.prettierrc.json');
    const altConfigPath = path.join(process.cwd(), '.prettierrc');

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else if (fs.existsSync(altConfigPath)) {
      const content = fs.readFileSync(altConfigPath, 'utf-8');
      config = JSON.parse(content);
    } else {
      throw new Error('No Prettier config found');
    }

    // Common Prettier options
    expect(config).toHaveProperty('singleQuote');
    expect(config).toHaveProperty('tabWidth');
    expect(config).toHaveProperty('printWidth');
  });
});

describe('package.json scripts', () => {
  it('has lint script', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.scripts).toHaveProperty('lint');
  });

  it('has lint:fix script', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.scripts).toHaveProperty('lint:fix');
  });

  it('has format script', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.scripts).toHaveProperty('format');
  });

  it('has format:check script', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.scripts).toHaveProperty('format:check');
  });
});
