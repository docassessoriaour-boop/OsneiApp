# Taxa extra anual proporcional e inativação de pacientes

A taxa anual (13º dos pacientes, cláusula 2.3) usa metade do salário mínimo do ano como base, proporcional aos meses de permanência: **(salário mínimo ÷ 2) × meses ÷ 12**, arredondando somente o resultado para centavos. Cada mês civil conta uma vez, incluindo entrada e saída. Para pacientes ativos, a projeção vai até dezembro; entrada anterior ao ano conta a partir de janeiro. Cadastro legado sem entrada considera janeiro.

Exemplo com a referência cadastrada de 2026: entrada em setembro resulta em 4/12 de R$ 810,50 = **R$ 270,17**. O vencimento permanece em **15 de dezembro**. Não depende da mensalidade nem da quantidade de contratos.

## Ativação no Supabase

Publicar o frontend no GitHub não aplica alterações no banco. No SQL Editor do projeto correto, após a migração multiempresa, executar nesta ordem:

1. `supabase_paciente_inativacao.sql`: adiciona a data de saída, validações e cancelamento automático transacional.
2. `supabase_taxa_extra_anual.sql`: instala ou atualiza a proporção, corrige taxas anuais integralmente pendentes e configura a rotina diária às 06h de São Paulo. Requer `http` e `pg_cron`.

Ambos podem ser reaplicados. A atualização não altera cobranças recebidas, com pagamento parcial, com referência bancária, canceladas ou excluídas. Os valores antigos de taxas ainda integralmente pendentes são corrigidos na primeira execução, mantendo os mesmos IDs e a referência salarial original. Não executa alterações retroativas em pacientes já inativos sem data: abra o cadastro e informe a saída efetiva para cancelar os lançamentos posteriores.

## Inativação

Ao selecionar Inativo, informe a data de inativação/saída. O cadastro sugere o fim do último contrato caso já tenha vencido; caso contrário, sugere hoje. A data pode ser corrigida e deve estar entre a entrada e hoje.

Salvar cancela automaticamente faturas pendentes e respectivas contas a receber com vencimento **posterior** à saída, incluindo taxas anuais. Vencimentos no próprio dia ou anteriores permanecem. Pagamentos integrais e parciais, referências bancárias e registros de outras empresas são preservados. O cancelamento mantém o histórico e não apaga documentos.

As contas são identificadas pelo vínculo explícito entre paciente, fatura e receita, sempre na mesma empresa. Receitas avulsas sem fatura vinculada não são associadas pelo nome. O lote de contratos exclui pacientes inativos. Uma sessão antiga que tente emitir nova fatura posterior à saída terá a fatura e a receita pendente canceladas pelo banco. Reativar não restaura documentos cancelados nem duplica a taxa anual.

Contas a Receber mostra o status Cancelado e permite filtrar esses registros, que não entram no total do relatório. Edição e baixa de registros cancelados ficam indisponíveis nessa listagem.

## Rotina anual

- A consulta diária à série SGS 1619 do Banco Central aceita apenas valores do ano corrente e não envia dados de pacientes.
- Se a fonte estiver indisponível, somente um salário já confirmado para o mesmo ano permite continuar. Nunca reutiliza a referência de outro ano.
- Novos pacientes ativos entram após a admissão. A chave empresa/paciente/ano evita duplicidade mesmo após pagamento, exclusão ou cancelamento.
- Fatura, receita e registro anual são gravados na mesma transação. Administradores e gerentes podem disparar a verificação pelas telas financeiras; empresa e ano são definidos pelo servidor.
- Consultar `cron.job` e `cron.job_run_details` pelo nome `taxa-extra-anual-pacientes`. Referências em `public.annual_minimum_wages`; histórico em `private.annual_extra_fees`.

## Validação

`node tests/annual-extra-fee.test.mjs` executa PostgreSQL isolado com `@electric-sql/pglite`. Opcionalmente, `PGLITE_MODULE` indica o caminho da dependência fora do projeto. Cobre proporção e arredondamento, correção de pendentes, validação de saída, cancelamentos, pagamentos preservados, reativação, sessão antiga, isolamento de empresas, permissões, duplicidade, rollback, rotina diária e virada de ano. Não acessa dados reais.
