import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const name=pathname==='/'?'index.html':pathname.slice(1);
    // Only the app's static files are exposed; no project or Git metadata.
    if(!['index.html','styles.css','app.js','physics.mjs','wave-path.mjs'].includes(name)){res.writeHead(404);res.end('Not found');return}
    const contents=await readFile(path.join(root,name));
    res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});res.end(contents);
  } catch {res.writeHead(404);res.end('Not found')}
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
