const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const p = 'src/app/pages/estructura/estructura.html';
let html = fs.readFileSync(p, 'utf8');
const original = fs.readFileSync('recovery/src-local-original/app/pages/estructura/estructura.html', 'utf8');
const start = original.indexOf('            <ng-container *ngIf="esCoordinador">', original.indexOf('<!-- MONITOREO -->'));
const end = original.lastIndexOf('            </ng-container>') + '            </ng-container>'.length;
if (start < 0) throw new Error('No se encontró el resumen local');
const pos = html.lastIndexOf('          </article>');
html = html.slice(0, pos) + '<details *ngIf="esCoordinador"><summary>Resumen por delegado y asignaciones</summary>' + original.slice(start, end) + '</details>\n' + html.slice(pos);
fs.writeFileSync(p, html);

function terminology(value) {
  return value.replace(/SECCIONALES/g, 'DELEGADOS').replace(/Seccionales/g, 'Delegados').replace(/seccionales/g, 'delegados')
    .replace(/SECCIONAL/g, 'DELEGADO').replace(/Seccional/g, 'Delegado').replace(/seccional/g, 'delegado')
    .replace(/VOTANTES/g, 'SIMPATIZANTES').replace(/Votantes/g, 'Simpatizantes').replace(/votantes/g, 'simpatizantes')
    .replace(/VOTANTE/g, 'SIMPATIZANTE').replace(/Votante/g, 'Simpatizante').replace(/votante/g, 'simpatizante');
}
for (const file of fs.readdirSync('src/app', { recursive: true }).filter((file) => /\.(html|ts)$/.test(file) && !file.endsWith('.spec.ts'))) {
  const target = path.join('src/app', file);
  let source = fs.readFileSync(target, 'utf8');
  if (file.endsWith('.html')) {
    // Solo cambia texto visible, nunca rutas, bindings ni valores de los roles.
    source = source.replace(/(<(?:"[^"]*"|'[^']*'|[^'">])*>)|({{[\s\S]*?}})|([^<{]+)|([<{])/g,
      (all, tag, binding, text) => tag
        ? tag.replace(/(placeholder|title|aria-label)="([^"]*)"/g, (_, name, value) => name + '="' + terminology(value) + '"')
        : binding || (text ? terminology(text) : all));
  } else {
    const ast = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, true);
    const edits = [];
    function visit(node) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
          node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail) &&
          /[\sA-ZÁÉÍÓÚ¿]/.test(node.text || '')) {
        const raw = source.slice(node.getStart(ast), node.end);
        const updated = terminology(raw);
        if (updated !== raw) edits.push({ start: node.getStart(ast), end: node.end, updated });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.updated + source.slice(edit.end);
  }
  fs.writeFileSync(target, source);
}
