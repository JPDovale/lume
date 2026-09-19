# Lume

<img src="public/icon.svg" alt="Ícone Lume" width="96"/>

[![Build desktop apps](https://github.com/JPDovale/lume/actions/workflows/build.yml/badge.svg)](https://github.com/JPDovale/lume/actions/workflows/build.yml)

[Baixar para Linux e Windows](https://github.com/JPDovale/lume/releases/latest)

Aplicativo pessoal de finanças em **Electron + React + TypeScript + shadcn/ui**, com tema escuro, valores em reais e dados locais.

## Executar

Requer Node.js 24+ e npm.

```sh
npm ci
npm run dev
```

Para executar o build:

```sh
npm run build
npm start
```

O renderer precisa do Electron. Abrir apenas a URL do Vite mostra uma instrução de inicialização; não existe um segundo banco fictício no navegador.

Pacote Linux em diretório, sem instalar globalmente:

```sh
npm run package
./release/linux-unpacked/lume
```

## Funcionalidades

- Importação de ZIP exportado pelo Actual Budget, ou `db.sqlite`, com prévia e confirmação. Importa contas, categorias, lançamentos e hashtags presentes nas notas. IDs preservados permitem repetir a importação sem duplicar registros.
- Lançamentos individuais, edição, categorização e múltiplas tags. Busca e filtros por mês, categoria e tag; paginação de 30 registros.
- Recorrências semanais, mensais e anuais, com início, término por data ou quantidade de parcelas, valor exato/aproximado e pausa. O dia 31 é ajustado ao último dia de meses menores e volta ao dia original no mês seguinte. As ocorrências vencidas são geradas na abertura e a cada minuto enquanto o app estiver aberto.
- Cadastro de contas, categorias e tags.
- Painel **Gastos e previsões**: comparações por categoria em intervalos equivalentes, maiores gastos, variações, padrões mensais e projeções de 3, 6 ou 12 meses.
- Painel **Patrimônio**: evolução líquida, ativos/dívidas, resultado de caixa mensal, reconciliação de saldos, composição por conta e cenários futuros.
- Layout responsivo desde 360 px, menu recolhível e tabelas com rolagem independente. Fundos em cinza neutro; verde restrito ao destaque e cores distintas nos gráficos. Barras de rolagem escuras, arredondadas e com estados hover/ativo em páginas, modais e tabelas.
- Exportação de backup pelo botão ao lado de “Novo lançamento”.

Comece em **Organização** criando uma conta, ou use **Importar Actual** na barra lateral. O banco inicial é vazio. As imagens `preview.png`, `reports-preview.png`, `wealth-preview.png`, `wealth-mobile.png` e `spending-mobile.png` usam dados fictícios de teste, em outro perfil.

## Importação: alcance e limites

O formato de origem é o [export oficial do Actual](https://actualbudget.org/docs/api/reference/): um ZIP com `db.sqlite` e `metadata.json`. A implementação foi conferida contra o schema e migrações do [código-fonte do Actual](https://github.com/actualbudget/actual/tree/master/packages/loot-core).

- Lançamentos divididos viram parcelas individuais, sem importar novamente o total pai.
- Transferências continuam compondo os saldos por conta, mas não entram nos relatórios de receitas e despesas.
- Saldos iniciais compõem o saldo, sem inflar receita ou gasto.
- Mapeamentos de categorias e favorecidos são resolvidos. Contas/categorias históricas referenciadas são preservadas.
- Registros excluídos e filhos de pais excluídos não são importados. Valores zero e registros sem conta/data são contados como ignorados na prévia.
- Agendamentos, regras de automação, orçamentos, metas e estado de conciliação do Actual **não são migrados**. Cadastre as recorrências no Lume.
- Importar novamente ignora IDs existentes; não sincroniza alterações feitas posteriormente no Actual.
- Uma base SQLite inválida ou um registro monetário/data incompatível interrompe a prévia, sem gravar parcialmente.
- A migração foi testada com bases sintéticas de contrato; ainda precisa ser validada com o seu export real.

## Gastos e previsões

Tudo é calculado localmente, sem API de IA. Os filtros permitem consultar 6, 12 ou 24 meses de histórico e projetar 3, 6 ou 12 meses. O modelo de previsão sempre usa até 36 meses completos; aumentar a janela visual não muda sua base de treinamento.

- **Comparações justas:** o mês atual é comparado até o mesmo dia do mês anterior, com ajuste para meses menores. Uma base anterior igual a zero é indicada como “Sem base”, sem inventar percentuais.
- **Previsões compartilhadas:** compromissos cadastrados, padrões mensais inferidos e gastos variáveis são tratados separadamente. As recorrências exatas podem informar valores mesmo sem histórico; as aproximadas usam ocorrências validadas.
- **Modelos e validação:** seleção temporal no horizonte solicitado, com erros externos à escolha do modelo. A documentação descreve suporte mínimo, sazonalidade, intermitência e tratamento de lacunas.
- **Incerteza:** faixas derivadas de erros comparáveis, alinhados por período para os totais. Sem amostra suficiente, a faixa fica indisponível; não há margens percentuais fixas.
- **Insights:** comparações equivalentes, frequência, ticket e gastos atípicos com os valores que sustentam cada leitura.

Fórmulas, motivos, critérios e referências estão em [Cálculos financeiros do Lume](docs/calculos.md). Não há ajuste automático de inflação ou rentabilidade.

## Patrimônio

Patrimônio líquido = soma dos saldos positivos das contas menos o valor absoluto dos negativos. O gráfico carrega o saldo acumulado anterior à janela escolhida; períodos anteriores ao primeiro registro aparecem sem dados. O mês em andamento mostra somente lançamentos até hoje.

O painel separa:

- Saldo anterior ao período.
- Receitas menos despesas (resultado de caixa, não retorno de investimento).
- Saldos iniciais introduzidos no período.
- Efeito de transferências que não se anulam na janela.
- Patrimônio atual, com tabela de fechamento mensal e composição por conta.

A projeção começa no saldo de hoje, considera só o fluxo **restante** estimado do mês atual e depois acumula as entradas e saídas de cada mês futuro. Saldos iniciais e transferências futuras efetivamente registrados são considerados separadamente. Cenários inferior/superior combinam variações de receitas/despesas; não pressupõem crescimento automático dos ativos. Imóveis, investimentos ou obrigações não registrados nas contas não entram no patrimônio.

Pausar impede a geração enquanto pausada; retomar registra os vencimentos desde o início, incluindo o período pausado. Para encerrar de vez uma série, use uma data final ao cadastrar. Edições de lançamentos já gerados alteram apenas aquela ocorrência.

## Arquitetura

```text
src/domain/          Entidades, validações, dinheiro e recorrências
src/domain/analytics/ Calendário, estatística, padrões, previsão, gastos e patrimônio
src/application/     Casos de uso e contratos de repositório, relógio, importador e API
src/infrastructure/  Adaptadores SQLite e importação Actual
src/features/        Telas e formulários organizados por funcionalidade
src/components/ui/   Componentes gerados pelo CLI oficial do shadcn
 electron/           Composition root, IPC e preload
 tests/              Testes de domínio, importação e persistência
 scripts/            Build e teste integrado do Electron
```

O domínio não importa React, Electron ou SQLite. `LedgerService` recebe `LedgerRepository` e `Clock`, permitindo testar as regras sem disco nem interface. `ActualImporter` implementa um contrato independente. Os adaptadores são compostos no processo principal do Electron. O preload expõe apenas operações específicas; o renderer usa isolamento de contexto e não tem acesso direto a Node/arquivos.

A persistência desta primeira versão é um snapshot versionado do agregado em SQLite via sql.js. É uma escolha simples para uso pessoal: não há ORM, servidor ou migrações relacionais artificiais. Substituir o adaptador por tabelas normalizadas não exige reescrever as regras. A gravação usa arquivo temporário, flush e renomeação, preservando a versão anterior em `.bak`.

## Dados e backup

Banco: `lume.sqlite` no diretório `app.getPath('userData')` do Electron (normalmente `~/.config/lume` no Linux). Antes de cada gravação, o banco anterior é preservado como `lume.sqlite.bak`. Não há criptografia do arquivo.

O backup exportado é do Lume, não do Actual. Para restaurar nesta versão, feche o app, preserve uma cópia do banco atual e coloque o backup como `lume.sqlite` no diretório de dados. Não importe esse arquivo pelo botão do Actual.

A variável `LUME_DATA_DIR` permite usar outro diretório; os testes integrados utilizam um perfil temporário isolado.

## Validação

```sh
npm test          # regras, migração e persistência
npm run lint      # código-fonte, sem artefatos gerados
npm run test:e2e  # build + Electron real; requer sessão gráfica
```

O teste integrado cadastra conta/categoria/tag, cria e edita um lançamento, cria uma recorrência, fecha/reabre o app para verificar persistência e idempotência, importa um ZIP pela prévia e repete a importação para checar duplicatas. O seletor nativo de arquivos é substituído somente dentro do processo de teste. Depois usa outro perfil isolado, com 12 meses de dados fictícios, para verificar categorias, horizontes, gráficos e patrimônio. Navega pelas seis telas em 1440, 768, 390 e 360 px, verifica filtros, menu, Escape, formulários e ausência de overflow horizontal da página. Inspeções visuais usam capturas reais do Electron. Nenhuma fixture é gravada no banco pessoal.

Os testes unitários cobrem fronteiras de datas, comparações proporcionais, detecção de padrões, dupla contagem, faixas, saldo histórico fora da janela, dívidas, transferências, saldos iniciais, patrimônio negativo e o restante do fluxo do mês atual.


## Distribuição e atualizações

O vetor original está em [`public/icon.svg`](public/icon.svg). `npm run icons` gera PNG 512 px e ICO multirresolução a partir dele; os pacotes e a janela usam a mesma identidade.

```sh
npm run package:linux  # release/Lume-linux-x86_64.AppImage
npm run package:win    # release/Lume-Setup-0.3.1-x64.exe (executar no Windows)
```

O GitHub Actions testa e empacota em runners nativos Linux e Windows a cada push em `main`, pull request e execução manual. Tags `v*` publicam os dois arquivos e `SHA256SUMS.txt` em Releases. Os pacotes são x64; o instalador Windows ainda não possui assinatura de código. Não há atualização automática dentro do Lume.

Para publicar uma versão, atualize `package.json` e `package-lock.json`, faça commit e envie a tag correspondente (por exemplo, `v0.3.2`).

### Linux com Gear Lever

Com o Gear Lever instalado pelo Flathub:

```sh
flatpak run it.mijorus.gearlever --integrate ./release/Lume-linux-x86_64.AppImage --yes
flatpak run it.mijorus.gearlever --set-update-source ~/AppImages/lume.appimage --manager GithubUpdater repo_url=https://github.com/JPDovale/lume repo_filename=Lume-linux-x86_64.AppImage allow_prereleases=false
xdg-mime default it.mijorus.gearlever.desktop application/vnd.appimage
```

O caminho integrado depende da pasta configurada no Gear Lever; confira com `flatpak run it.mijorus.gearlever --list-installed`. O lançador aparece no menu de aplicativos. As atualizações são gerenciadas pelo Gear Lever a partir das Releases do GitHub e preservam o banco em `~/.config/lume`.


## Recorrências, parcelas e validação

- **Exatamente:** cada vencimento entra confirmado, pelo valor por parcela informado.
- **Aproximadamente:** cada vencimento entra pendente. Em **Lançamentos → Pendentes de validação → Validar**, confira o valor real e clique em **Validar lançamento**. **Salvar alterações** apenas edita e mantém a pendência.
- Pendências participam das previsões, mas ficam fora dos gastos realizados, saldos das contas e patrimônio até serem validadas.
- Escolha **Término → Por número de parcelas** (1 a 1.200, incluindo a primeira) ou **Em uma data** (inclusive). A geração termina nesse limite. Sem término, a recorrência continua indefinidamente.
- A tabela de recorrências mostra lançadas/total e pendências. Lançamentos com fim exibem `1/12`, `2/12` etc. O nome da recorrência abre sua origem; **Ver lançamentos** aplica o filtro correspondente.
- Editar data, descrição ou valor de uma parcela não altera a recorrência nem sua posição original. O identificador, a data de origem e o vínculo são preservados para evitar duplicações e manter as previsões corretas.
- Registros de versões anteriores recebem vínculo/numeração automaticamente quando a origem é identificável; seus valores são preservados e tratados como confirmados. Alterar uma regra não reabre validações anteriores. Não é possível reduzir o término para excluir parcelas já geradas.

Validação do fluxo completo em Electron real, com perfil temporário separado:

```sh
npm run build
node scripts/recurrence-smoke.mjs
```


## Editar recorrências e organizar categorias/tags

Em **Recorrências → Editar**, ajuste descrição, valor, precisão, conta, categoria, tags, observações e término. As alterações afetam novas ocorrências; valores e validações existentes são preservados. Início e frequência podem ser alterados enquanto não houver lançamentos; após a primeira ocorrência, esses campos ficam fixos para preservar a numeração.

Em **Organização**, os botões de lápis renomeiam categorias e tags sem alterar seus vínculos. O botão de lixeira abre um modal com a quantidade de lançamentos e recorrências afetados e um seletor de destino. **Mover e excluir** transfere todos os vínculos antes de remover a origem, numa única gravação. Tags de destino já presentes não são duplicadas.

A seleção de outro destino é obrigatória quando há vínculos, inclusive em recorrências ainda sem lançamentos. Caso não exista outro item, cadastre-o antes. Apenas itens sem vínculos podem ser excluídos sem destino. Cancelar não altera dados.

`node scripts/management-smoke.mjs` valida edição, renomeação, cancelamento, migração obrigatória, deduplicação de tags, interface a 360 px e persistência ao reabrir.


## Contas e comportamento de gastos

O ícone de conta no canto superior direito abre o seletor **Conta da visualização**, que filtra visão geral, gastos, patrimônio, lançamentos e recorrências. Cada tela mantém sua seleção enquanto o app está aberto. **Definir como principal** salva a conta no banco; visão geral e gastos abrem com ela nas próximas sessões. Também é possível defini-la em Organização. Sem principal, o padrão é o conjunto das contas.

Em **Organização → Contas**, desmarque **Incluir nos gastos e previsões** na conta de investimentos. Ela sai dos gastos consolidados, mas permanece no patrimônio, nos lançamentos e no banco. Selecioná-la explicitamente permite analisá-la mesmo estando excluída. O filtro não muda nem apaga registros; as preferências acompanham o backup.

**O que mudou no seu comportamento** compara os três últimos meses completos aos três anteriores, por categoria: média mensal, frequência, valor por lançamento e descrições que mais contribuíram. A decomposição usa `(frequência recente − anterior) × ticket anterior` e `frequência recente × (ticket recente − anterior)`; sua soma corresponde à variação do gasto médio. É uma descrição dos registros, não uma explicação causal.

Os cálculos atuais estão documentados em [Cálculos financeiros](docs/calculos.md): seleção por horizonte, erros fora da amostra, tratamento de lacunas, intermitência, recorrências e cenários que preservam a relação entre categorias. A faixa pode ficar indisponível quando faltam dados; isso não é substituído por uma margem arbitrária.

`node scripts/account-analytics-smoke.mjs` valida filtros, exclusão de investimentos, persistência da conta principal, evidências por categoria e layout a 360 px em Electron real com perfil temporário.


## Calculadoras flutuantes

O botão de calculadora no cabeçalho abre uma nova instância a cada clique. Arraste pelo título (ou use as setas com o controle de mover focado), minimize ou feche cada janela. As expressões são independentes e as calculadoras permanecem abertas ao navegar entre telas. Em telas estreitas, as janelas ficam contidas na área visível, com rolagem interna.

O histórico dos últimos 100 cálculos é compartilhado imediatamente entre as instâncias e salvo no banco local, incluindo nos backups. Clique em uma entrada para reutilizar o resultado. Fechar a calculadora não apaga o histórico; posições e expressões abertas não são restauradas ao reiniciar.

Aceita teclado/Enter, vírgula ou ponto decimal, operações básicas, negativos, parênteses e porcentagem. `%` significa dividir por 100: `200 × 15% = 30`; para acrescentar 10% a 100, use `100 × (1 + 10%)`. Não use separador de milhar. Os cálculos usam frações inteiras internamente, com arredondamento apenas no resultado exibido (até 12 casas); a expressão é limitada a 160 caracteres. Nenhum código da expressão é executado. Falhas de cálculo não entram no histórico e nenhum lançamento financeiro é criado.

`node scripts/calculator-smoke.mjs` verifica múltiplas instâncias, arraste, teclado, histórico compartilhado, reutilização, erros, minimização, navegação, layout a 360 px e persistência, usando Electron real e perfil isolado.


Gastos variáveis sem evidência de repetição são mostrados como **Sem padrão** na tabela dos próximos meses quando não há compromissos conhecidos. Não entram na soma projetada nem são redistribuídos ao longo do ano. O valor original continua no histórico e no realizado; lançamentos futuros já registrados e recorrências cadastradas continuam nas previsões. **Sem padrão** expressa falta de base para extrapolar, não certeza de gasto zero nem uma probabilidade estatística. A regra de frequência é uma heurística conservadora e pode deixar de projetar gastos trimestrais ou irregulares; cadastre os compromissos conhecidos como recorrências.


## Coerência entre categorias, total e entradas

**Cada categoria, com contexto** mostra estimativas centrais, a participação de cada categoria no total e a soma das categorias no rodapé. Entradas, gastos e diferença previstos usam a mesma conta e o mesmo mês. Um limite superior de cenário não é apresentado como valor provável na tabela: os cenários ficam no detalhe, comparados com o total do mesmo cenário. Categorias voláteis aparecem como **Baixa previsibilidade** e o detalhe explica que não há faixa provável confiável. A renda contextualiza a previsão, mas não limita gastos já conhecidos nem impõe um teto artificial às categorias.

Para evitar contar duas vezes uma receita/despesa recorrente importada sem identificação, a previsão pode conciliar registros com descrição exata **Lançamento importado** com uma recorrência mensal da mesma conta, categoria e sinal. São exigidos três meses completos consecutivos, cada um com um único pagamento compatível (valor a até 15% do compromisso e dia a até 10 dias do vencimento). Regras concorrentes bloqueiam a associação. Meses antigos com um único pagamento nessa posição podem representar valores anteriores do mesmo compromisso; se houver vários, só o candidato único compatível é utilizado. No mês atual e em registros futuros, o valor compatível continua obrigatório. Outras descrições, contas, categorias, transferências e pendências não entram nessa inferência.

Essa correspondência é **estimada**, exibida como tal no contexto de entradas e usada somente no cálculo das previsões. Não muda vínculos, valores ou datas dos lançamentos, nem os transforma em parcelas. Ela evita somar o histórico compatível à recorrência, mas não elimina fontes adicionais identificadas. Nomes claros nos registros continuam sendo preferíveis.

`node scripts/forecast-context-smoke.mjs` verifica reconciliação de receitas, tabela de estimativas centrais, total consolidado, explicação dos cenários e responsividade em um perfil fictício isolado.

## Planejamento mensal e métodos financeiros

**Planejamento** é sempre para o próximo mês. Defina o percentual de sobra e ajuste as reservas por categoria (slider de 0 a 100% da previsão): a prévia recalcula automaticamente. **Salvar planejamento** preserva a versão que será comparada ao realizado. Os fechamentos estão em **Resultados dos planos**, com detalhes e revisões após validações tardias.

As telas compartilham o motor `cashflow-v2`, com precedência de recorrências, treinamento confirmado, validação temporal no horizonte solicitado e cenários conjuntos somente quando há evidência suficiente. Percentuais de reserva alteram limites, sem alterar a previsão de comportamento.

A descrição atual e completa, incluindo fórmulas, parâmetros, motivos, limitações, referências científicas indexadas e mapa do código, está em **[Cálculos financeiros do Lume](docs/calculos.md)**. Essa documentação substitui as descrições anteriores do motor nesta página, incluindo margens percentuais fixas e ajustes baseados na razão realizado/limite.

`node scripts/planning-smoke.mjs` verifica próximo mês fixo, recálculo automático, sliders percentuais, inclusão/remoção, persistência, resultados separados, responsividade e separadores mensais. `node scripts/forecast-benchmark.mjs` reproduz as comparações sintéticas em [forecast-benchmark.json](docs/forecast-benchmark.json); elas não são garantia de acurácia sobre dados reais.
