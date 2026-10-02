"""Imita as partes da API do Google Drive que o app usa (só para testes).
Recusa o envio simples acima de 5 MB, como o Google de verdade."""
import hashlib, http.server, json, threading, uuid, re
from urllib.parse import urlparse, parse_qs

ARQUIVOS = {}       # id -> {name, parents, mimeType, dados}
SESSOES = {}        # sessão de envio em partes -> (metadados, id existente)
TOKEN = "token-google-teste"
LIMITE_SIMPLES = 5 * 1024 * 1024


def md5(b):
    return hashlib.md5(b).hexdigest()


class Falso(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Upload-Content-Length, X-Upload-Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Location")

    def _resp(self, cod, corpo=b"", tipo="application/json", extra=None):
        if isinstance(corpo, (dict, list)):
            corpo = json.dumps(corpo).encode()
        self.send_response(cod); self._cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Type", tipo); self.send_header("Content-Length", str(len(corpo))); self.end_headers()
        self.wfile.write(corpo)

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _auth(self):
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            self._resp(401, {"error": "invalid_token"}); return False
        return True

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def _info(self, fid):
        a = ARQUIVOS[fid]
        return {"id": fid, "name": a["name"], "md5Checksum": md5(a["dados"]), "mimeType": a.get("mimeType", "")}

    def do_GET(self):
        if not self._auth(): return
        u = urlparse(self.path); q = parse_qs(u.query)
        m = re.match(r"/drive/v3/files/([^/]+)$", u.path)
        if m:
            fid = m.group(1)
            if fid not in ARQUIVOS: return self._resp(404, {})
            return self._resp(200, ARQUIVOS[fid]["dados"], "application/octet-stream")
        if u.path == "/drive/v3/files":
            arqs = list(ARQUIVOS.items())
            if q.get("spaces", [""])[0] == "appDataFolder":
                arqs = [(i, a) for i, a in arqs if "appDataFolder" in a.get("parents", [])]
            if "q" in q:
                qq = q["q"][0]
                nome = re.search(r"name='((?:[^'\\]|\\.)*)'", qq); pai = re.search(r"'([^']+)' in parents", qq)
                arqs = [(i, a) for i, a in arqs if (not nome or a["name"] == nome.group(1).replace("\\'", "'"))
                        and (not pai or pai.group(1) in a.get("parents", []))
                        and ("folder" not in qq or a.get("mimeType") == "application/vnd.google-apps.folder")]
            return self._resp(200, {"files": [self._info(i) for i, _ in arqs]})
        self._resp(404, {})

    def do_POST(self):
        if not self._auth(): return
        u = urlparse(self.path); q = parse_qs(u.query); corpo = self._corpo()
        if u.path == "/drive/v3/files":                                   # criar pasta
            meta = json.loads(corpo); fid = uuid.uuid4().hex[:12]
            ARQUIVOS[fid] = {**meta, "dados": b""}
            return self._resp(200, {"id": fid})
        if u.path == "/upload/drive/v3/files":
            tipo = q.get("uploadType", [""])[0]
            if tipo == "resumable":
                sid = uuid.uuid4().hex; SESSOES[sid] = (json.loads(corpo or b"{}"), None)
                return self._resp(200, b"", extra={"Location": f"http://localhost:{self.server.server_port}/sessao/{sid}"})
            if tipo == "multipart":
                if len(corpo) > LIMITE_SIMPLES: return self._resp(413, {"error": "Request Too Large"})
                fronteira = self.headers["Content-Type"].split("boundary=")[1].encode()
                partes = [p for p in corpo.split(b"--" + fronteira) if p.strip() not in (b"", b"--")]
                meta = json.loads(partes[0].split(b"\r\n\r\n", 1)[1].rstrip(b"\r\n"))
                dados = partes[1].split(b"\r\n\r\n", 1)[1][:-2]
                fid = uuid.uuid4().hex[:12]; ARQUIVOS[fid] = {**meta, "dados": dados}
                return self._resp(200, self._info(fid))
        self._resp(404, {})

    def do_PATCH(self):
        if not self._auth(): return
        u = urlparse(self.path); q = parse_qs(u.query); corpo = self._corpo()
        m = re.match(r"/upload/drive/v3/files/([^/]+)$", u.path)
        if not m or m.group(1) not in ARQUIVOS: return self._resp(404, {})
        fid = m.group(1)
        if q.get("uploadType", [""])[0] == "resumable":
            sid = uuid.uuid4().hex; SESSOES[sid] = ({}, fid)
            return self._resp(200, b"", extra={"Location": f"http://localhost:{self.server.server_port}/sessao/{sid}"})
        if len(corpo) > LIMITE_SIMPLES: return self._resp(413, {"error": "Request Too Large"})
        ARQUIVOS[fid]["dados"] = corpo
        return self._resp(200, self._info(fid))

    def do_PUT(self):
        m = re.match(r"/sessao/([0-9a-f]+)$", urlparse(self.path).path)
        if not m or m.group(1) not in SESSOES: return self._resp(404, {})
        meta, fid = SESSOES.pop(m.group(1)); dados = self._corpo()
        if fid: ARQUIVOS[fid]["dados"] = dados
        else:
            fid = uuid.uuid4().hex[:12]; ARQUIVOS[fid] = {**meta, "dados": dados}
        return self._resp(200, self._info(fid))


def iniciar(porta):
    srv = http.server.ThreadingHTTPServer(("localhost", porta), Falso)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
