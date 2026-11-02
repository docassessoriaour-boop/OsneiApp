# Taxa extra anual de pacientes — cláusula 2.3

Uma fatura e uma conta a receber são geradas para cada paciente ativo, na empresa correspondente, com vencimento em **15 de dezembro do ano corrente**. O valor corresponde a metade do salário mínimo nacional daquele ano. Não depende do valor da mensalidade nem da quantidade de contratos do paciente.

Em 2026, o salário mínimo é R$ 1.621,00 e a taxa é **R$ 810,50**, conforme o [Decreto 12.797/2025](https://www2.camara.leg.br/legin/fed/decret/2025/decreto-12797-23-dezembro-2025-798569-publicacaooriginal-177587-pe.html).

## Ativação no banco

Executar `supabase_taxa_extra_anual.sql` no SQL Editor do projeto Supabase após a migração multiempresa. Requer as extensões oficiais `http` e `pg_cron`. O arquivo instala a rotina diária às 06:00 de São Paulo e gera os lançamentos do ano atual imediatamente. Publicar somente o frontend não instala a rotina no banco.

O início do arquivo instala a estrutura e a função usada pelas telas. A seção de agendamento fica em uma transação separada para que uma falha na habilitação das extensões possa ser corrigida sem perder a estrutura. Reaplicar o arquivo é seguro.

## Funcionamento

- A rotina diária consulta a série **SGS 1619** do Banco Central e aceita apenas observações do ano corrente, sem datas futuras. Não envia dados de pacientes ao BCB.
- Se a fonte estiver indisponível, somente um salário mínimo já confirmado para o mesmo ano permite gerar cobranças. Sem esse valor, o job falha e tenta novamente no dia seguinte; nunca reaproveita o salário de outro ano.
- A geração começa assim que o salário mínimo do ano está disponível. Novos pacientes ativos entram na próxima execução, inclusive após 15/12, sempre com o vencimento anual solicitado. Admissões futuras não são cobradas antes da entrada.
- Faturamento e Contas a Receber também verificam automaticamente os lançamentos ao abrir, antes de carregar a listagem. As telas mostram a base de cálculo e o vencimento, ou um aviso em caso de falha.
- A chave empresa/paciente/ano impede duplicidades, inclusive em acessos simultâneos. Fatura, receita e registro anual são criados na mesma transação. Pagamento, cancelamento ou exclusão não geram uma nova cobrança automática.
- O registro anual preserva o valor utilizado. Atualizações futuras da fonte não alteram faturas já emitidas. A rotina não cancela taxas já emitidas se o paciente ficar inativo posteriormente.
- A função pública deriva empresa e ano da sessão e aceita apenas administradores e gerentes. O agendamento opera no servidor, inclusive com o aplicativo fechado.

## Verificação

Consultar `cron.job` pelo nome `taxa-extra-anual-pacientes` e `cron.job_run_details` para confirmar execuções. O histórico e os valores de referência ficam em `private.annual_extra_fees` e `public.annual_minimum_wages`, acessíveis administrativamente.

Teste isolado em PostgreSQL: instalar `@electric-sql/pglite` sem salvar nas dependências e executar `node tests/annual-extra-fee.test.mjs`. A suíte usa dados fictícios e cobre mudança de ano, fonte indisponível, atomicidade, duplicidade, permissões e separação entre empresas. Não acessa o banco real.
