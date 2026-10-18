// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Hard rule 9: every string the client sees comes from i18n. This scans the JSX of the app (AST,
// not regex) for literal text and for literal text attributes.
const srcDir = path.resolve(import.meta.dirname, '..');
const TEXT_ATTRIBUTES = new Set(['placeholder', 'title', 'alt', 'aria-label', 'aria-description']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : sourceFiles(full);
    const isComponent = entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx');
    return isComponent ? [full] : [];
  });
}

function hardcodedText(file: string, content = readFileSync(file, 'utf8')): string[] {
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim() !== '') found.push(node.text.trim());
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      found.push(node.expression.text);
    }
    if (
      ts.isJsxAttribute(node) &&
      TEXT_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      found.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.map((text) => `${path.relative(srcDir, file)}: "${text}"`);
}

describe('i18n discipline', () => {
  it('has no hard-coded UI text in TSX', () => {
    // AC-1
    const files = sourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(5);
    expect(files.flatMap((file) => hardcodedText(file))).toEqual([]);
  });

  it('detects hard-coded text and text attributes (the scan is not vacuous)', () => {
    // AC-1
    const probe = path.join(srcDir, 'probe.tsx');
    const found = hardcodedText(probe, 'export const A = () => <p title="x">Hola</p>;');
    expect(found).toHaveLength(2);
    expect(hardcodedText(probe, 'export const A = () => <p>{t("k")}</p>;')).toEqual([]);
  });
});
