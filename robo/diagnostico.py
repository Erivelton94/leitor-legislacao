#!/usr/bin/env python3
"""
Diagnóstico de acesso às fontes oficiais.
Descobre POR QUE o Planalto recusou a conexão e quais fontes respondem ao GitHub.
Não altera nenhum dado do robô.
"""
import os
import time

import requests

ROBO = {"User-Agent": "LeitorLegislacao/0.1 (uso pessoal de estudo; verificacao diaria)"}
NAVEGADOR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

TESTES = [
    ("Planalto (https, identificação do robô)", "https://www.planalto.gov.br/ccivil_03/leis/l7210.htm", ROBO),
    ("Planalto (https, como navegador)", "https://www.planalto.gov.br/ccivil_03/leis/l7210.htm", NAVEGADOR),
    ("Planalto (http, como navegador)", "http://www.planalto.gov.br/ccivil_03/leis/l7210.htm", NAVEGADOR),
    ("Planalto (sem www, como navegador)", "https://planalto.gov.br/ccivil_03/leis/l7210.htm", NAVEGADOR),
    ("Senado — Dados Abertos (norma 7.210)",
     "https://legis.senado.leg.br/dadosabertos/legislacao/lista.json?numero=7210", NAVEGADOR),
    ("LexML — busca SRU",
     "https://www.lexml.gov.br/busca/SRU?operation=searchRetrieve&version=1.1&query=urn+any+7210&maximumRecords=1",
     NAVEGADOR),
    ("Câmara dos Deputados — portal", "https://www.camara.leg.br/", NAVEGADOR),
]


def testar(nome, url, cabecalhos):
    inicio = time.time()
    try:
        r = requests.get(url, headers=cabecalhos, timeout=30)
        return f"| {nome} | ✅ respondeu (código {r.status_code}) | {round(len(r.content)/1024, 1)} KB | {time.time()-inicio:.1f}s |"
    except requests.RequestException as e:
        motivo = type(e).__name__
        return f"| {nome} | ❌ falhou ({motivo}) | — | {time.time()-inicio:.1f}s |"


def main():
    linhas = ["## Diagnóstico de acesso às fontes", ""]
    try:
        info = requests.get("https://ipinfo.io/json", timeout=15).json()
        linhas.append(f"Servidor do GitHub localizado em: **{info.get('country', '?')}** "
                      f"({info.get('region', '?')}), rede: {info.get('org', '?')}")
    except requests.RequestException:
        linhas.append("Não foi possível identificar a localização do servidor do GitHub.")
    linhas += ["", "| Teste | Resultado | Tamanho | Tempo |", "|---|---|---|---|"]
    for nome, url, cab in TESTES:
        print(f"Testando {nome}…", flush=True)
        linhas.append(testar(nome, url, cab))
        time.sleep(2)
    texto = "\n".join(linhas)
    print(texto)
    destino = os.environ.get("GITHUB_STEP_SUMMARY")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            f.write(texto + "\n")


if __name__ == "__main__":
    main()
