# ADR 0003: distribuição pública via GitHub Releases + Pages, sem custo

- **Status:** aceita
- **Data:** 2026-11-11
- **Substitui:** a decisão "Distribuição: uso pessoal" do [plano](../plano.md#8-decisões)

## Contexto
O app passou a ser público (repositório no GitHub, licença MIT) e deve poder ser usado por quem não é programador: baixar um instalador e usar. Requisito explícito: **nada pago**.

## Opções
| Tema | Opção | Prós | Contras |
|---|---|---|---|
| Hospedar os `.exe` | **GitHub Releases** | Grátis, link permanente `releases/latest/download/<arquivo>` | Repo precisa ser público |
| | Site próprio / bucket | Controle total | Custo e manutenção |
| Gerar os `.exe` | **GitHub Actions** (`windows-latest`) | Grátis para repo público, build reprodutível a partir do código | Build de ~5 min por versão |
| | Build local + upload manual | Simples | Depende da máquina do mantenedor, fácil errar |
| Página pública | **GitHub Pages** (HTML estático em `site/`) | Grátis, sem build, domínio `*.github.io` | Só estático (a versão vem da API do GitHub no navegador) |
| | Só o README | Zero trabalho | Assusta quem não é programador |
| Assinatura de código | **Sem assinatura** | Grátis | Aviso do SmartScreen na 1ª execução |
| | Azure Trusted Signing / certificado OV | Remove o aviso (com o tempo) | Pago |
| | SignPath Foundation | Grátis para OSS | Exige aprovação, reputação do projeto e processo de revisão |

## Decisão
- Releases gerados pelo **GitHub Actions** ao enviar uma tag `v*`, com instalador NSIS e portátil anexados.
- **Nomes de arquivo fixos** (`yt-dlp-ui-setup.exe`, `yt-dlp-ui-portable.exe`) para o link permanente.
- Página estática no **GitHub Pages**, com botão de download direto.
- **Sem assinatura** por enquanto; o aviso do SmartScreen é explicado no README e na página. O SignPath pode ser reavaliado se o projeto ganhar usuários.
- Binários de terceiros (yt-dlp, ffmpeg, deno) **continuam fora** do executável: são baixados das fontes oficiais pelo app, o que também evita redistribuir o ffmpeg (GPL).

## Consequências
- Publicar uma versão = alterar a versão, criar a tag e fazer push ([distribuição](../modulos/distribuicao.md)).
- O repositório precisa continuar **público**.
- Pré-requisito manual único: Settings → Pages → Source "GitHub Actions".
- Sem atualização automática do app por enquanto.
