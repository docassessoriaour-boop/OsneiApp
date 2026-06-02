-- Migration: 20260409003723_create_company_settings_table
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT 'Nome da Empresa',
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir registro padrão se não existir
INSERT INTO company_settings (name)
SELECT 'Minha Empresa'
WHERE NOT EXISTS (SELECT 1 FROM company_settings LIMIT 1);



-- Migration: 20260409004917_update_patients_table_fields
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS resp_rg TEXT,
ADD COLUMN IF NOT EXISTS resp_cpf TEXT,
ADD COLUMN IF NOT EXISTS resp_endereco TEXT,
ADD COLUMN IF NOT EXISTS resp_cidade TEXT,
ADD COLUMN IF NOT EXISTS resp_uf TEXT,
ADD COLUMN IF NOT EXISTS resp_cep TEXT,
ADD COLUMN IF NOT EXISTS resp_email TEXT;



-- Migration: 20260409005126_add_rg_to_patients_table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS rg TEXT;



-- Migration: 20260409005528_create_invoices_table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_document TEXT, -- CPF/CNPJ
  date_issued DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  total_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pendente', -- pendente, pago, cancelado
  items JSONB DEFAULT '[]', -- Array of { description, quantity, price }
  income_id UUID REFERENCES incomes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar coluna invoice_id em incomes para referência cruzada
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS invoice_id UUID;



-- Migration: 20260409012722_add_employee_fields
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS tem_vt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS vt_valor NUMERIC DEFAULT 30.00,
ADD COLUMN IF NOT EXISTS tem_insalubridade BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS insalubridade_percentual NUMERIC DEFAULT 10.0;



-- Migration: 20260409170028_create_schedule_exceptions_table
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_working BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);


-- Migration: 20260409170430_add_unidade_to_employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT 'Vila Moraes';


-- Migration: 20260409172258_add_unidade_to_patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT 'Vila Moraes';


-- Migration: 20260409172819_add_turno_to_employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS turno TEXT DEFAULT 'Diurno';


-- Migration: 20260409193041_finance_system_expansion
-- Tabela de Contas Bancárias
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  banco TEXT,
  tipo TEXT, -- 'corrente', 'poupanca', 'investimento', 'caixa'
  saldo_inicial NUMERIC DEFAULT 0,
  saldo_atual NUMERIC DEFAULT 0,
  cor_identificacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Categorias Financeiras
CREATE TABLE IF NOT EXISTS transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'receita', 'despesa'
  cor TEXT,
  icone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Faturas (Invoices) - Caso não exista
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  income_id UUID REFERENCES incomes(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_document TEXT,
  date_issued DATE DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  total_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pendente',
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Informações da Empresa / Clínica
CREATE TABLE IF NOT EXISTS company_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT UNIQUE,
  endereco TEXT,
  telefone TEXT,
  email TEXT,
  website TEXT,
  logotipo_url TEXT,
  configuracoes_adicionais JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir algumas categorias padrão se a tabela estiver vazia
INSERT INTO transaction_categories (nome, tipo)
SELECT * FROM (VALUES 
  ('Mensalidades', 'receita'),
  ('Serviços Extras', 'receita'),
  ('Doações', 'receita'),
  ('Salários', 'despesa'),
  ('Aluguel', 'despesa'),
  ('Energia Elétrica', 'despesa'),
  ('Água e Esgoto', 'despesa'),
  ('Internet/Telefone', 'despesa'),
  ('Manutenção', 'despesa'),
  ('Medicamentos', 'despesa'),
  ('Alimentos', 'despesa'),
  ('Impostos', 'despesa'),
  ('Marketing', 'despesa'),
  ('Outros', 'despesa')
) AS t(nome, tipo)
WHERE NOT EXISTS (SELECT 1 FROM transaction_categories);

-- Alterar tabelas existentes para vincular a bancos e categorias
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES transaction_categories(id);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES transaction_categories(id);
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES transaction_categories(id);



-- Migration: 20260411103500_financial_system_setup
-- Banks Table
CREATE TABLE IF NOT EXISTS banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    account_number TEXT,
    initial_balance DECIMAL(15, 2) DEFAULT 0,
    current_balance DECIMAL(15, 2) DEFAULT 0,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('income', 'expense')) NOT NULL,
    color TEXT DEFAULT '#94a3b8',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Entities (Customers and Suppliers)
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('customer', 'supplier')) NOT NULL,
    document TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions (Payable and Receivable)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    type TEXT CHECK (type IN ('payable', 'receivable')) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    payment_date DATE,
    status TEXT CHECK (status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    bank_id UUID REFERENCES banks(id) ON DELETE SET NULL,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    installment_number INTEGER DEFAULT 1,
    total_installments INTEGER DEFAULT 1,
    parent_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    ofx_transaction_id TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Simple Policies (assuming public for bypass in this demo or the user will manage auth later)
CREATE POLICY "Public Read Access" ON banks FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON banks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read Access" ON categories FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read Access" ON entities FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON entities FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read Access" ON transactions FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON transactions FOR UPDATE USING (true);



-- Migration: 20260411104747_add_invoicing_system
-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number SERIAL,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    issue_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount DECIMAL(15, 2) DEFAULT 0,
    status TEXT CHECK (status IN ('draft', 'billed', 'cancelled')) DEFAULT 'draft',
    observations TEXT,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(15, 2) DEFAULT 1,
    unit_price DECIMAL(15, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies for Invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Access" ON invoices FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON invoices FOR UPDATE USING (true);

CREATE POLICY "Public Read Access" ON invoice_items FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON invoice_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON invoice_items FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON invoice_items FOR DELETE USING (true);



-- Migration: 20260411105301_rename_finance_invoicing_tables
-- Drop the ones I might have partially created or that conflict
DROP TABLE IF EXISTS fin_invoice_items;
DROP TABLE IF EXISTS fin_invoices;

-- Finance Invoices Table
CREATE TABLE fin_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number SERIAL,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    issue_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount DECIMAL(15, 2) DEFAULT 0,
    status TEXT CHECK (status IN ('draft', 'billed', 'cancelled')) DEFAULT 'draft',
    observations TEXT,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Finance Invoice Items Table
CREATE TABLE fin_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES fin_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(15, 2) DEFAULT 1,
    unit_price DECIMAL(15, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE fin_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Access" ON fin_invoices FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON fin_invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON fin_invoices FOR UPDATE USING (true);

CREATE POLICY "Public Read Access" ON fin_invoice_items FOR SELECT USING (true);
CREATE POLICY "Public Write Access" ON fin_invoice_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON fin_invoice_items FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON fin_invoice_items FOR DELETE USING (true);



-- Migration: 20260411105631_add_category_to_invoices
ALTER TABLE fin_invoices ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;



-- Migration: 20260411123623_update_bank_balances_trigger
-- Function to update bank balance
CREATE OR REPLACE FUNCTION update_bank_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.status = 'paid' AND NEW.bank_id IS NOT NULL) THEN
            IF (NEW.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance + NEW.amount WHERE id = NEW.bank_id;
            ELSIF (NEW.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance - NEW.amount WHERE id = NEW.bank_id;
            END IF;
        END IF;
    
    -- Handle UPDATE
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Case 1: Status changed from pending to paid
        IF (OLD.status = 'pending' AND NEW.status = 'paid' AND NEW.bank_id IS NOT NULL) THEN
            IF (NEW.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance + NEW.amount WHERE id = NEW.bank_id;
            ELSIF (NEW.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance - NEW.amount WHERE id = NEW.bank_id;
            END IF;
        
        -- Case 2: Status changed from paid to pending (reversal)
        ELSIF (OLD.status = 'paid' AND NEW.status = 'pending' AND OLD.bank_id IS NOT NULL) THEN
            IF (OLD.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance - OLD.amount WHERE id = OLD.bank_id;
            ELSIF (OLD.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance + OLD.amount WHERE id = OLD.bank_id;
            END IF;
            
        -- Case 3: Amount changed on a paid transaction
        ELSIF (OLD.status = 'paid' AND NEW.status = 'paid' AND OLD.amount <> NEW.amount AND NEW.bank_id IS NOT NULL) THEN
            IF (NEW.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance - OLD.amount + NEW.amount WHERE id = NEW.bank_id;
            ELSIF (NEW.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance + OLD.amount - NEW.amount WHERE id = NEW.bank_id;
            END IF;
        END IF;

    -- Handle DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.status = 'paid' AND OLD.bank_id IS NOT NULL) THEN
            IF (OLD.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance - OLD.amount WHERE id = OLD.bank_id;
            ELSIF (OLD.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance + OLD.amount WHERE id = OLD.bank_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for transactions
DROP TRIGGER IF EXISTS tr_update_bank_balance ON public.transactions;
CREATE TRIGGER tr_update_bank_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION update_bank_balance();



-- Migration: 20260411125735_generate_contracts_and_invoices_fix
-- 1. Ensure all patients exist as entities (customers)
INSERT INTO public.entities (name, type, document, email, phone)
SELECT 
    p.nome, 
    'customer', 
    COALESCE(p.resp_cpf, ''), 
    COALESCE(p.resp_email, ''), 
    COALESCE(p."telefoneResponsavel", '')
FROM public.patients p
LEFT JOIN public.entities e ON p.nome = e.name AND e.type = 'customer'
WHERE e.id IS NULL;

-- 2. Create missing contracts for active patients (if any)
INSERT INTO public.contracts ("pacienteId", "pacienteNome", valor, "dataInicio", status)
SELECT 
    p.id, 
    p.nome, 
    3000.00, -- Default value
    '2026-05-01', 
    'ativo'
FROM public.patients p
LEFT JOIN public.contracts c ON p.id = c."pacienteId"
WHERE c.id IS NULL AND (p.status = 'ativo' OR p.status IS NULL);

-- 3. Loop to generate invoices for the next 8 months (May to Dec 2026)
DO $$
DECLARE
    p_record RECORD;
    v_entity_id UUID;
    v_invoice_id UUID;
    v_due_date DATE;
    v_month INT;
BEGIN
    FOR p_record IN 
        SELECT p.id as patient_id, p.nome, c.valor, e.id as entity_id
        FROM public.patients p
        JOIN public.contracts c ON p.id = c."pacienteId"
        JOIN public.entities e ON p.nome = e.name AND e.type = 'customer'
        WHERE c.status = 'ativo'
    LOOP
        FOR v_month IN 5..12 LOOP
            v_due_date := TO_DATE('2026-' || v_month || '-10', 'YYYY-MM-DD');
            
            IF NOT EXISTS (
                SELECT 1 FROM public.fin_invoices 
                WHERE entity_id = p_record.entity_id 
                AND due_date = v_due_date
            ) THEN
                INSERT INTO public.fin_invoices (entity_id, due_date, total_amount, status, observations, category_id)
                VALUES (
                    p_record.entity_id, 
                    v_due_date, 
                    p_record.valor, 
                    'draft', 
                    'Fatura automática gerada a partir do contrato - Ref ' || TO_CHAR(v_due_date, 'MM/YYYY'),
                    '457cfed5-8f3e-482b-9cda-b0043bf123d4'
                )
                RETURNING id INTO v_invoice_id;

                INSERT INTO public.fin_invoice_items (invoice_id, description, quantity, unit_price, total_price)
                VALUES (
                    v_invoice_id,
                    'Mensalidade - ' || TO_CHAR(v_due_date, 'MM/YYYY'),
                    1,
                    p_record.valor,
                    p_record.valor
                );
            END IF;
        END LOOP;
    END LOOP;
END;
$$;



-- Migration: 20260411130113_restore_bank_balances_trigger
-- Re-applying the trigger to maintain bank balances
CREATE OR REPLACE FUNCTION update_bank_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.status = 'paid' AND NEW.bank_id IS NOT NULL) THEN
            IF (NEW.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance + NEW.amount WHERE id = NEW.bank_id;
            ELSIF (NEW.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance - NEW.amount WHERE id = NEW.bank_id;
            END IF;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = 'pending' AND NEW.status = 'paid' AND NEW.bank_id IS NOT NULL) THEN
            IF (NEW.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance + NEW.amount WHERE id = NEW.bank_id;
            ELSIF (NEW.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance - NEW.amount WHERE id = NEW.bank_id;
            END IF;
        ELSIF (OLD.status = 'paid' AND NEW.status = 'pending' AND OLD.bank_id IS NOT NULL) THEN
            IF (OLD.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance - OLD.amount WHERE id = OLD.bank_id;
            ELSIF (OLD.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance + OLD.amount WHERE id = OLD.bank_id;
            END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.status = 'paid' AND OLD.bank_id IS NOT NULL) THEN
            IF (OLD.type = 'receivable') THEN
                UPDATE public.banks SET current_balance = current_balance - OLD.amount WHERE id = OLD.bank_id;
            ELSIF (OLD.type = 'payable') THEN
                UPDATE public.banks SET current_balance = current_balance + OLD.amount WHERE id = OLD.bank_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_bank_balance ON public.transactions;
CREATE TRIGGER tr_update_bank_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION update_bank_balance();



-- Migration: 20260413155758_create_terminations_table
CREATE TABLE IF NOT EXISTS public.terminations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "funcionarioId" UUID REFERENCES public.employees(id),
  "funcionarioNome" TEXT NOT NULL,
  cpf TEXT NOT NULL,
  cargo TEXT NOT NULL,
  "salarioBase" NUMERIC NOT NULL,
  "dataAdmissao" DATE NOT NULL,
  "dataDemissao" DATE NOT NULL,
  "tipoRescisao" TEXT NOT NULL,
  "valorLiquido" NUMERIC NOT NULL,
  "valorFgts" NUMERIC NOT NULL,
  "valorTotal" NUMERIC NOT NULL,
  status TEXT DEFAULT 'pendente',
  "dataCriacao" TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS if needed, but for now let's just make it public like others set in this environment
ALTER TABLE public.terminations DISABLE ROW LEVEL SECURITY;



-- Migration: 20260413155838_add_created_at_to_company_settings
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();



-- Migration: 20260413160409_expand_company_settings_columns
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS razao_social TEXT,
ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
ADD COLUMN IF NOT EXISTS data_abertura DATE,
ADD COLUMN IF NOT EXISTS street TEXT,
ADD COLUMN IF NOT EXISTS "number" TEXT,
ADD COLUMN IF NOT EXISTS complement TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Clear and Insert the Correct Data
DELETE FROM public.company_settings;

INSERT INTO public.company_settings (
  name, 
  razao_social, 
  cnpj, 
  inscricao_estadual, 
  data_abertura, 
  address, 
  street, 
  "number", 
  neighborhood, 
  city, 
  state, 
  zip_code, 
  phone, 
  email, 
  logo_url
) VALUES (
  'CASA DOS IDOSOS NOVO HORIZONTE', 
  'NOVO HORIZONTE CASA DOS IDOSOS LTDA', 
  '56.956.061/0001-81', 
  'ISENTO', 
  '2024-08-21', 
  'RUA SILVA JARDIM, 1012 - VILA MORAES - OURINHOS/SP - CEP: 19900-261', 
  'RUA SILVA JARDIM', 
  '1012', 
  'VILA MORAES', 
  'OURINHOS', 
  'SP', 
  '19900-261', 
  '(14) 99758-6883', 
  'novohorizonte.casadosidosos@gmail.com',
  'https://drive.google.com/uc?export=view&id=1KUxwBIbGmOc1yz1O0nQgecoIc9RO8EP1'
);



-- Migration: 20260413160822_add_created_at_to_terminations
ALTER TABLE public.terminations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Update created_at with the value from dataCriacao if it exists
UPDATE public.terminations SET created_at = "dataCriacao" WHERE "dataCriacao" IS NOT NULL;



-- Migration: 20260413161029_add_details_to_terminations
ALTER TABLE public.terminations ADD COLUMN IF NOT EXISTS details JSONB;



-- Migration: 20260416204252_add_contract_number_to_contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS numero_contrato text;



-- Migration: 20260417104103_create_curriculums_table
CREATE TABLE public.curriculums (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL,
    telefone text,
    endereco text,
    rg text,
    cpf text NOT NULL,
    cargo_pretendido text,
    status text DEFAULT 'aprovado',
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.curriculums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.curriculums FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for anon" ON public.curriculums FOR ALL TO anon USING (true);



-- Migration: 20260417191244_add_multiple_responsibles_to_patients
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS outros_responsaveis JSONB DEFAULT '[]'::jsonb;


-- Migration: 20260417195032_add_responsible_fields_to_patients
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS resp_nacionalidade text,
ADD COLUMN IF NOT EXISTS resp_estado_civil text,
ADD COLUMN IF NOT EXISTS resp_profissao text;


-- Migration: 20260417195720_add_extra_fields_to_contracts
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS valorExtra numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS descricaoExtra text;


-- Migration: 20260417195918_fix_contracts_column_casing
-- Remover as colunas criadas incorretamente em minúsculo
ALTER TABLE contracts DROP COLUMN IF EXISTS valorextra;
ALTER TABLE contracts DROP COLUMN IF EXISTS descricaoextra;

-- Adicionar as colunas com o casing correto (camelCase) usando aspas
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "valorExtra" numeric DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "descricaoExtra" text;


-- Migration: 20260417201948_add_tipo_periodo_to_payrolls
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS tipo_periodo text DEFAULT 'mes';


-- Migration: 20260417211002_add_vt_tipo_to_employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS vt_tipo TEXT;


-- Migration: 20260417212242_add_is_dobra_to_schedule_exceptions
ALTER TABLE schedule_exceptions ADD COLUMN IF NOT EXISTS is_dobra BOOLEAN DEFAULT false;


-- Migration: 20260417213915_create_schedule_histories
CREATE TABLE IF NOT EXISTS public.schedule_histories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month text NOT NULL,
  unidade text NOT NULL,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS e adicionar policies se necessario
ALTER TABLE public.schedule_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acesso total schedule_histories" ON public.schedule_histories FOR ALL USING (true);



-- Migration: 20260419205925_remove_appclara_tables_from_osneiapp
DROP TABLE IF EXISTS public.fin_invoice_items;
DROP TABLE IF EXISTS public.fin_invoices;
DROP TABLE IF EXISTS public.transactions;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.banks;
DROP TABLE IF EXISTS public.company_settings;


-- Migration: 20260421132808_make_curriculum_cpf_nullable
ALTER TABLE public.curriculums ALTER COLUMN cpf DROP NOT NULL;


-- Migration: 20260421133640_add_birth_date_to_curriculums
ALTER TABLE public.curriculums ADD COLUMN data_nascimento DATE;


-- Migration: 20260421224757_add_data_nascimento_to_employees
ALTER TABLE public.employees ADD COLUMN data_nascimento DATE;


-- Migration: 20260421235540_add_employee_payment_fields
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS dados_bancarios text,
ADD COLUMN IF NOT EXISTS chave_pix text;


-- Migration: 20260422205611_add_stock_to_medications
ALTER TABLE medications 
ADD COLUMN IF NOT EXISTS estoque_atual NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS qtd_por_dose NUMERIC DEFAULT 1,
ADD COLUMN IF NOT EXISTS unidade_medida TEXT DEFAULT 'comprimido';


-- Migration: 20260422211414_add_payment_date_to_finance_tables
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_date DATE;


-- Migration: 20260422221954_add_bank_account_id_to_financial_tables
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);


-- Migration: 20260422222500_bank_balance_auto_update
-- Function to update bank balance based on transactions
CREATE OR REPLACE FUNCTION update_bank_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.tipo = 'credito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual + NEW.valor 
            WHERE id = NEW.bank_account_id;
        ELSIF (NEW.tipo = 'debito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual - NEW.valor 
            WHERE id = NEW.bank_account_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.tipo = 'credito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual - OLD.valor 
            WHERE id = OLD.bank_account_id;
        ELSIF (OLD.tipo = 'debito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual + OLD.valor 
            WHERE id = OLD.bank_account_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Revert old transaction
        IF (OLD.tipo = 'credito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual - OLD.valor 
            WHERE id = OLD.bank_account_id;
        ELSIF (OLD.tipo = 'debito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual + OLD.valor 
            WHERE id = OLD.bank_account_id;
        END IF;
        -- Apply new transaction
        IF (NEW.tipo = 'credito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual + NEW.valor 
            WHERE id = NEW.bank_account_id;
        ELSIF (NEW.tipo = 'debito') THEN
            UPDATE bank_accounts 
            SET saldo_atual = saldo_atual - NEW.valor 
            WHERE id = NEW.bank_account_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for bank_transactions
DROP TRIGGER IF EXISTS tr_update_bank_balance ON bank_transactions;
CREATE TRIGGER tr_update_bank_balance
AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
FOR EACH ROW EXECUTE FUNCTION update_bank_balance();


-- Migration: 20260422222610_add_bank_transaction_id_to_financials
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES bank_transactions(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES bank_transactions(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES bank_transactions(id);


-- Migration: 20260423133459_add_interview_fields_to_curriculums
ALTER TABLE curriculums 
ADD COLUMN IF NOT EXISTS data_entrevista DATE,
ADD COLUMN IF NOT EXISTS hora_entrevista TEXT,
ADD COLUMN IF NOT EXISTS local_entrevista TEXT;


-- Migration: 20260423230224_add_pro_labore_to_employees
ALTER TABLE employees ADD COLUMN is_pro_labore BOOLEAN DEFAULT FALSE;


-- Migration: 20260423230343_add_pro_labore_category
INSERT INTO transaction_categories (nome, tipo) VALUES ('Pró-Labore', 'despesa');


-- Migration: 20260423231108_add_times_to_schedule_exceptions_and_update_units
ALTER TABLE schedule_exceptions ADD COLUMN start_time TEXT;
ALTER TABLE schedule_exceptions ADD COLUMN end_time TEXT;


-- Migration: 20260424112214_create_profiles_and_roles
-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can do everything on profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'user')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



-- Migration: 20260427195822_add_medication_fields
ALTER TABLE medications ADD COLUMN IF NOT EXISTS tipo_escala text DEFAULT 'regular';
ALTER TABLE medications ADD COLUMN IF NOT EXISTS dias_semana jsonb DEFAULT '[]'::jsonb;


-- Migration: 20260502202539_inventory_system_init
-- Products Table
CREATE TABLE IF NOT EXISTS stk_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand TEXT,
    packaging TEXT,
    weight TEXT,
    batch TEXT,
    mfg_date DATE,
    exp_date DATE,
    min_stock INTEGER DEFAULT 0,
    current_stock INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Outbound Slips (Romaneios de Saída)
CREATE TABLE IF NOT EXISTS stk_outbound_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_date DATE DEFAULT CURRENT_DATE,
    school_unit TEXT,
    status TEXT DEFAULT 'draft', -- draft, issued
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items in Outbound Slips
CREATE TABLE IF NOT EXISTS stk_outbound_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_id UUID REFERENCES stk_outbound_slips(id) ON DELETE CASCADE,
    product_id UUID REFERENCES stk_products(id),
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS stk_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending', -- pending, received
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items in Purchase Orders
CREATE TABLE IF NOT EXISTS stk_purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES stk_purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES stk_products(id),
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- View for Stock Levels (Simplified)
CREATE OR REPLACE VIEW stk_v_product_stock AS
SELECT 
    p.id,
    p.name,
    p.brand,
    p.current_stock,
    p.min_stock,
    CASE 
        WHEN p.current_stock <= p.min_stock THEN 'Critical'
        WHEN p.current_stock <= p.min_stock * 1.5 THEN 'Warning'
        ELSE 'OK'
    END as stock_status
FROM stk_products p;



-- Migration: 20260502223644_add_category_to_products
ALTER TABLE stk_products ADD COLUMN IF NOT EXISTS category text;


-- Migration: 20260504190936_add_destination_account_to_bills
ALTER TABLE bills ADD COLUMN IF NOT EXISTS destination_bank_account_id UUID REFERENCES bank_accounts(id);


-- Migration: 20260504191207_add_status_to_bank_transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pago';


-- Migration: 20260504191457_add_source_account_to_incomes
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS source_bank_account_id UUID REFERENCES bank_accounts(id);


-- Migration: 20260505104352_add_descontos_fixos_to_employees
ALTER TABLE public.employees ADD COLUMN descontos_fixos numeric DEFAULT 0;


-- Migration: 20260505133854_create_audit_logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID,
    user_email TEXT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    description TEXT
);

-- Habilitar RLS e permitir leitura para admins
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Nota: Como o sistema atual parece ter RLS desabilitado em várias tabelas (conforme advisory),
-- vou criar uma política simples que permite leitura se o usuário for admin ou gerente.
-- Mas primeiro, vamos apenas criar a tabela.



-- Migration: 20260505133918_setup_audit_triggers
CREATE OR REPLACE FUNCTION process_audit_log() RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Captura o ID do usuário autenticado do Supabase
    v_user_id := auth.uid();
    
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data)
        VALUES (v_user_id, TG_OP, TG_TABLE_NAME, OLD.id::text, row_to_json(OLD)::jsonb);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
        VALUES (v_user_id, TG_OP, TG_TABLE_NAME, NEW.id::text, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data)
        VALUES (v_user_id, TG_OP, TG_TABLE_NAME, NEW.id::text, row_to_json(NEW)::jsonb);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar gatilhos para as tabelas principais
DO $$
DECLARE
    t TEXT;
    tables_to_audit TEXT[] := ARRAY['patients', 'employees', 'bills', 'incomes', 'medications', 'contracts', 'payrolls', 'bank_accounts', 'bank_transactions'];
BEGIN
    FOREACH t IN ARRAY tables_to_audit LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION process_audit_log()', t, t);
    END LOOP;
END;
$$;



-- Migration: 20260505134109_add_audit_logs_policies
-- Política para permitir que Admins e Gerentes leiam os logs
CREATE POLICY "Admins and Managers can view logs" ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'admin' OR profiles.role = 'manager')
        )
    );

-- Permitir que o trigger (rodando como SECURITY DEFINER) insira logs
-- Como o trigger é SECURITY DEFINER, ele roda com as permissões do criador (normalmente postgres/admin), 
-- então ele ignora RLS a menos que explicitamente configurado.



-- Migration: 20260505134126_update_audit_triggers_v2
-- Atualizar gatilhos para incluir tabelas de estoque e categorias
DO $$
DECLARE
    t TEXT;
    tables_to_audit TEXT[] := ARRAY[
        'patients', 'employees', 'bills', 'incomes', 'medications', 'contracts', 
        'payrolls', 'bank_accounts', 'bank_transactions', 'products',
        'stk_products', 'stk_purchase_orders', 'stk_outbound_slips'
    ];
BEGIN
    FOREACH t IN ARRAY tables_to_audit LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION process_audit_log()', t, t);
    END LOOP;
END;
$$;



-- Migration: 20260505214056_create_patient_reports
CREATE TABLE patient_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    professional_name TEXT
);

-- Permissões básicas
ALTER TABLE patient_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated users" ON patient_reports FOR ALL USING (auth.role() = 'authenticated');

-- Atualizar triggers de auditoria para incluir a nova tabela
DROP TRIGGER IF EXISTS trg_audit_patient_reports ON patient_reports;
CREATE TRIGGER trg_audit_patient_reports AFTER INSERT OR UPDATE OR DELETE ON patient_reports FOR EACH ROW EXECUTE FUNCTION process_audit_log();



-- Migration: 20260505214956_create_technical_professionals
CREATE TABLE technical_professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    nome TEXT NOT NULL,
    cpf TEXT,
    coren_crm TEXT NOT NULL,
    funcao TEXT NOT NULL DEFAULT 'Técnico de Enfermagem',
    status TEXT NOT NULL DEFAULT 'ativo'
);

-- Permissões básicas
ALTER TABLE technical_professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated users" ON technical_professionals FOR ALL USING (auth.role() = 'authenticated');

-- Atualizar triggers de auditoria para incluir a nova tabela
DROP TRIGGER IF EXISTS trg_audit_technical_professionals ON technical_professionals;
CREATE TRIGGER trg_audit_technical_professionals AFTER INSERT OR UPDATE OR DELETE ON technical_professionals FOR EACH ROW EXECUTE FUNCTION process_audit_log();



-- Migration: 20260505215916_add_fk_audit_logs
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;


-- Migration: 20260508151834_add_labor_references_to_bills
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS termination_id UUID REFERENCES public.terminations(id),
ADD COLUMN IF NOT EXISTS payroll_id UUID REFERENCES public.payrolls(id);


-- Migration: 20260508223639_add_payment_responsibility_fields
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS paid_by TEXT;
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_by TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;

ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS paid_by TEXT;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS paid_by_phone TEXT;


-- Migration: 20260508223957_add_signature_to_company_info
ALTER TABLE public.company_info ADD COLUMN IF NOT EXISTS assinatura_url TEXT;


-- Migration: 20260508224521_add_paid_by_document_fields
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS paid_by_document TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_by_document TEXT;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS paid_by_document TEXT;


-- Migration: 20260508225740_add_whatsapp_toggle_to_responresponsibles
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS resp_is_whatsapp BOOLEAN DEFAULT FALSE;


-- Migration: 20260512210741_add_cep_to_employees_and_curriculums
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS uf text;

ALTER TABLE public.curriculums ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.curriculums ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.curriculums ADD COLUMN IF NOT EXISTS uf text;


-- Migration: 20260512210942_add_cep_to_company_info
ALTER TABLE public.company_info ADD COLUMN IF NOT EXISTS cep text;


-- Migration: 20260515152626_add_vacation_calculation_fields
ALTER TABLE public.vacations 
ADD COLUMN "salarioBase" numeric DEFAULT 0,
ADD COLUMN "diasFerias" integer DEFAULT 0,
ADD COLUMN "diasAbono" integer DEFAULT 0,
ADD COLUMN "valorFerias" numeric DEFAULT 0,
ADD COLUMN "valorTercoConstitucional" numeric DEFAULT 0,
ADD COLUMN "valorAbonoPecuniario" numeric DEFAULT 0,
ADD COLUMN "valorTercoAbono" numeric DEFAULT 0,
ADD COLUMN "descontosInss" numeric DEFAULT 0,
ADD COLUMN "descontosIrrf" numeric DEFAULT 0,
ADD COLUMN "valorLiquido" numeric DEFAULT 0;


-- Migration: 20260516222800_create_patient_companionships
CREATE TABLE IF NOT EXISTS public.patient_companionships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  paciente_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  paciente_nome TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  nome_acompanhante TEXT,
  tipo TEXT,
  local TEXT,
  responsavel TEXT,
  valor NUMERIC(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Disable RLS to match other tables for now
ALTER TABLE public.patient_companionships DISABLE ROW LEVEL SECURITY;



-- Migration: 20260516223042_rls_remediation_basic
-- Remediation script for RLS on core tables

-- 1. Helper function to check for admin/manager roles
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role = 'admin' OR role = 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Table list for RLS enabling
DO $$
DECLARE
  table_name TEXT;
  tables TEXT[] := ARRAY[
    'patients', 'medications', 'bills', 'incomes', 'contracts', 
    'products', 'appointments', 'employees', 'bank_accounts', 
    'bank_transactions', 'transaction_categories', 'medication_entries', 
    'patient_reports', 'technical_professionals', 'payrolls', 
    'vacations', 'curriculums', 'terminations', 'patient_companionships'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables
  LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    
    -- Drop existing policies to avoid conflicts
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated select all" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow manager insert" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow manager update" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow manager delete" ON public.%I', table_name);

    -- Create new policies
    -- SELECT: Allow any authenticated user (shared system)
    EXECUTE format('CREATE POLICY "Allow authenticated select all" ON public.%I FOR SELECT TO authenticated USING (true)', table_name);
    
    -- INSERT/UPDATE/DELETE: Only for managers/admins
    EXECUTE format('CREATE POLICY "Allow manager insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_manager())', table_name);
    EXECUTE format('CREATE POLICY "Allow manager update" ON public.%I FOR UPDATE TO authenticated USING (public.is_manager())', table_name);
    EXECUTE format('CREATE POLICY "Allow manager delete" ON public.%I FOR DELETE TO authenticated USING (public.is_manager())', table_name);
  END LOOP;
END $$;


