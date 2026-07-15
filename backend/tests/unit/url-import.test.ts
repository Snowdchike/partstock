import { describe, expect, it } from 'vitest';
import { extractPartFromHtml, extractPartFromJson } from '../../src/lib/url-import.js';

describe('extractPartFromHtml', () => {
  it('reads JSON-LD Product', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@type":"Product","name":"10k Resistor","mpn":"RC0603FR-0710KL","brand":{"@type":"Brand","name":"Yageo"},"description":"10k 1% 0603"}
      </script>
      </head><body></body></html>`;
    const p = extractPartFromHtml(html, 'https://shop.example/p/1');
    expect(p.partNumber).toBe('RC0603FR-0710KL');
    expect(p.name).toBe('10k Resistor');
    expect(p.manufacturer).toBe('Yageo');
    expect(p.confidence).toBe('high');
    expect(p.signals.some((s) => s.startsWith('jsonld'))).toBe(true);
  });

  it('falls back to og tags', () => {
    const html = `<html><head>
      <meta property="og:title" content="STM32F103C8T6 MCU" />
      <meta property="og:description" content="ARM Cortex-M3" />
      <title>Shop</title>
      </head><body><span itemprop="mpn">STM32F103C8T6</span></body></html>`;
    const p = extractPartFromHtml(html, 'https://shop.example/x');
    expect(p.partNumber).toBe('STM32F103C8T6');
    expect(p.name).toContain('STM32');
    expect(p.description).toContain('Cortex');
  });
});

describe('extractPartFromJson', () => {
  it('parses simple product json', () => {
    const p = extractPartFromJson(
      JSON.stringify({ name: 'Cap', mpn: 'CL10B104', brand: 'Samsung' }),
      'https://api.example/p',
    );
    expect(p?.partNumber).toBe('CL10B104');
    expect(p?.manufacturer).toBe('Samsung');
  });
});
