# Conciliação bancária: aplicações, resgates e extratos

## Ativação

Executar `supabase_conciliacao_transferencias.sql` no SQL Editor do Supabase. O arquivo é reaplicável e instala as funções atômicas de conciliação, identificação dos extratos, vínculo entre contas e atualização dos saldos. Publicar o frontend no GitHub não instala as funções no banco. Sem a atualização, o sistema informa que a administração precisa ativá-la, preservando os itens pendentes.

## Uso

1. Selecionar a conta do extrato na Conciliação Bancária.
2. Em **Conta correspondente**, escolher a conta de aplicação para um extrato da conta corrente, ou a conta corrente para o extrato da aplicação. O sistema sugere quando há uma única opção compatível do mesmo banco. **Salvar vínculo** mantém essa escolha nas próximas importações. Havendo várias contas, selecionar a correspondente antes de processar cada extrato.
3. Importar OFX ou CSV e clicar em **Processar lançamentos**. **Conciliar correspondências** processa somente transferências reconhecidas e baixas seguras; os demais itens continuam pendentes.
4. Conferir o resumo. O botão de vínculo em cada linha permite escolher explicitamente outra conta para uma transferência ou um lançamento financeiro compatível.

## Tratamento automático

- Aplicação, incluindo a descrição **Aplicação RDB**: débito na conta corrente e crédito na conta de investimento/poupança. Resgate, incluindo **Resgate RDB**: débito na aplicação e crédito na conta corrente. O sentido informado pelo extrato é preservado. Descrições de aplicação e resgate com sentido incompatível ou estorno ficam para revisão.
- As duas pernas são registradas na mesma transação do banco. Não criam receitas ou despesas. Não se deve selecionar uma categoria operacional para aplicações e resgates.
- Ao importar o extrato da outra conta, o sistema identifica a perna já criada e acrescenta os dados do extrato, sem somar novamente ao saldo. Usa a mesma data ou, se houver apenas uma contrapartida compatível, diferença de até três dias corridos. Casos ambíguos precisam de revisão.
- Transferências manuais antigas com duas pernas identificadas e sem vínculo com receitas/despesas também podem ser reconhecidas sem duplicar os saldos. Movimentos antigos já vinculados ao financeiro exigem revisão; o sistema não exclui receitas/despesas históricas automaticamente.
- Rendimentos, juros, IOF, IRRF, impostos e tarifas são movimentos financeiros separados. O sistema não deduz principal ou tributos a partir de um resgate líquido: valores diferentes entre as duas contas precisam de conferência.
- Baixas automáticas exigem valor em centavos, conta compatível, data até sete dias da data financeira e palavra identificadora na descrição, além de candidato único. Palavras genéricas como pagamento, boleto e mensalidade não bastam. Um lançamento não pode ser usado duas vezes no lote. Pendências do mesmo valor fora desse intervalo continuam para revisão, evitando criar uma cobrança duplicada.
- Pagamentos/recebimentos já registrados com movimentação manual correspondente podem ser conciliados reutilizando a mesma movimentação, preservando o saldo. Não se baixa pagamento parcial automaticamente.
- Sem correspondência financeira, **Processar lançamentos** cria uma conta a pagar paga ou uma conta a receber recebida. Se houver possibilidade de correspondência, deixa a decisão para revisão. Faturas vinculadas a receitas conciliadas recebem status, conta e data de pagamento.
- A categoria é sugerida pelo histórico somente quando a descrição normalizada e o sentido coincidem e não há categorias divergentes no histórico.

## Importação e duplicidade

OFX usa o FITID do banco, limitado à conta e à empresa. Lançamentos com FITIDs diferentes são preservados mesmo que data, texto e valor coincidam. Reimportações mantêm os saldos e lançamentos existentes. Um mesmo FITID com valor, data ou sentido alterados exige revisão.

CSV aceita cabeçalho, datas brasileiras/ISO, centavos com vírgula ou ponto, campos entre aspas, delimitadores ponto e vírgula, vírgula ou tabulação e indicação de débito/crédito. Também aceita crédito e débito em colunas separadas. Arquivos UTF-8 e Windows-1252 são lidos. Datas impossíveis e valores inválidos não são lançados, e o resumo informa os descartes.

Sem identificador bancário, o CSV usa data, sentido, valor, descrição e número de ocorrência de cada repetição. Importar o mesmo arquivo/período é idempotente; recortes diferentes contendo movimentos inteiramente idênticos devem ser conferidos. Preferir OFX para identificação mais precisa. A importação mantém a conta original de cada arquivo, mesmo ao alternar a seleção de conta na tela.

Falhas interrompem o lote e preservam os itens concluídos; os restantes ficam pendentes. Transferências já conciliadas são excluídas pelas duas pernas em uma única operação, com reversão dos saldos. A correção de valor/data exige excluir o par e reimportar o movimento correto.

## Verificação

`tests/bank-reconciliation.test.mjs` usa PostgreSQL isolado (PGlite) e dados fictícios. Cobre leitura OFX/CSV, direção de aplicações e resgates, transferências nos dois sentidos, contrapartidas em datas diferentes, saldos, reimportação, FITIDs distintos, rollback, baixas, pagamentos manuais, adoção de transferências antigas e isolamento entre empresas.

Com Node 24 e `@electric-sql/pglite` disponível: `node tests/bank-reconciliation.test.mjs`. Não usa o banco real.
