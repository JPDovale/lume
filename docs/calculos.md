# Cálculos financeiros do Lume

Versão do motor: `cashflow-v2`. Revisão: 19/09/2026. Este documento descreve o código implementado, as decisões de produto e os limites de inferência. As referências fundamentam métodos; não constituem uma validação do Lume sobre finanças pessoais reais.

## 1. Mapa dos cálculos e responsabilidades

| Parte do produto | Entrada e resultado | Implementação |
|---|---|---|
| Visão geral | Realizado, saldo e previsão do próximo mês | `reports.ts` → `CashflowForecast` |
| Gastos e previsões | Comparações equivalentes, decomposição por categoria e horizontes futuros | `analytics/spending.ts` → `CashflowForecast` |
| Comportamento | Frequência, ticket, variação, contribuições e ritmo mensal | `analytics/behavior.ts` |
| Recorrências | Calendário, parcelas, vínculo, validação e estimativa de valor | `recurrence.ts`, `forecasting/recurring.ts` |
| Planejamento | Entrada prevista menos sobra; reservas percentuais da previsão | `planning.ts`, `planning-allocation.ts` |
| Resultados dos planos | Plano preservado, realizado confirmado e revisões | `measurePlan`, `closeExpiredPlans` |
| Patrimônio | Saldos históricos e acumulação de fluxos futuros | `analytics/net-worth.ts` → `CashflowForecast` |

O domínio não depende de React, Electron ou SQLite. `forecasting/series.ts` implementa o contrato `SeriesForecaster`; `CashflowForecast` aceita esse contrato no construtor. A fachada `adaptive-forecast.ts` mantém compatibilidade sem manter outro algoritmo. O estimador antigo `estimateSeries`, que não tinha consumidor de produção, foi removido.

`models.ts` contém estimadores; `series.ts`, seleção/validação; `distribution.ts`, cenários conjuntos; `recurring.ts`, valores das recorrências; `feedback.ts`, aprendizado com previsões gravadas. `policy.ts` identifica a versão e políticas centrais. A interface apresenta resultados e altera preferências; o serviço recomputa o plano antes de persistir.

## 2. Dinheiro, dados e calendário

Valores persistidos são **centavos inteiros**. Percentuais são pontos-base: 2.500 representa 25%. Estatísticas intermediárias podem ser fracionárias; resultados monetários são arredondados para centavos. A divisão do orçamento usa `BigInt` para conservar centavos e desempatar restos deterministicamente.

Entram no treinamento somente lançamentos confirmados. Transferências e saldos iniciais não são receitas/despesas. Entram, porém, no saldo patrimonial. Contas excluídas dos gastos saem da visão consolidada de gastos/planejamento; a seleção explícita de uma conta é respeitada. O patrimônio usa seu próprio escopo.

O corte de treinamento é o início do mês atual. A janela máxima é de 36 meses anteriores. O primeiro mês observado é excluído por poder estar incompleto. Um mês sem qualquer movimento financeiro confirmado no escopo é uma **possível lacuna**, não uma observação comprovada de zero. Usamos o trecho contínuo posterior à última lacuna. Dentro de um mês com atividade, categoria sem gasto recebe zero.

Essa política evita diluir uma importação incompleta, mas limita contas pouco movimentadas. Não é possível distinguir inatividade real e dados ausentes sem informação adicional do usuário. Os gastos realizados continuam visíveis; o recorte limita somente o treinamento.

Se o último mês completo é agosto, prever setembro significa horizonte `h=1`; outubro, `h=2`. O planejamento feito em setembro usa outubro e, portanto, validação de dois passos. O mês em andamento não é tratado como completo para melhorar artificialmente a previsão.

## 3. Recorrências e prevenção de duplicação

O calendário é determinístico: semanal avança sete dias; mensal/anual preserva o dia original, limitado ao último dia do mês. Data final e número de parcelas encerram a projeção. O identificador da recorrência e a data original da ocorrência identificam o vínculo mesmo que a data efetiva do lançamento seja editada.

Uma ocorrência já registrada substitui o agendamento. Um lançamento importado com mesma identificação e data também pode substituí-lo quando há exatamente um candidato e uma recorrência correspondente. Casos ambíguos não são fundidos.

Para reconciliar histórico anterior ao cadastro, exigimos três meses completos consecutivos com um pagamento compatível em cada mês, mesma conta/categoria/sinal, descrição normalizada compatível ou descrição genérica de importação, diferença de valor de até 15% e de dia de até dez dias. Em meses antigos, um candidato único pode ter valor diferente. São **heurísticas de associação**, documentadas como tal, e não probabilidades estatísticas. A inferência não altera os vínculos persistidos.

- **Exata:** valor futuro = valor cadastrado; não exige histórico para representar o compromisso. É exato sob a condição de a regra cadastrada continuar correta, não uma garantia de recebimento/pagamento.
- **Aproximada:** com menos de três ocorrências validadas, conserva o valor cadastrado e não inventa uma faixa. Com três ou mais, usa o motor compartilhado sobre os valores confirmados das ocorrências anteriores ao corte. Pendências e valores futuros não treinam a estimativa.
- **Horizonte da aproximada:** mede distância desde a última ocorrência validada, em meses, anos ou semanas conforme a regra. Lacunas de ocorrências limitam a confiabilidade. Só séries mensais consecutivas contribuem com erros para um cenário conjunto mensal; erros semanais não são tratados como erros mensais.

O valor previsto de uma aproximada não edita a regra nem confirma um lançamento. O realizado continua dependendo da validação explícita. No planejamento, aproximadas são provisões reservadas, sujeitas a revisão.

## 4. Padrões detectados sem recorrência cadastrada

Um possível padrão mensal exige ao menos três meses consecutivos terminando no último mês completo, um lançamento por mês, mesma conta/categoria/sinal/descrição normalizada, coeficiente de variação dos valores até 12% e amplitude de dias até seis. Uma regra cadastrada equivalente tem precedência.

O valor futuro é estimado pelo mesmo motor de séries. Um registro existente, inclusive pendente, substitui a hipótese naquele mês. Nenhum lançamento é criado por essa detecção. A possibilidade de o hábito cessar não é eliminada; com histórico curto, a incerteza fica sem faixa numérica. Os limiares acima são critérios de produto, não resultados universais de um artigo.

## 5. Previsão da parte variável

Por categoria e sinal, removemos do treinamento recorrências reconciliadas e padrões mensais detectados. Isso impede que salário, aluguel ou parcelas sejam somados novamente à sua própria média.

Antes de extrapolar, exigimos gasto em pelo menos dois dos últimos três meses, ou três dos últimos seis. A alternativa anual exige dois ciclos observados e seleção do modelo sazonal. Sem suporte, a parcela variável não é extrapolada; a interface indica ausência de padrão. **Isso não significa probabilidade de gasto zero.** Compromissos conhecidos continuam entrando.

### 5.1 Modelos candidatos

Considere `y_t` como o total variável do período, em centavos.

| Modelo | Fórmula implementada | Motivação |
|---|---|---|
| Histórico ponderado | `Σ(i·y_i) / Σi`, nos últimos até 12 pontos | Referência simples com mais peso recente |
| Nível recente | `mediana(y[T−2:T])` | Mudanças persistentes de patamar |
| Tendência robusta amortecida | `max(0, ℓ + b·Σ(phi^j, j=1..h))` | Crescimento/queda que não se estende linearmente sem limite |
| Repetição anual | Observação do mesmo mês no último ciclo | Padrões anuais, quando dois ciclos sustentam a hipótese |
| Ocorrência × valor | `p_T · z_T` | Séries com muitos zeros e gastos quando ocorre um evento |

A tendência usa `b = mediana((y_j−y_i)/(j−i))` sobre todos os pares dos últimos até 12 pontos; intercepto = mediana de `y_i−b·i`. É uma reta robusta de Theil–Sen [R1]. O amortecimento usa `phi=0,85`, inspirado na família de tendências amortecidas [R2]. **Não implementamos Holt completo nem estimamos phi por máxima verossimilhança.** Essa combinação e seu parâmetro são escolhas explícitas do Lume, sujeitas à seleção temporal. Foi removido o teto arbitrário de ±60% do nível.

Nos candidatos não sazonais regulares, um pico isolado pode ser substituído apenas na cópia de treinamento: pelo menos cinco pontos, 60% positivos, mediana positiva, valor acima de `mediana + max(4·MAD, 1,5·mediana)` e vizinhos menores que metade do pico. O substituto é o maior entre mediana global e mediana dos vizinhos. `MAD` é a mediana dos desvios absolutos. Os registros e os alvos dos testes **não** são alterados. Isso protege o padrão contra um evento excepcional; também pode subestimar riscos extremos. Os limiares são heurísticos, não um teste formal de anomalia.

### 5.2 Intermitência e probabilidade

Com pelo menos seis meses e menos de 60% positivos, comparamos a referência ponderada a uma decomposição TSB [R3]. Para indicador `I_t = 1` quando há gasto:

`p_t = p[t−1] + beta·(I_t − p[t−1])`

`z_t = z[t−1] + alpha·(y_t − z[t−1])`, somente quando `I_t=1`.

Usamos `alpha=beta=0,2`. O primeiro gasto inicializa o tamanho; a probabilidade é atualizada também nos zeros. Assim, vários meses sem gasto reduzem a expectativa em vez de eternizarem uma compra antiga. O ponto é `p_T·z_T`; `z_T` representa valor condicionado à ocorrência. A seleção intermitente usa erro quadrático, apropriado ao objetivo de valor médio, enquanto os candidatos regulares usam erro absoluto para um nível típico mais robusto.

O artigo TSB trata demanda de estoque. Sua estrutura probabilística é adaptada a gastos intermitentes, **sem assumir que a validação naquele domínio prova acurácia financeira pessoal**. A probabilidade modelada não é calibrada empiricamente como chance garantida de uma compra. O filtro de suporte da seção 5 permanece obrigatório.

## 6. Seleção, erros e incerteza

A referência inicial é o histórico ponderado. Um candidato substitui a referência somente com pelo menos três testes e redução de perda superior a 10%. Até 12 origens temporais recentes são avaliadas no **horizonte solicitado** [R4]. A escolha da família considera apenas o prefixo disponível; a sazonalidade não pode ser habilitada retroativamente em uma origem que ainda não viu dois ciclos.

Há duas camadas: seleção dos candidatos dentro do prefixo e avaliação externa que refaz essa seleção em cada origem. O erro publicado é `e = realizado − previsão externa`. Não é o erro retrospectivo do vencedor escolhido depois de conhecer toda a série. Por isso o erro honesto pode ser maior que o número mostrado pela implementação antiga.

Métricas [R5]: `MAE = média(|e|)` em centavos; `WAPE = Σ|e| / Σrealizado`, indisponível se o denominador for zero; `MASE = MAE / média(|y_t−y[t−1]|)`, indisponível quando a escala é zero. MASE é diagnóstico, não objetivo de seleção. Os erros apresentados avaliam a parte variável ou os valores das ocorrências; não são um backtest histórico integral da inferência de vínculos e das regras cadastradas hoje.

Com ao menos oito erros comparáveis, criamos cenários `max(piso conhecido, previsão + e_i)` e usamos quantis empíricos 10%/90%, alargando a faixa quando necessário para conter o ponto central. Com menos evidência, `low/high = null`. Não há multiplicador fixo de 8%, 12%, 25% nem crescimento arbitrário por raiz do horizonte. Oito pontos é uma exigência mínima de produto, não uma garantia estatística. A distribuição empírica e os cuidados com intervalos são motivados por [R6]; não alegamos cobertura calibrada de 80%.

Totais: o ponto central é a soma das categorias. Para a faixa conjunta, os cenários são alinhados pelo mês observado **antes da soma**, preservando co-movimento; não somamos quantis individuais nem assumimos independência. Se faltam oito meses comuns, a faixa conjunta fica indisponível. Essa coerência segue a ideia de agregação das séries de base [R7], sem implementar MinT. Uma categoria pode ter um quantil individual alto em um mês diferente do pico de outra; os extremos individuais não são parcelas aditivas de um mesmo quantil total.

Os rótulos de qualidade também são critérios explícitos: “Sem base” quando não há histórico mínimo nem valores conhecidos; “Sem padrão” quando houve gasto variável sem repetição suficiente e sem outras componentes; “Base curta” com menos de quatro meses; “Volátil” quando o MAE supera metade do ponto variável. “Consistente” não é certificação de baixo risco. O aviso de mudança de patamar exige três valores recentes próximos de sua mediana (±20%), três a seis anteriores igualmente estáveis e diferença maior que 30% ou R$10; só é ativado quando o modelo recente foi selecionado. Ele não força a escolha do modelo.

## 7. Composição do fluxo e tratamento de conhecimento novo

Para uma categoria:

`previsão = recorrências conhecidas/provisionadas + padrões detectados + max(variável já registrada, variável estimada)`.

Cada lançamento pertence a uma única componente na composição. O total confirmado já registrado é preservado; uma estimativa não pode apagar uma compra real. Pendências aparecem como provisões, não como realizado confirmado. Parcelas encerradas não continuam como gastos futuros. Não limitamos a previsão de despesas pela renda: um déficit pode ser real. A restrição de renda pertence ao **orçamento**, não à previsão.

Conhecimento do usuário (regra e término) e observações (validação/importação) têm precedência sobre padrões inferidos. A tela diferencia previsão de gasto de limite planejado para que uma mudança de percentual reservado não seja confundida com mudança de comportamento.

## 8. Planejamento do próximo mês

Mês fixo = mês atual + 1, também validado no serviço. Entrada `R` vem de `CashflowForecast`, com opção de valor manual. Para meta `s` em pontos-base:

`S = round(R·s/10000)`; `B = R−S`.

Para categoria `c`, `P_c` é sua previsão (incluindo os compromissos conhecidos) e `r_c` é o percentual escolhido no slider, entre 0 e 100%, armazenado em pontos-base. A reserva solicitada é `Q_c = round(P_c · r_c / 10000)`. Exemplo: previsão de R$ 1.000 e slider em 50% solicitam R$ 500. O percentual não é uma fatia da renda nem um peso normalizado. Por padrão, solicitamos 100% da previsão. Sem previsão, a reserva solicitada é zero; não inventamos uma base média para categorias adicionadas manualmente.

Compromissos `F_c` são pisos preservados, mesmo com o slider em zero. Compromissos de categorias removidas (`O`) também consomem orçamento. A parte flexível solicitada é `D_c = max(0, Q_c − F_c)`, e o orçamento flexível disponível é `A = max(0, B − O − ΣF_c)`.

Se `ΣD_c ≤ A`, reservamos `a_c = F_c + D_c`; o saldo excedente fica não reservado, além da meta de sobra. Se `ΣD_c > A`, distribuímos apenas `A` proporcionalmente a `D_c`, preservando os pisos: `a_c = F_c + A·D_c/ΣD_c`. A divisão inteira usa maiores restos, com desempate estável pela ordem das categorias, para conservar cada centavo. Categorias com zero de parcela flexível não recebem centavos extras. Valores monetários permanecem inteiros; percentuais usam pontos-base, e produtos/divisões proporcionais usam `BigInt`.

A tela exibe a reserva solicitada em reais junto ao slider e o limite efetivamente planejado. Quando o orçamento exige redução, mostra **Ajustado ao orçamento**; quando o compromisso supera a solicitação, **Mínimo comprometido**. Aumentar uma solicitação num orçamento já preenchido reduz proporcionalmente as parcelas flexíveis de outras categorias. Reduzir uma solicitação libera margem, sem inflar outras acima do que foi solicitado.

Se os compromissos excedem `B`, preservamos os valores e exibimos o déficit. Se o padrão esperado excede `B`, informamos a redução de comportamento necessária. Comprometimento ≥90% gera alerta de pouca margem. Esta distribuição é uma regra explícita de planejamento pessoal, não uma estimativa probabilística nem uma otimização financeira derivada dos artigos.

Alterar meta, percentuais, categorias ou dados recalcula a prévia automaticamente. A base estatística é reutilizada durante o movimento do slider; os controles não alteram a previsão. **Salvar planejamento** registra a versão para posterior comparação; recálculo não significa gravação silenciosa. Resultados ficam em outra tela.

Compatibilidade: planos antigos com prioridades são apresentados para revisão com reserva de 100%, sem alterar o registro salvo até a confirmação por **Salvar planejamento**. Planos encerrados e suas versões originais continuam imutáveis. Ao migrar uma categoria para outra em um plano aberto, somamos suas reservas e bases; o percentual combinado é a razão entre esses totais, arredondada para um ponto-base.

## 9. Fechamento e aprendizado de previsões

Ao abrir ou atualizar o app após a virada, o SQLite recebe o plano preservado e os resultados do mês. Meses nunca planejados não ganham planos retrospectivos. Validações/correções posteriores geram revisão do resultado, sem reescrever o plano original. Pendências tornam o resultado provisório.

Realizado = receitas/despesas confirmadas do mês e das contas capturadas. Sobra realizada = receita − despesa. A meta alcançada compara essa sobra a `receita real · s`; uma renda menor não conserva artificialmente a meta absoluta antiga. O detalhe mantém também a meta original em reais. Despesas fora das categorias planejadas aparecem separadamente e contam no total.

O plano grava uma **previsão independente dos limites**: versão, corte, horizonte, assinatura das recorrências, entradas e previsões por categoria antes da correção de viés. Foi removido o ajuste antigo 70% previsão + 30% realizado e a multiplicação por realizado/limite. Limites pequenos escolhidos pelo usuário não são evidência de aumento futuro de despesa.

Para aprender, exigimos mesmo escopo, versão, horizonte e assinatura de recorrências; plano salvo antes do mês-alvo; resultado anterior ao corte e sem pendências. Usamos até 12 erros `realizado − previsão original`. Com pelo menos seis, as três primeiras observações inicializam uma correção mediana; as seguintes testam se corrigir reduz MAE em mais de 10%. Só então a mediana dos erros pode ajustar a parte variável, respeitando pisos. Isso aplica validação temporal [R4] a uma correção conservadora de viés, sem transformar erro de orçamento em tendência.

O ajuste não é aplicado a uma componente variável sem suporte. Reclassificar categorias invalida a evidência de previsão do plano aberto migrado, evitando aprendizado com alvos incompatíveis. Planos antigos sem metadados seguem consultáveis, mas não são tratados como previsões honestas. Ainda é necessário acumular fechamentos dessa versão para habilitar esse aprendizado nos dados reais.

## 10. Comportamento e patrimônio

Comparação de gastos correntes usa o mesmo dia de corte no mês anterior. Comparação de comportamento usa os últimos três meses completos contra os três anteriores. Sem seis meses, não afirma comparação trimestral.

Para frequência média `n` e ticket `v`, gasto médio = `n·v`. A variação é decomposta exatamente em `(n_novo−n_antigo)·v_antigo` e `n_novo·(v_novo−v_antigo)`. É uma identidade descritiva, não uma explicação causal. Contribuições por descrição somam diferenças dos trimestres divididas por três. Arredondamentos monetários de exibição podem produzir diferença de um centavo entre parcelas arredondadas.

“Ritmo do mês” divide o gasto até hoje pela mediana da fração registrada até esse dia nos últimos até seis meses. Exige ao menos três meses positivos, dia ≥7 e fração entre 15% e 95%. É cenário condicional ao calendário habitual, não probabilidade de fechamento; não é somado à previsão. Finais de semana exigem dez registros para exibir a participação descritiva. Alertas de aumento/redução no mês exigem variação de pelo menos 15% e R$100; destaques de trimestres exigem R$100 de diferença média. São filtros de relevância visual, não testes de significância. Alertas de compra atípica usam mediana por transação e limiar de `max(R$100, 2,5·mediana)` com cinco observações anteriores; não diagnosticam causa.

Patrimônio histórico = soma dos saldos confirmados das contas até cada data. Ativos são saldos positivos; passivos são magnitudes dos negativos. A projeção parte do saldo atual, soma entradas futuras e subtrai saídas futuras, descontando o que já foi realizado no mês atual. Transferências/ajustes futuros registrados entram conforme o escopo. Não há rentabilidade, inflação ou valorização de ativos presumidas.

Para a faixa patrimonial acumulada, cenários de receitas e despesas são alinhados por **origem da previsão**, em todos os meses da trajetória. Isso evita somar limites marginais incompatíveis. Sem evidência conjunta suficiente, a trajetória central continua e a faixa fica ausente.

## 11. Evidência, limitações e reprodução

- `npm test`: invariantes de centavos, seleção sem informação futura, horizontes, recorrências, períodos, escopo, aprendizado e agregação com correlação negativa.
- `npm run test:e2e`: Electron com banco temporário; fluxos anteriores e novo planejamento, persistência, filtros e telas responsivas.
- `node scripts/forecast-benchmark.mjs`: gera [resultados reproduzíveis](forecast-benchmark.json) para seis cenários sintéticos e horizontes 1/2/6. Não usa dados pessoais.

O benchmark compara MAE com último valor e média histórica. No cenário de tendência, o motor teve MAE 342 centavos a dois passos, contra 1.600 do último valor; no cenário de mudança de nível a seis passos, teve 2.359 contra zero do último valor. Ou seja: **não vence sempre**. Essas simulações demonstram mecanismos e limitações, não acurácia garantida em dados reais. Um evento excepcional ainda imprevisível deve continuar aparecendo como erro.

Limites conhecidos: poucos dados; hipóteses de estabilidade dos resíduos; inferência de recorrências não causal; padrões detectados podem cessar; regras antigas não possuem histórico completo de todas as edições; extratos podem estar incompletos. Simulações do motor de séries não validam automaticamente a reconciliação integral de transações. O Lume não estima uma probabilidade confiável de cumprir a meta de sobra; por isso não exibe uma porcentagem fictícia de “chance de sucesso”.

## 12. Referências indexadas

- **[R1] Sen, P. K. (1968).** *Estimates of the Regression Coefficient Based on Kendall’s Tau.* JASA 63(324), 1379–1389. [DOI](https://doi.org/10.1080/01621459.1968.10480934). Fundamenta inclinação mediana robusta; não define os filtros heurísticos do Lume.
- **[R2] Gardner, E. S.; McKenzie, E. (1985).** *Forecasting Trends in Time Series.* Management Science 31(10), 1237–1246. [Artigo e resumo do editor](https://pubsonline.informs.org/doi/10.1287/mnsc.31.10.1237). Fundamenta o amortecimento de tendências; não valida phi=0,85 neste app. Complemento: [FPP3 — métodos com tendência](https://otexts.com/fpp3/holt.html).
- **[R3] Teunter, R. H.; Syntetos, A. A.; Babai, M. Z. (2011).** *Intermittent demand: Linking forecasting to inventory obsolescence.* EJOR 214(3), 606–615. DOI 10.1016/j.ejor.2011.05.018. [Versão publicada no repositório da universidade](https://pure.rug.nl/ws/portalfiles/portal/145394864/Intermittent_demand_Linking_forecasting_to_inventory_obsolescence.pdf). Fundamenta atualizar a ocorrência também em períodos sem demanda; aplicação financeira aqui é uma adaptação.
- **[R4] Hyndman, R. J.; Athanasopoulos, G.** *Forecasting: Principles and Practice*, 3ª ed., §5.10. [Validação temporal](https://otexts.com/fpp3/tscv.html). Fundamenta origens móveis e avaliação em múltiplos horizontes.
- **[R5] Hyndman, R. J.; Koehler, A. B. (2006).** *Another look at measures of forecast accuracy.* IJF 22(4), 679–688. DOI 10.1016/j.ijforecast.2006.03.001. [Manuscrito dos autores](https://robjhyndman.com/papers/mase.pdf). Fundamenta avaliação de erros e métricas escaladas; não prova desempenho deste motor.
- **[R6] Hyndman, R. J.; Athanasopoulos, G.** FPP3, §5.5. [Distribuições preditivas e intervalos](https://otexts.com/fpp3/prediction-intervals.html). Fundamenta distinguir ponto, distribuição e incerteza; os quantis empíricos locais não são intervalos paramétricos garantidos.
- **[R7] Hyndman, R. J.; Athanasopoulos, G.** FPP3, §11.3. [Reconciliação de previsões](https://otexts.com/fpp3/reconciliation.html). Fundamenta coerência dos totais; o Lume implementa agregação das séries de base, não MinT.
- **[R8] Shenstone, L.; Hyndman, R. J. (2005).** *Stochastic models underlying Croston’s method for intermittent demand forecasting.* Journal of Forecasting 24, 389–402. [Manuscrito dos autores](https://robjhyndman.com/papers/croston.pdf). Contexto para não atribuir intervalos probabilísticos automáticos a heurísticas intermitentes. Síntese dos autores em [FPP3 — séries de contagens](https://otexts.robjhyndman.com/fpp3/counts.html).

As políticas numéricas específicas estão identificadas no texto para distinguir literatura, identidade contábil e decisão de produto. Novos estimadores devem entrar pelo contrato compartilhado, com testes temporais e atualização desta documentação.
