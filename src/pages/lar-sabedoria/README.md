# Documentos manuais do Lar de Convivência da Sabedoria

Pasta no app: Administração → Documentos manuais (`/documentos-manuais`).
Exclusiva do CNPJ 52.502.750/0001-65, para administradores e gestores.

Antes do uso, aplicar `supabase_lar_documentos_manuais.sql` no banco Supabase.
A publicação do código no GitHub não executa essa migração automaticamente.

Sete tipos: escala, recibos de funcionários e pacientes, prontuários de
funcionários e pacientes, contratos de funcionários e pacientes.
Os contratos recebem o texto integral informado pelo usuário.

Os documentos são guardados em uma tabela separada, com segurança por empresa,
e podem ser pesquisados por nome, título, CPF e conteúdo, editados e impressos.
Na impressão, escolher Salvar como PDF para baixar uma cópia.
A pasta é uma área central do app, não uma pasta automática no computador.
Não são alterados cadastros, escalas, folhas ou pagamentos existentes.
