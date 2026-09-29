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

import gzip
import hashlib
import json
import os
import re
import sys
import time
import zlib
from datetime import timedelta
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
PASTA_BRUTO = PASTA_DADOS / "bruto"  # cópia da última página baixada (auditoria)

FUSO = ZoneInfo("America/Recife")
# O Planalto recusa conexões que se identificam como robô (confirmado no diagnóstico),
# então o acesso usa a identificação de um navegador comum, com poucas consultas por dia.
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
TENTATIVAS = 3
TIMEOUT = 60
QUEDA_MAXIMA = 0.10  # se o nº de artigos cair mais de 10%, a leitura é considerada suspeita
DIAS_DOWNLOAD_COMPLETO = 7  # mesmo com "não mudou" da fonte, baixa tudo de novo 1x por semana

# Versão do leitor de artigos. Quando o leitor é melhorado, o texto é relido sem gerar
# falso alerta de "alteração na lei" (a mudança veio do leitor, não da legislação).
VERSAO_LEITOR = 4

# Início de artigo: "Art. 1º", "Art. 1o", "Art. 10.", "Art. 112.", "Art. 5º-A.", "Art. 359-M-A."
RE_ARTIGO = re.compile(
    r"^Art\.?\s*(\d+)\s*(?:º|°|ª|o(?![a-zà-ú]))?\s*((?:-[A-Z]{1,2}(?![a-zà-ú]))*)"
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

QUEBRA = "\x00"  # marcador interno das quebras <br>
RE_EPIGRAFE = re.compile(r"^(LEI|DECRETO|CONSTITUI|EMENDA|MEDIDA PROVIS|RESOLU)", re.IGNORECASE)
RE_ROTULO = re.compile(r"^Art\.?\s*[\dA-Zº°o\-]+\.?\s+(?=Art\.?\s*\d)")
PREPOSICOES = ("de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "pelo", "pela", "o", "a", "e", "ao")


RE_INICIO_ART = re.compile(r"\bArt\.?\s*\d+\s*(?:º|°|o)?\s*(?:-[A-Z]{1,2})*\s*[.\-–]")


def parece_titulo(texto):
    """Ex.: "Concorrência desleal" — palavras, sem números, aspas ou dois-pontos."""
    palavras = texto.split()
    return (0 < len(texto) <= 100 and re.search(r"[A-Za-zÀ-ú]{3}", texto)
            and not re.search(r"[\d“”\"‘’:;,]", texto)
            and palavras[-1].lower() not in PREPOSICOES)


def dividir(linha):
    """Separa artigos que o Planalto colocou no mesmo parágrafo, por exemplo:
    "Concorrência desleal Art. 196. (Revogado…)" ou "Art. 190. (Revogado…) Art. 191. (Revogado…)".
    Só divide depois de um título ou de uma nota entre parênteses, nunca no meio de uma frase."""
    partes, inicio = [], 0
    for m in RE_INICIO_ART.finditer(linha):
        if m.start() == inicio:
            continue
        antes = linha[inicio:m.start()].strip()
        if antes.endswith(")") or (inicio == 0 and parece_titulo(antes)):
            partes.append(antes)
            inicio = m.start()
    partes.append(linha[inicio:].strip())
    return [p for p in partes if p]


def substantivo(texto):
    """True se o artigo tem conteúdo além do rótulo "Art. N" e de notas entre parênteses."""
    resto = RE_ARTIGO.sub("", texto.split("\n")[0], count=1) + " " + " ".join(texto.split("\n")[1:])
    resto = re.sub(r"\([^)]*\)", " ", resto)
    return len(re.findall(r"\w", resto)) >= 3


def extrair_artigos(html):
    """Devolve ({id_artigo: {texto, hash}}, nº de artigos com número repetido)."""
    # html5lib interpreta HTML malformado do mesmo jeito que o navegador (o Planalto tem muito).
    soup = BeautifulSoup(html, "html5lib")
    for tag in soup(["script", "style"]):
        tag.decompose()
    for br in soup.find_all("br"):
        br.replace_with(QUEBRA)  # <br> = quebra de linha, como no navegador

    # Texto riscado = redação antiga ou revogada, não faz parte do texto vigente.
    # Exceção: se o trecho riscado começa com "Art. N", o rótulo é mantido, para que
    # artigos inteiramente revogados continuem aparecendo como "Art. N (Revogado pela…)".
    for tag in soup(["strike", "s", "del"]):
        m = RE_ARTIGO.match(normalizar(tag.get_text("")))
        if m:
            tag.replace_with(m.group(0).strip() + " ")
        else:
            tag.decompose()

    linhas = [normalizar(parte) for p in soup.find_all("p") for parte in p.get_text("").split(QUEBRA)]
    if len(linhas) < 10:  # página sem parágrafos <p>: usa o texto corrido
        linhas = [normalizar(l) for l in soup.get_text("\n").split("\n")]

    prontas = []
    for linha in linhas:
        if not linha:
            continue
        linha = RE_ROTULO.sub("", linha)  # "Art. 5 Art. 5º texto novo" -> "Art. 5º texto novo"
        prontas += dividir(linha)

    blocos = []  # [(id, [linhas])]
    antes_do_art1 = []
    for linha in prontas:
        m = RE_ARTIGO.match(linha)
        if m:
            blocos.append((m.group(1) + (m.group(2) or ""), [linha]))
        elif blocos and linha != blocos[-1][1][-1]:  # ignora linha repetida em sequência
            blocos[-1][1].append(linha)
        elif not blocos:
            antes_do_art1.append(linha)

    # Preâmbulo: da epígrafe ("LEI Nº 7.210, DE…") até antes do Art. 1º (ementa e primeiros títulos).
    inicio = next((i for i, l in enumerate(antes_do_art1) if RE_EPIGRAFE.match(l)), None)
    preambulo = antes_do_art1[inicio:] if inicio is not None else []

    # Mesmo número mais de uma vez: fica a versão com conteúdo; rótulos vazios saem.
    grupos = {}
    for ident, partes in blocos:
        grupos.setdefault(ident, []).append("\n".join(partes))
    resultado, repetidos = {}, 0
    for ident, textos in grupos.items():
        uteis = [t for t in textos if substantivo(t)] or [textos[-1]]
        for i, texto in enumerate(uteis):
            chave = ident if i == 0 else f"{ident}#{i + 1}"
            repetidos += i > 0
            resultado[chave] = {"texto": texto, "hash": sha256(texto)}
    return resultado, repetidos, preambulo


def lacunas(artigos):
    """Números de artigo ausentes na sequência 1..último (ex.: Art. 1 sumido = leitura suspeita)."""
    numeros = {int(re.match(r"\d+", k).group()) for k in artigos}
    if not numeros:
        return []
    return [n for n in range(1, max(numeros) + 1) if n not in numeros]


def salvar_bruto(caminho, conteudo):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0: o mesmo conteúdo gera sempre o mesmo arquivo (não cria commits à toa)
    with open(caminho, "wb") as bruto, gzip.GzipFile(fileobj=bruto, mode="wb", mtime=0) as f:
        f.write(conteudo)


def hash_da_lei(artigos):
    return sha256(json.dumps([[k, v["hash"]] for k, v in artigos.items()]))


class NaoEncontrada(Exception):
    pass


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
            if r.status_code in (404, 410):
                raise NaoEncontrada(f"{url} não existe (código {r.status_code})")
            if r.status_code != 304:
                r.raise_for_status()
            return r
        except requests.RequestException as erro:
            ultimo_erro = erro
            if tentativa < TENTATIVAS:
                time.sleep(10 * tentativa)
    raise ultimo_erro


# ------------------------------------------------------------- endereços no Planalto
BASE = "https://www.planalto.gov.br/ccivil_03/"
PASTAS_ANO = [(2004, 2006, "_ato2004-2006"), (2007, 2010, "_ato2007-2010"), (2011, 2014, "_ato2011-2014"),
              (2015, 2018, "_ato2015-2018"), (2019, 2022, "_ato2019-2022"), (2023, 2026, "_ato2023-2026"),
              (2027, 2030, "_ato2027-2030")]


def candidatos(lei):
    """Endereços prováveis da lei no Planalto, do texto compilado (atualizado) para o simples."""
    if lei.get("url"):
        return [lei["url"]]
    tipo, n, ano = lei.get("tipo"), lei.get("n"), lei.get("ano")
    if tipo == "cf":
        return [BASE + "constituicao/constituicaocompilado.htm", BASE + "constituicao/constituicao.htm"]
    nd = f"{n:,}".replace(",", ".") if n else ""
    def variantes(prefixo, *nomes):
        saida = []
        for nome in nomes:
            saida += [f"{prefixo}{nome}compilado.htm", f"{prefixo}{nome}compilada.htm", f"{prefixo}{nome}cons.htm", f"{prefixo}{nome}.htm"]
        return [BASE + x for x in saida]
    if tipo == "dl":
        return variantes("decreto-lei/", f"del{n}", f"Del{n}")
    if tipo == "lc":
        return variantes("leis/lcp/", f"lcp{n}")
    pasta = next((p for a, b, p in PASTAS_ANO if a <= ano <= b), None)
    if tipo == "decreto":
        return variantes(f"{pasta}/{ano}/decreto/", f"d{n}", f"D{n}") if pasta else variantes("decreto/", f"d{n}", f"D{n}")
    if pasta:
        return variantes(f"{pasta}/{ano}/lei/", f"l{n}", f"L{n}")
    if ano >= 2001:
        return variantes(f"leis/{ano}/", f"l{n}", f"l{nd}", f"L{nd}") + variantes(f"leis/LEIS_{ano}/", f"L{n}")
    return variantes("leis/", f"l{n}", f"L{n}")


def confere(lei, html, artigos):
    """A página baixada é mesmo desta lei? (evita guardar a lei errada)"""
    if not artigos:
        return False
    texto = re.sub(r"<[^>]+>", " ", html[:60000])
    compacto = re.sub(r"[.\s]", "", texto).upper()
    if lei.get("tipo") == "cf":
        return "CONSTITUI" in compacto
    if lei.get("n"):
        return str(lei["n"]) in compacto
    return True


def obter_pagina(lei, anterior, cond):
    """Baixa a página da lei. Sem histórico, testa os endereços prováveis até achar o certo."""
    if anterior and anterior.get("url"):
        return anterior["url"], baixar(anterior["url"], cond)
    ultimo = None
    for url in candidatos(lei):
        try:
            r = baixar(url, {})
        except NaoEncontrada as e:
            ultimo = e
            time.sleep(1)
            continue
        html = decodificar(r.content)
        arts, _, _ = extrair_artigos(html)
        if confere(lei, html, arts):
            return url, r
        ultimo = Exception(f"{url} não corresponde a esta norma")
        time.sleep(1)
    raise ultimo or Exception("nenhum endereço funcionou")


# ------------------------------------------------------------- verificação

def verificar_lei(lei, status_anterior):
    momento = agora()
    reg = dict(status_anterior or {})
    reg.update({
        "nome": lei["nome"],
        "numero": lei.get("numero", ""),
        "area": lei.get("area", ""),
        "apelidos": lei.get("apelidos", ""),
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
    bruto = PASTA_BRUTO / f"{lei['id']}.html.gz"
    ultimo_completo = anterior.get("ultimo_download_completo") if anterior else None
    precisa_completo = (
        anterior is None
        or not bruto.exists()
        or anterior.get("versao_leitor") != VERSAO_LEITOR
        or not ultimo_completo
        or (momento - datetime.fromisoformat(ultimo_completo)).days >= DIAS_DOWNLOAD_COMPLETO
    )
    if precisa_completo:
        pass  # sem cabeçalhos condicionais: a página vem inteira
    elif anterior.get("etag"):
        cond["If-None-Match"] = anterior["etag"]
    if not precisa_completo and anterior.get("last_modified"):
        cond["If-Modified-Since"] = anterior["last_modified"]

    try:
        url, resp = obter_pagina(lei, anterior, cond)
    except Exception as e:
        return erro(f"Não foi possível acessar a fonte: {e}")
    reg["url"] = url

    def confirmar(status, mensagem):
        reg["status"] = status
        reg["mensagem"] = mensagem
        reg["ultima_verificacao_ok"] = momento.isoformat(timespec="seconds")
        return reg

    if resp.status_code == 304:
        reg.update({"versao": anterior["versao"], "n_artigos": len(anterior["artigos"]),
                    "hash": anterior["hash"]})
        reg.setdefault("diagnostico", {})["fonte_envia_etag"] = bool(anterior.get("etag"))
        reg["diagnostico"]["fonte_envia_last_modified"] = bool(anterior.get("last_modified"))
        return confirmar("ATUALIZADA", "A fonte confirmou que a página não mudou (resposta 304), "
                                       "sem precisar baixar o texto.")

    salvar_bruto(bruto, resp.content)
    artigos, repetidos, preambulo = extrair_artigos(decodificar(resp.content))
    n = len(artigos)
    ausentes = lacunas(artigos)
    reg["diagnostico"] = {
        "tamanho_pagina_kb": round(len(resp.content) / 1024, 1),
        "fonte_envia_etag": bool(resp.headers.get("ETag")),
        "fonte_envia_last_modified": bool(resp.headers.get("Last-Modified")),
        "artigos_com_numero_repetido": repetidos,
        "artigos_ausentes_na_sequencia": ausentes[:30],
    }

    minimo = lei.get("minimo_artigos", 1)
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
        "url": url,
        "versao": momento.date().isoformat(),
        "hash": hash_novo,
        "etag": resp.headers.get("ETag"),
        "last_modified": resp.headers.get("Last-Modified"),
        "versao_leitor": VERSAO_LEITOR,
        "preambulo": preambulo,
        "ultimo_download_completo": momento.isoformat(timespec="seconds"),
        "artigos": artigos,
    }

    if anterior is None:
        # espalha o "download completo semanal" pelos dias da semana (não baixa tudo no mesmo dia)
        atraso = zlib.crc32(lei["id"].encode()) % DIAS_DOWNLOAD_COMPLETO
        novo["ultimo_download_completo"] = (momento - timedelta(days=atraso)).isoformat(timespec="seconds")
        salvar_json(arq_texto, novo)
        reg.update({"versao": novo["versao"], "n_artigos": n, "hash": hash_novo})
        return confirmar("ATUALIZADA", f"Primeira carga concluída: {n} artigos lidos.")

    if anterior.get("versao_leitor") != VERSAO_LEITOR:
        # O leitor foi melhorado: relê o texto sem registrar como alteração da lei.
        novo["versao"] = anterior["versao"]
        salvar_json(arq_texto, novo)
        reg.update({"versao": novo["versao"], "n_artigos": n, "hash": hash_novo})
        return confirmar("ATUALIZADA", f"Texto relido com o leitor atualizado ({n} artigos). "
                                       "Isso não é alteração da lei.")

    if anterior["hash"] == hash_novo:
        novo["versao"] = anterior["versao"]
        salvar_json(arq_texto, novo)  # atualiza ETag e data do último download completo
        reg.update({"versao": anterior["versao"], "n_artigos": n, "hash": hash_novo})
        return confirmar("ATUALIZADA", f"Sem alterações ({n} artigos conferidos no texto completo).")

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
               "| Lei | Página (KB) | Envia ETag | Envia Last-Modified | Artigos repetidos | Números ausentes |",
               "|---|---|---|---|---|---|"]
    for reg in status.values():
        d = reg.get("diagnostico", {})
        linhas.append(f"| {reg['nome']} | {d.get('tamanho_pagina_kb', '—')} | "
                      f"{'sim' if d.get('fonte_envia_etag') else 'não'} | "
                      f"{'sim' if d.get('fonte_envia_last_modified') else 'não'} | "
                      f"{d.get('artigos_com_numero_repetido', '—')} | "
                      f"{', '.join(map(str, d.get('artigos_ausentes_na_sequencia', []))) or 'nenhum'} |")
    nunca = [r for r in status.values() if r.get("status") == "ERRO_VERIFICACAO" and not r.get("ultima_verificacao_ok")]
    if nunca:
        linhas += ["", f"### Normas ainda não localizadas no Planalto ({len(nunca)})", ""]
        linhas += [f"- {r['nome']} ({r.get('numero', '')}): {r.get('mensagem', '')}" for r in nunca]
    texto = "\n".join(linhas)
    print(texto)
    destino = os.environ.get("GITHUB_STEP_SUMMARY")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            f.write(texto + "\n")


def main():
    leis = ler_json(ARQ_LEIS, [])
    status = ler_json(ARQ_STATUS, {})
    ja_funcionavam = {k for k, v in status.items() if v.get("ultima_verificacao_ok")}
    for lei in leis:
        print(f"Verificando {lei['nome']}…", flush=True)
        try:
            status[lei["id"]] = verificar_lei(lei, status.get(lei["id"]))
        except Exception as e:  # um problema inesperado numa lei não pode derrubar as outras
            reg = dict(status.get(lei["id"]) or {})
            reg.update({"nome": lei["nome"], "numero": lei.get("numero", ""), "area": lei.get("area", ""),
                        "apelidos": lei.get("apelidos", ""), "status": "ERRO_VERIFICACAO",
                        "ultima_tentativa": agora().isoformat(timespec="seconds"),
                        "mensagem": f"Erro inesperado ao processar a página: {type(e).__name__}: {e}"})
            status[lei["id"]] = reg
        time.sleep(3)  # intervalo educado entre consultas à fonte
    salvar_json(ARQ_STATUS, status)
    escrever_resumo(status)
    # Falha proposital (o GitHub envia e-mail) quando uma lei que já funcionava deixou de ser verificada.
    # Leis novas que ainda não foram localizadas aparecem no resumo, sem disparar e-mail todo dia.
    ids = {l["id"] for l in leis}
    if any(status[k].get("status") == "ERRO_VERIFICACAO" for k in ja_funcionavam & ids):
        sys.exit(1)


if __name__ == "__main__":
    main()
