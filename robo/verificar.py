#!/usr/bin/env python3
"""
Robô de verificação de legislação — Etapa 1 (teste de acesso ao Planalto).

Para cada lei listada em leis.json:
  1. baixa o texto compilado no Planalto;
  2. divide o texto em artigos e calcula uma "impressão digital" (hash) de cada um;
  3. compara com a versão guardada na última verificação;
  4. registra o resultado em dados/status.json e, se algo mudou, em dados/historico/.

Regra de confiabilidade: se a fonte falhar ou a leitura parecer estranha,
o status vira ERRO_VERIFICACAO e o texto guardado NÃO é substituído.
"""

import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

RAIZ = Path(__file__).resolve().parent.parent
ARQ_LEIS = RAIZ / "leis.json"
PASTA_DADOS = RAIZ / "dados"
PASTA_TEXTOS = PASTA_DADOS / "leis"
PASTA_HIST = PASTA_DADOS / "historico"
ARQ_STATUS = PASTA_DADOS / "status.json"

FUSO = ZoneInfo("America/Recife")
# O Planalto recusa conexões que se identificam como robô (confirmado no diagnóstico),
# então o acesso usa a identificação de um navegador comum, com poucas consultas por dia.
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
TENTATIVAS = 3
TIMEOUT = 60
QUEDA_MAXIMA = 0.10  # se o nº de artigos cair mais de 10%, a leitura é considerada suspeita

# Início de artigo: "Art. 1º", "Art. 1o", "Art. 10.", "Art. 112.", "Art. 5º-A."
RE_ARTIGO = re.compile(
    r"^Art\.\s*(\d+)\s*(?:º|°|ª|o(?![a-zà-ú]))?\s*(?:-([A-Z]{1,2})(?![a-zà-ú]))?"
)


# ---------------------------------------------------------------- utilitários

def agora():
    return datetime.now(FUSO)


def ler_json(caminho, padrao=None):
    if caminho.exists():
        return json.loads(caminho.read_text(encoding="utf-8"))
    return padrao


def salvar_json(caminho, dados):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")


def sha256(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def normalizar(linha):
    linha = unicodedata.normalize("NFC", linha).replace("\xa0", " ")
    return re.sub(r"\s+", " ", linha).strip()


def decodificar(conteudo: bytes) -> str:
    """O Planalto mistura codificações (há páginas em UTF-16, UTF-8 e Windows-1252)."""
    if conteudo.startswith((b"\xff\xfe", b"\xfe\xff")):
        # Algumas páginas em UTF-16 chegam com 1 byte sobrando no final; ele é descartado.
        if len(conteudo) % 2:
            conteudo = conteudo[:-1]
        return conteudo.decode("utf-16", errors="replace")
    if conteudo.startswith(b"\xef\xbb\xbf"):
        return conteudo[3:].decode("utf-8")
    try:
        return conteudo.decode("utf-8")
    except UnicodeDecodeError:
        return conteudo.decode("cp1252", errors="replace")


# ------------------------------------------------------------ leitura da lei

def extrair_artigos(html):
    """Devolve ({id_artigo: {texto, hash}}, nº de artigos com número repetido)."""
    soup = BeautifulSoup(html, "html.parser")

    # Texto riscado no Planalto = redação antiga ou revogada. Não faz parte do texto vigente.
    for tag in soup(["script", "style", "strike", "s", "del"]):
        tag.decompose()

    linhas = [normalizar(p.get_text(" ")) for p in soup.find_all("p")]
    if len(linhas) < 10:  # página sem parágrafos <p>: usa o texto corrido
        linhas = [normalizar(l) for l in soup.get_text("\n").split("\n")]
    linhas = [l for l in linhas if l]

    artigos, atual, repetidos = {}, None, 0
    for linha in linhas:
        m = RE_ARTIGO.match(linha)
        if m:
            ident = m.group(1) + (f"-{m.group(2)}" if m.group(2) else "")
            chave, n = ident, 2
            while chave in artigos:
                chave, n = f"{ident}#{n}", n + 1
            if chave != ident:
                repetidos += 1
            artigos[chave] = [linha]
            atual = chave
        elif atual:
            artigos[atual].append(linha)

    resultado = {}
    for chave, partes in artigos.items():
        texto = "\n".join(partes)
        resultado[chave] = {"texto": texto, "hash": sha256(texto)}
    return resultado, repetidos


def hash_da_lei(artigos):
    return sha256(json.dumps([[k, v["hash"]] for k, v in artigos.items()]))


def baixar(url, cabecalhos_extra):
    cabecalhos = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        **cabecalhos_extra,
    }
    ultimo_erro = None
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            r = requests.get(url, headers=cabecalhos, timeout=TIMEOUT)
            if r.status_code != 304:
                r.raise_for_status()
            return r
        except requests.RequestException as erro:
            ultimo_erro = erro
            if tentativa < TENTATIVAS:
                time.sleep(10 * tentativa)
    raise ultimo_erro


# ------------------------------------------------------------- verificação

def verificar_lei(lei, status_anterior):
    momento = agora()
    reg = dict(status_anterior or {})
    reg.update({
        "nome": lei["nome"],
        "numero": lei.get("numero", ""),
        "url": lei["url"],
        "fonte": "Planalto — texto compilado",
        "ultima_tentativa": momento.isoformat(timespec="seconds"),
    })

    def erro(mensagem):
        reg["status"] = "ERRO_VERIFICACAO"
        reg["mensagem"] = mensagem
        return reg

    arq_texto = PASTA_TEXTOS / f"{lei['id']}.json"
    anterior = ler_json(arq_texto)

    cond = {}
    if anterior and anterior.get("etag"):
        cond["If-None-Match"] = anterior["etag"]
    if anterior and anterior.get("last_modified"):
        cond["If-Modified-Since"] = anterior["last_modified"]

    try:
        resp = baixar(lei["url"], cond)
    except Exception as e:
        return erro(f"Não foi possível acessar a fonte: {e}")

    def confirmar(status, mensagem):
        reg["status"] = status
        reg["mensagem"] = mensagem
        reg["ultima_verificacao_ok"] = momento.isoformat(timespec="seconds")
        return reg

    if resp.status_code == 304:
        return confirmar("ATUALIZADA", "A fonte confirmou que a página não mudou (resposta 304).")

    artigos, repetidos = extrair_artigos(decodificar(resp.content))
    n = len(artigos)
    reg["diagnostico"] = {
        "tamanho_pagina_kb": round(len(resp.content) / 1024, 1),
        "fonte_envia_etag": bool(resp.headers.get("ETag")),
        "fonte_envia_last_modified": bool(resp.headers.get("Last-Modified")),
        "artigos_com_numero_repetido": repetidos,
    }

    minimo = lei.get("minimo_artigos", 5)
    if n < minimo:
        return erro(f"Leitura suspeita: apenas {n} artigos encontrados (esperado ao menos {minimo}). "
                    "O texto guardado foi mantido.")
    if anterior and n < len(anterior["artigos"]) * (1 - QUEDA_MAXIMA):
        return erro(f"Leitura suspeita: o número de artigos caiu de {len(anterior['artigos'])} para {n}. "
                    "O texto guardado foi mantido.")

    hash_novo = hash_da_lei(artigos)
    novo = {
        "id": lei["id"],
        "nome": lei["nome"],
        "numero": lei.get("numero", ""),
        "url": lei["url"],
        "versao": momento.date().isoformat(),
        "hash": hash_novo,
        "etag": resp.headers.get("ETag"),
        "last_modified": resp.headers.get("Last-Modified"),
        "artigos": artigos,
    }

    if anterior is None:
        salvar_json(arq_texto, novo)
        reg.update({"versao": novo["versao"], "n_artigos": n, "hash": hash_novo})
        return confirmar("ATUALIZADA", f"Primeira carga concluída: {n} artigos lidos.")

    if anterior["hash"] == hash_novo:
        if (anterior.get("etag"), anterior.get("last_modified")) != (novo["etag"], novo["last_modified"]):
            anterior["etag"], anterior["last_modified"] = novo["etag"], novo["last_modified"]
            salvar_json(arq_texto, anterior)
        reg.update({"versao": anterior["versao"], "n_artigos": n, "hash": hash_novo})
        return confirmar("ATUALIZADA", f"Sem alterações ({n} artigos conferidos).")

    # --- houve mudança: registra exatamente o que mudou
    velhos, novos = anterior["artigos"], artigos
    alterados = [{"artigo": k, "antes": velhos[k]["texto"], "depois": novos[k]["texto"]}
                 for k in novos if k in velhos and velhos[k]["hash"] != novos[k]["hash"]]
    incluidos = [{"artigo": k, "texto": novos[k]["texto"]} for k in novos if k not in velhos]
    removidos = [{"artigo": k, "texto": velhos[k]["texto"]} for k in velhos if k not in novos]

    registro = {
        "detectado_em": momento.isoformat(timespec="seconds"),
        "versao_anterior": anterior["versao"],
        "versao_nova": novo["versao"],
        "alterados": alterados,
        "incluidos": incluidos,
        "removidos": removidos,
    }
    arq_hist = PASTA_HIST / f"{lei['id']}.json"
    historico = ler_json(arq_hist, [])
    historico.append(registro)
    salvar_json(arq_hist, historico)
    salvar_json(arq_texto, novo)

    afetados = [a["artigo"] for a in alterados] + [a["artigo"] for a in incluidos] + [a["artigo"] for a in removidos]
    resumo = ", ".join(f"Art. {a}" for a in afetados[:15]) + (" …" if len(afetados) > 15 else "")
    reg.update({"versao": novo["versao"], "n_artigos": n, "hash": hash_novo,
                "ultima_alteracao": registro["detectado_em"]})
    return confirmar("ALTERACAO_DETECTADA",
                     f"{len(alterados)} alterado(s), {len(incluidos)} incluído(s), "
                     f"{len(removidos)} removido(s): {resumo or 'mudança de ordem/estrutura'}")


# ------------------------------------------------------------------ resumo

ICONES = {"ATUALIZADA": "🟢 Atualizada", "ALTERACAO_DETECTADA": "🔴 Alteração detectada",
          "ERRO_VERIFICACAO": "⚠️ Erro de verificação"}


def formatar(iso):
    return datetime.fromisoformat(iso).strftime("%d/%m/%Y %H:%M") if iso else "—"


def escrever_resumo(status):
    linhas = ["## Verificação de legislação", "",
              "| Lei | Status | Artigos | Última verificação confirmada | Detalhes |",
              "|---|---|---|---|---|"]
    for reg in status.values():
        linhas.append(f"| {reg['nome']} | {ICONES.get(reg.get('status'), reg.get('status'))} | "
                      f"{reg.get('n_artigos', '—')} | {formatar(reg.get('ultima_verificacao_ok'))} | "
                      f"{reg.get('mensagem', '')} |")
    linhas += ["", "### Diagnóstico técnico da fonte", "",
               "| Lei | Página (KB) | Envia ETag | Envia Last-Modified | Artigos repetidos |",
               "|---|---|---|---|---|"]
    for reg in status.values():
        d = reg.get("diagnostico", {})
        linhas.append(f"| {reg['nome']} | {d.get('tamanho_pagina_kb', '—')} | "
                      f"{'sim' if d.get('fonte_envia_etag') else 'não'} | "
                      f"{'sim' if d.get('fonte_envia_last_modified') else 'não'} | "
                      f"{d.get('artigos_com_numero_repetido', '—')} |")
    texto = "\n".join(linhas)
    print(texto)
    destino = os.environ.get("GITHUB_STEP_SUMMARY")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            f.write(texto + "\n")


def main():
    leis = ler_json(ARQ_LEIS, [])
    status = ler_json(ARQ_STATUS, {})
    for lei in leis:
        print(f"Verificando {lei['nome']}…", flush=True)
        try:
            status[lei["id"]] = verificar_lei(lei, status.get(lei["id"]))
        except Exception as e:  # um problema inesperado numa lei não pode derrubar as outras
            reg = dict(status.get(lei["id"]) or {})
            reg.update({"nome": lei["nome"], "url": lei["url"], "status": "ERRO_VERIFICACAO",
                        "ultima_tentativa": agora().isoformat(timespec="seconds"),
                        "mensagem": f"Erro inesperado ao processar a página: {type(e).__name__}: {e}"})
            status[lei["id"]] = reg
        time.sleep(3)  # intervalo educado entre consultas à fonte
    salvar_json(ARQ_STATUS, status)
    escrever_resumo(status)
    # Falha proposital quando alguma lei não pôde ser verificada:
    # o GitHub envia um e-mail avisando que a execução falhou.
    if any(r.get("status") == "ERRO_VERIFICACAO" for r in status.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
