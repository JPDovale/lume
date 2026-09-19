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
- Recorrências semanais, mensais e anuais, com início, fim opcional e pausa. O dia 31 é ajustado ao último dia de meses menores e volta ao dia original no mês seguinte. As ocorrências vencidas são geradas na abertura e a cada minuto enquanto o app estiver aberto.
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

Tudo é calculado localmente, sem API de IA. Os filtros permitem consultar 6, 12 ou 24 meses de histórico e projetar 3, 6 ou 12 meses. O modelo de previsão sempre usa até seis meses completos; aumentar a janela visual não muda sua base de treinamento.

- **Comparações justas:** o mês atual é comparado até o mesmo dia do mês anterior, com ajuste para meses menores. Uma base anterior igual a zero é indicada como “Sem base”, sem inventar percentuais.
- **Três componentes:** compromissos cadastrados, padrões mensais inferidos e gastos variáveis. O primeiro mês observado é excluído por poder estar incompleto; a previsão exige pelo menos dois meses de referência.
- **Parte variável:** média ponderada com pesos crescentes de 1 a N, incluindo meses sem gasto como zero. A partir de quatro meses, a mediana das diferenças mensais adiciona uma tendência limitada a 25% da média ponderada.
- **Padrões mensais:** exigem três meses consecutivos, uma ocorrência mensal, mesmo favorecido/descrição normalizada, conta e categoria, dispersão dos valores de no máximo 12% e datas dentro de seis dias. O último mês completo precisa estar presente. São hipóteses, não criam lançamentos.
- **Sem sobreposição automática:** uma recorrência cadastrada com a mesma descrição normalizada, conta, categoria e sinal substitui o padrão histórico. Um lançamento já registrado na data da ocorrência substitui a ocorrência prevista. Padrões inferidos já registrados no mês não são somados novamente. Gastos variáveis futuros são um piso para a estimativa, não uma segunda cópia da média.
- **Faixas:** usam um desvio padrão dos gastos variáveis e margem de 12% dos padrões inferidos ainda não registrados. São cenários de variação, não intervalos de confiança probabilísticos. Categorias sem histórico são identificadas; tendências voláteis e bases curtas também.
- **Insights:** maiores aumentos e reduções por categoria, gastos pontuais acima de 2,5 vezes a mediana (com pelo menos cinco observações anteriores e valor mínimo de R$ 100), despesas sem categoria e expectativa do próximo mês. Cada leitura apresenta a evidência em valores.

Não há modelo de sazonalidade anual, inflação ou rentabilidade. Recorrências recriadas com outra descrição/categoria podem continuar aparecendo na média histórica: a correspondência é explícita por identidade, não uma associação semântica por IA. Corrigir nomes/categorias melhora a separação. Saldos iniciais e transferências não são despesas nem receitas.

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
npm run package:win    # release/Lume-Setup-0.2.0-x64.exe (executar no Windows)
```

O GitHub Actions testa e empacota em runners nativos Linux e Windows a cada push em `main`, pull request e execução manual. Tags `v*` publicam os dois arquivos e `SHA256SUMS.txt` em Releases. Os pacotes são x64; o instalador Windows ainda não possui assinatura de código. Não há atualização automática dentro do Lume.

Para publicar uma versão, atualize `package.json` e `package-lock.json`, faça commit e envie a tag correspondente (por exemplo, `v0.2.1`).

### Linux com Gear Lever

Com o Gear Lever instalado pelo Flathub:

```sh
flatpak run it.mijorus.gearlever --integrate ./release/Lume-linux-x86_64.AppImage --yes
flatpak run it.mijorus.gearlever --set-update-source ~/AppImages/lume.appimage --manager GithubUpdater repo_url=https://github.com/JPDovale/lume repo_filename=Lume-linux-x86_64.AppImage allow_prereleases=false
xdg-mime default it.mijorus.gearlever.desktop application/vnd.appimage
```

O caminho integrado depende da pasta configurada no Gear Lever; confira com `flatpak run it.mijorus.gearlever --list-installed`. O lançador aparece no menu de aplicativos. As atualizações são gerenciadas pelo Gear Lever a partir das Releases do GitHub e preservam o banco em `~/.config/lume`.
