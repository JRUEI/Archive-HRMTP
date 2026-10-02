// 只在本機 npm run dev 存在：next.config.ts 只有在不是 GitHub Actions 時才認 .dev.ts，
// 靜態匯出不支援 POST，正式站也不該能寫檔。
// 把逐字稿的說話者標籤寫回 content/episodes/<id>.md，時間碼與內文一個字都不動。
import fs from 'fs';
import path from 'path';

const LINE = /^(\s*\[(\d{2}:\d{2}(?::\d{2})?)\]\s*\[)(.*?)(\].*)$/;
const HOST = '福嶋晴菜';

interface Change { i: number; time: string; from: string; to: string }

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response('Not found', { status: 404 });
  // 只接受本站頁面送來的 JSON：別的網站送不了 application/json（CORS 預檢不會過），Origin 也對不上
  const origin = request.headers.get('origin');
  if (origin && URL.parse(origin)?.host !== request.headers.get('host')) return Response.json({ error: '來源不對' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: '要用 JSON' }, { status: 415 });

  const { id, changes } = (await request.json()) as { id: string; changes: Change[] };
  if (!/^ep\d+$/.test(id) || !Array.isArray(changes) || !changes.length) return Response.json({ error: '參數不對' }, { status: 400 });

  const file = path.join(process.cwd(), 'content', 'episodes', `${id}.md`);
  const src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s*【完整逐字稿】/.test(l));
  if (start < 0) return Response.json({ error: '找不到【完整逐字稿】' }, { status: 400 });

  // 跟 src/lib/markdown.ts 一樣，依序數逐字稿列，第 n 列就是畫面上的 index n
  const rows: number[] = [];
  const names = new Set<string>();
  for (let k = start + 1; k < lines.length; k++) {
    const m = LINE.exec(lines[k]);
    if (m) { rows.push(k); names.add(m[3]); }
  }
  const guest = [...names].find(n => n !== HOST && !n.includes('＆') && n !== '工作人員');
  // 只能換成這一集本來就出現過的人名，或固定的幾種組合
  const allowed = new Set([...names, HOST, '工作人員', ...(guest ? [guest, `${HOST}＆${guest}`] : [])]);

  for (const c of changes) {
    const k = rows[c.i];
    const m = k === undefined ? null : LINE.exec(lines[k]);
    if (!m || m[2] !== c.time || m[3] !== c.from) {
      return Response.json({ error: `第 ${c.i} 列（${c.time}）跟檔案對不上，檔案可能被改過，重新整理再試` }, { status: 409 });
    }
    if (!allowed.has(c.to)) return Response.json({ error: `不認得的說話者：${c.to}` }, { status: 400 });
  }
  for (const c of changes) {
    const m = LINE.exec(lines[rows[c.i]])!;
    lines[rows[c.i]] = m[1] + c.to + m[4];
  }
  fs.writeFileSync(file, lines.join(eol), 'utf8');
  return Response.json({ written: changes.length });
}
