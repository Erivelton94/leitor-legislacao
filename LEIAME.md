# Leitor Inteligente de Legislação — Etapa 1

Teste de acesso ao Planalto. O robô baixa três leis, divide o texto em artigos,
guarda uma "impressão digital" de cada artigo e, nas próximas verificações,
aponta exatamente quais artigos mudaram.

Leis do teste: Lei de Execução Penal, Código Penal e Lei Maria da Penha.

## Passo a passo (faça pelo computador, é mais fácil)

1. **Crie o repositório.** No GitHub, clique em **New repository**, dê o nome
   `leitor-legislacao`, marque **Public** e clique em **Create repository**.
   O repositório precisa ser público para usar o GitHub Pages de graça depois.
   Só os textos das leis ficam lá; suas anotações nunca vão para o GitHub.

2. **Envie os arquivos.** Descompacte o ZIP. No repositório, clique em
   **Add file → Upload files** e arraste: `leis.json`, `requirements.txt`,
   `LEIAME.md` e as pastas `robo` e `dados`. Clique em **Commit changes**.

3. **Crie o arquivo do robô.** A pasta `.github` costuma ficar oculta no
   computador, então é mais seguro criá-la pelo site: clique em
   **Add file → Create new file**, digite no nome exatamente
   `.github/workflows/verificar.yml`, cole o conteúdo do arquivo `verificar.yml`
   que está no ZIP e clique em **Commit changes**.

4. **Rode o teste.** Abra a aba **Actions**, clique em **Verificar legislação**
   (à esquerda) e depois em **Run workflow → Run workflow**. Aguarde de 1 a 3 minutos.

5. **Veja o resultado.** Clique na execução que apareceu. Role até o **Summary**:
   haverá uma tabela com o status de cada lei e um diagnóstico técnico da fonte.

## O que me enviar depois do teste

Um print (ou o texto) das duas tabelas do Summary. Com elas eu confiro se:

- o Planalto aceitou o acesso automático do GitHub;
- o número de artigos lidos bate com cada lei;
- a fonte envia ETag/Last-Modified (o que permite verificar sem baixar a página inteira).

## Se der erro

- **Erro ao salvar (permission denied / 403 no push):** vá em
  **Settings → Actions → General → Workflow permissions**, marque
  **Read and write permissions**, salve e rode de novo.
- **"Não foi possível acessar a fonte":** o Planalto pode estar bloqueando
  o GitHub. Me mande a mensagem completa para avaliarmos outra fonte oficial.
- **"Leitura suspeita":** a página foi baixada, mas o texto veio incompleto.
  Nada foi sobrescrito. Me mande a mensagem.

## Como funciona depois

O robô roda sozinho todo dia às 06:00 (horário de Recife). Quando alguma lei
não pode ser verificada, a execução aparece como falha e o GitHub envia um
e-mail avisando. Para acompanhar outra lei, basta acrescentá-la em `leis.json`.
