// The Vercel function. vercel.json sends every path here, with the original path in ?path=. The function puts the
// original address back, so a signed stream link checks as it does on a server.
import { handler } from '../server.js';

export default function (req, res) {
  const params = new URL(req.url, 'http://x').searchParams;
  const path = params.get('path') || '/';
  params.delete('path');
  req.url = path + (params.size ? `?${params}` : '');
  return handler(req, res);
}
