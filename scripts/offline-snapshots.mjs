import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Keep frozen source files intact. The offline bundle can reuse equal JSON
// subtrees while reconstructing an independent, exact snapshot for each version.
export function snapshotModule(snapshot, base, baseImport) {
  const references = new Map();
  function index(value, expression) {
    const literal = JSON.stringify(value);
    const referenceCost = expression.length + (value && typeof value === 'object' ? 17 : 0);
    if (literal.length > referenceCost &&
        (!references.has(literal) || references.get(literal).length > expression.length)) {
      references.set(literal, expression);
    }
    if (Array.isArray(value)) value.forEach((v, i) => index(v, `${expression}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) index(v, `${expression}[${JSON.stringify(key)}]`);
    }
  }
  index(base, 'base');
  function encode(value) {
    const literal = JSON.stringify(value);
    const shared = references.get(literal);
    // Clone every reused subtree separately: two equal values in JSON must
    // not become aliases, including within a single reconstructed snapshot.
    if (shared) return value && typeof value === 'object' ? `structuredClone(${shared})` : shared;
    if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
    if (value && typeof value === 'object') {
      // Computed keys also preserve a literal __proto__ JSON property.
      return `{${Object.entries(value).map(([key, v]) => `[${JSON.stringify(key)}]:${encode(v)}`).join(',')}}`;
    }
    return literal;
  }
  return `import base from ${JSON.stringify(baseImport)};export default ${encode(snapshot)};`;
}

export function offlineSnapshots() {
  return {
    name: 'share-frozen-json-snapshots',
    setup(builder) {
      builder.onLoad({ filter: /[\\/]src[\\/](life|story-tomorrow)[\\/]releases[\\/][^\\/]+\.json$/ }, async ({ path: file }) => {
        const folder = path.dirname(path.dirname(file));
        const baseFile = path.join(folder, path.basename(folder) === 'life' ? 'content.json' : 'afternoon.json');
        const [snapshot, base] = await Promise.all([file, baseFile].map(async p => JSON.parse(await readFile(p, 'utf8'))));
        return {
          contents: snapshotModule(snapshot, base, '../' + path.basename(baseFile)),
          loader: 'js', resolveDir: path.dirname(file), watchFiles: [file, baseFile],
        };
      });
    },
  };
}
