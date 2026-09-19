import type { OpenFile } from '../../types';

// Builds a single self-contained HTML document for the preview iframe by
// combining whichever HTML/CSS/JS files are currently open. Deliberately
// simple: it takes one HTML file as the base (the active one if it's HTML,
// otherwise the first HTML file open) and injects every open .css file as
// a <style> block and every open .js file as a <script> block. This covers
// the common "index.html + style.css + script.js" case well; if the HTML
// file already has its own <link>/<script src> tags pointing at those same
// files, code may run twice — acceptable for a quick preview tool, not
// pretending to be a full bundler.
export function buildPreviewDoc(openFiles: OpenFile[], activeFilePath: string | null): string | null {
  const htmlFiles = openFiles.filter((f) => f.language === 'html');
  if (htmlFiles.length === 0) return null;

  const active = openFiles.find((f) => f.path === activeFilePath);
  const base = (active && active.language === 'html') ? active : htmlFiles[0];

  const cssFiles = openFiles.filter((f) => f.language === 'css');
  const jsFiles = openFiles.filter((f) => f.language === 'javascript');

  const styleBlock = cssFiles.map((f) => `<style>\n/* ${f.name} */\n${f.content}\n</style>`).join('\n');
  const scriptBlock = jsFiles.map((f) => `<script>\n/* ${f.name} */\ntry {\n${f.content}\n} catch (err) { console.error(err); }\n</script>`).join('\n');

  let doc = base.content;

  if (/<\/head>/i.test(doc)) {
    doc = doc.replace(/<\/head>/i, styleBlock + '\n</head>');
  } else {
    doc = styleBlock + '\n' + doc;
  }

  if (/<\/body>/i.test(doc)) {
    doc = doc.replace(/<\/body>/i, scriptBlock + '\n</body>');
  } else {
    doc = doc + '\n' + scriptBlock;
  }

  return doc;
}
