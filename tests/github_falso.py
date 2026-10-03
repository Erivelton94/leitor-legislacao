"""Imita as partes da API do GitHub que o app usa na sincronização (só para testes).
Guarda os arquivos na memória. Não é usado pelo app de verdade."""
import base64, hashlib, http.server, json, threading
from urllib.parse import urlparse, unquote

ARQUIVOS = {}          # caminho -> bytes
TOKEN = "github_pat_TESTE"


def sha(b):
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


class Falso(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-GitHub-Api-Version")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "github-authentication-token-expiration")

    def _resp(self, cod, corpo=b"", tipo="application/json"):
        if isinstance(corpo, (dict, list)):
            corpo = json.dumps(corpo).encode()
        self.send_response(cod); self._cors()
        self.send_header("Content-Type", tipo); self.send_header("Content-Length", str(len(corpo)))
        self.send_header("github-authentication-token-expiration", "2027-09-30 00:00:00 UTC")
        self.end_headers(); self.wfile.write(corpo)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def _auth(self):
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            self._resp(401, {"message": "Bad credentials"}); return False
        return True

    def do_GET(self):
        if not self._auth(): return
        u = urlparse(self.path); partes = u.path.strip("/").split("/")
        if len(partes) == 3:                                   # /repos/o/r
            return self._resp(200, {"private": True, "default_branch": "main", "permissions": {"push": True}})
        if partes[3] == "git":                                 # árvore
            if not ARQUIVOS: return self._resp(409, {"message": "Git Repository is empty."})
            return self._resp(200, {"tree": [{"path": p, "type": "blob", "sha": sha(b)} for p, b in ARQUIVOS.items()]})
        if partes[3] == "contents":
            p = unquote("/".join(partes[4:]))
            if p not in ARQUIVOS: return self._resp(404, {"message": "Not Found"})
            return self._resp(200, ARQUIVOS[p], "application/octet-stream")
        self._resp(404, {})

    def do_PUT(self):
        if not self._auth(): return
        u = urlparse(self.path); partes = u.path.strip("/").split("/")
        p = unquote("/".join(partes[4:]))
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if p in ARQUIVOS and corpo.get("sha") != sha(ARQUIVOS[p]):
            return self._resp(409, {"message": "sha does not match"})
        ARQUIVOS[p] = base64.b64decode(corpo["content"])
        self._resp(200, {"content": {"path": p, "sha": sha(ARQUIVOS[p])}})


def _apagar(self):
    if not self._auth(): return
    partes = urlparse(self.path).path.strip("/").split("/")
    p = unquote("/".join(partes[4:]))
    corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
    if p not in ARQUIVOS: return self._resp(404, {"message": "Not Found"})
    if corpo.get("sha") != sha(ARQUIVOS[p]): return self._resp(409, {"message": "sha does not match"})
    del ARQUIVOS[p]
    self._resp(200, {"commit": {}})


Falso.do_DELETE = _apagar


def iniciar(porta):
    srv = http.server.ThreadingHTTPServer(("localhost", porta), Falso)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
