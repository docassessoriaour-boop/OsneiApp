import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { isLarSabedoria } from '@/lib/companies'
import { printPDF } from '@/lib/pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { documentTypes, fieldsFor, escapeHtml, normalizeSearch } from './models'
import type { DocumentType } from './models'

type ManualDocument = {
  id: string; company_id: string; tipo: DocumentType; titulo: string; pessoa: string;
  data_documento: string; campos: Record<string, string>; created_at?: string;
}
const today = () => new Date().toLocaleDateString('en-CA')
const blank = (companyId: string): ManualDocument => ({ id: '', company_id: companyId, tipo: 'escala', titulo: '', pessoa: '', data_documento: today(), campos: {} })

export default function DocumentosManuais() {
  const { profile, isAdmin, isManager } = useAuth()
  if (!profile?.company_id || !isLarSabedoria(profile.company) || (!isAdmin && !isManager)) return <Navigate to="/" replace />
  return <Folder key={profile.company_id} companyId={profile.company_id} />
}

function Folder({ companyId }: { companyId: string }) {
  const [documents, setDocuments] = useState<ManualDocument[]>([])
  const [draft, setDraft] = useState<ManualDocument | null>(null)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    supabase.from('lar_manual_documents').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return
      if (error) setError('Não foi possível carregar a pasta. Verifique a conexão e a ativação dos documentos manuais no banco de dados.')
      else setDocuments(data || [])
      setLoading(false)
    })
    return () => { active = false }
  }, [companyId])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    setBusy(true)
    setError('')
    try {
      const { id, created_at: _created, ...payload } = draft
      const query = id
        ? supabase.from('lar_manual_documents').update(payload).eq('id', id).eq('company_id', companyId)
        : supabase.from('lar_manual_documents').insert({ ...payload, company_id: companyId })
      const { data, error } = await query.select().single()
      if (error) throw error
      setDocuments(old => id ? old.map(item => item.id === id ? data : item) : [data, ...old])
      setDraft(null)
    } catch { setError('Não foi possível salvar. O preenchimento foi mantido; verifique a conexão e tente novamente.') }
    finally { setBusy(false) }
  }

  function print(doc: ManualDocument) {
    const e = escapeHtml
    const content = `<h2>Lar de Convivência da Sabedoria</h2><p style="text-align:center">CNPJ: 52.502.750/0001-65</p>
      <h3>${e(doc.titulo)}</h3><p><strong>Nome / equipe:</strong> ${e(doc.pessoa)}</p><p><strong>Data:</strong> ${e(doc.data_documento.split('-').reverse().join('/'))}</p>
      ${fieldsFor(doc.tipo).map(field => `<div style="margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere"><strong>${e(field.label)}:</strong><br>${e(doc.campos[field.key] || '________________________________')}</div>`).join('')}
      <div style="margin-top:55px">________________________________________________<br>Assinatura do responsável / recebedor</div>
      ${doc.tipo.startsWith('contrato') ? '<div style="margin-top:55px">________________________________________________<br>Assinatura da outra parte</div>' : ''}`
    printPDF(documentTypes[doc.tipo], content, undefined, { hideLogo: true, orientation: doc.tipo === 'escala' ? 'landscape' : 'portrait' })
  }
  const filtered = documents.filter(doc => (!type || doc.tipo === type) && normalizeSearch([doc.titulo, doc.pessoa, doc.data_documento, documentTypes[doc.tipo], ...Object.values(doc.campos)].join(' ')).includes(normalizeSearch(search)))
  const fieldClass = 'w-full border rounded-md p-2 bg-background'
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Pasta de documentos manuais</h1><p className="text-muted-foreground">Lar de Convivência da Sabedoria — todos os documentos em um só lugar.</p></div><Button disabled={loading || busy} onClick={() => setDraft(blank(companyId))}>Novo documento</Button></div>
    <p className="text-sm text-muted-foreground">Preencha livremente, mesmo sem cadastro prévio. Salve na pasta para consultar, editar e imprimir ou salvar em PDF. Recibos manuais não registram pagamentos no financeiro.</p>
    {error && <p role="alert" className="border border-red-300 bg-red-50 text-red-800 p-3 rounded">{error}</p>}
    {draft && <form onSubmit={save} className="border rounded-xl p-5 space-y-4 bg-card">
      <h2 className="text-lg font-semibold">{draft.id ? 'Editar documento' : 'Preenchimento manual'}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label>Tipo de documento<select className={fieldClass} value={draft.tipo} disabled={!!draft.id || busy} onChange={event => setDraft({ ...draft, tipo: event.target.value as DocumentType, campos: {} })}>{Object.entries(documentTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Título<Input required value={draft.titulo} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></label>
        <label>Nome do funcionário, paciente ou equipe<Input required value={draft.pessoa} onChange={event => setDraft({ ...draft, pessoa: event.target.value })} /></label>
        <label>Data do documento<Input type="date" required value={draft.data_documento} onChange={event => setDraft({ ...draft, data_documento: event.target.value })} /></label>
        {fieldsFor(draft.tipo).map(field => <label key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>{field.label}{field.required ? ' *' : ''}
          {field.type === 'textarea' ? <textarea className={fieldClass} rows={field.key === 'clausulas' ? 12 : 4} required={field.required} value={draft.campos[field.key] || ''} onChange={event => setDraft({ ...draft, campos: { ...draft.campos, [field.key]: event.target.value } })} /> : <Input type={field.type || 'text'} min={field.type === 'number' ? '0.01' : undefined} step={field.type === 'number' ? '0.01' : undefined} required={field.required} value={draft.campos[field.key] || ''} onChange={event => setDraft({ ...draft, campos: { ...draft.campos, [field.key]: event.target.value } })} />}
        </label>)}
      </div><div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar na pasta'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancelar</Button></div>
    </form>}
    <div className="flex flex-wrap gap-3"><Input className="md:max-w-md" aria-label="Buscar em todos os documentos" placeholder="Buscar nome, CPF, título ou conteúdo…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filtrar por tipo" className="border rounded-md p-2 bg-background" value={type} onChange={event => setType(event.target.value)}><option value="">Todos os tipos</option>{Object.entries(documentTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <p aria-live="polite">{loading ? 'Carregando pasta…' : `${filtered.length} documento(s) encontrado(s)`}</p>
    <div className="grid gap-3">{filtered.map(doc => <article key={doc.id} className="border rounded-lg p-4 flex flex-wrap justify-between items-center gap-3"><div><p className="text-sm text-muted-foreground">{documentTypes[doc.tipo]} · {doc.data_documento.split('-').reverse().join('/')}</p><h2 className="font-semibold">{doc.titulo}</h2><p>{doc.pessoa}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => setDraft({ ...doc, campos: { ...doc.campos } })}>Abrir / editar</Button><Button variant="outline" onClick={() => print(doc)}>Imprimir / PDF</Button></div></article>)}</div>
  </div>
}
