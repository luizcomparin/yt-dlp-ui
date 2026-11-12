# Documentação: yt-dlp UI

## Índice

| Documento | Conteúdo |
|---|---|
| [plano.md](plano.md) | Requisitos, arquitetura, fases e features futuras |
| [arquitetura.md](arquitetura.md) | Processos do Electron, estrutura de pastas, como adicionar IPC |
| [dependencias.md](dependencias.md) | Ferramentas e bibliotecas: para que servem, como são instaladas, armadilhas |
| [decisoes/](decisoes/) | ADRs: decisões técnicas e o motivo de cada uma |
| [propostas/](propostas/) | Levantamentos de features futuras ainda não decididas (ex.: [exportar para CD](propostas/cd-player.md)) |
| [modulos/](modulos/) | Um arquivo por módulo, com fluxo e dependências |

## Como a documentação é organizada

- **`plano.md`**: o "o quê" e o "quando". É atualizado quando um requisito muda ou uma fase termina (marcar ✅ na tabela de fases).
- **`arquitetura.md`**: o mapa geral, com os módulos, a comunicação entre eles (IPC) e um diagrama simples. Deve ser curto.
- **`dependencias.md`**: a lista única de dependências externas (binários) e de bibliotecas npm relevantes, com o motivo de cada uma.
- **`decisoes/NNNN-titulo.md`** (ADR): um arquivo por decisão importante (stack, banco, formato de log…). Cada ADR registra contexto, opções, decisão e consequências. Uma ADR não é editada depois de aceita; se a decisão mudar, cria-se uma nova ADR que substitui a anterior.
- **`propostas/<tema>.md`**: levantamento de uma feature futura que ainda **não** foi decidida nem implementada (contexto, opções, o que adicionar, riscos e uma tabela de **decisões em aberto**). Quando a feature for decidida, as escolhas viram uma ADR e o que for implementado vira um `modulos/<modulo>.md`.
- **`modulos/<modulo>.md`**: documentação de cada módulo implementado, seguindo o [template](modulos/_template.md).

## Regra

**Toda implementação deve vir acompanhada de documentação no mesmo commit:**

1. Criar ou atualizar `modulos/<modulo>.md`, descrevendo de forma resumida o fluxo e as dependências.
2. Atualizar `dependencias.md` se entrou uma biblioteca ou ferramenta nova.
3. Criar uma ADR se houve uma decisão técnica relevante.
4. Atualizar o status da fase em `plano.md`.
