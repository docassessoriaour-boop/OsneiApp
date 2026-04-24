import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, UploadCloud, FileText, CheckCircle2, AlertTriangle, ArrowRight, Search, Building2 } from 'lucide-react'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Product, Entity, Bill, TransactionCategory } from '@/lib/types'

interface NfeParsedData {
  supplier: { name: string; document: string }
  products: { name: string; quantity: number; unitPrice: number; total: number; unit: string }[]
  installments: { dueDate: string; amount: number; number: string }[]
  totalInvoice: number
}

export default function EntradaNfe() {
  const { data: entities, insert: insertEntity, update: updateEntity } = useDb<Entity>('entities')
  const { data: products, insert: insertProduct, update: updateProduct } = useDb<Product>('products')
  const { insert: insertBill } = useDb<Bill>('bills')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')

  const [loadingFile, setLoadingFile] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [parsedData, setParsedData] = useState<NfeParsedData | null>(null)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchCnpj, setSearchCnpj] = useState('')
  const [searchingNfe, setSearchingNfe] = useState(false)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoadingFile(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const xmlString = evt.target?.result as string
        parseXml(xmlString)
      } catch (error) {
        console.error('Erro ao ler XML', error)
        alert('Extensão ou formato XML inválido.')
      } finally {
        setLoadingFile(false)
      }
    }
    reader.readAsText(file)
  }

  const handleSearchNfe = async () => {
    if (!searchCnpj) return
    setSearchingNfe(true)
    try {
      // Simulação de busca na SEFAZ ou API de Terceiros (ex: Arquivei)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <NFe>
          <infNFe Id="NFe12345678901234567890123456789012345678901234" versao="4.00">
            <ide>
              <dhEmi>${new Date().toISOString()}</dhEmi>
            </ide>
            <emit>
              <CNPJ>00000000000191</CNPJ>
              <xNome>DISTRIBUIDORA MÉDICA LTDA (Simulação SEFAZ)</xNome>
            </emit>
            <det nItem="1">
              <prod>
                <cProd>789123</cProd>
                <xProd>Seringa Descartável 10ml</xProd>
                <uCom>UN</uCom>
                <qCom>150.0000</qCom>
                <vProd>375.00</vProd>
              </prod>
            </det>
            <det nItem="2">
              <prod>
                <cProd>789456</cProd>
                <xProd>Luva de Procedimento Tamanho M</xProd>
                <uCom>CX</uCom>
                <qCom>10.0000</qCom>
                <vProd>350.00</vProd>
              </prod>
            </det>
            <total>
              <ICMSTot>
                <vNF>725.00</vNF>
              </ICMSTot>
            </total>
          </infNFe>
        </NFe>
      </nfeProc>`;

      parseXml(mockXml)
      setSearchDialogOpen(false)
      alert("Nota Fiscal importada com sucesso via SEFAZ!\\n\\nNota: Esta é uma simulação de ambiente de testes. Para uso em produção, será necessário configurar o seu certificado digital A1.")
    } catch (e) {
      alert('Erro na integração com SEFAZ.')
    } finally {
      setSearchingNfe(false)
    }
  }

  const parseXml = (xmlString: string) => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlString, "text/xml")
    
    // Validar se é NFe
    const infNFe = xmlDoc.getElementsByTagName('infNFe')[0]
    if (!infNFe) {
      alert("XML não aparenta ser uma NF-e válida.")
      return
    }

    // Emitente (Fornecedor)
    const emit = infNFe.getElementsByTagName('emit')[0]
    const supplierName = emit?.getElementsByTagName('xNome')[0]?.textContent || 'Fornecedor Desconhecido'
    const supplierCnpj = emit?.getElementsByTagName('CNPJ')[0]?.textContent || ''

    // Produtos
    const dets = Array.from(infNFe.getElementsByTagName('det'))
    const parsedProductsMap = new Map<string, { name: string; quantity: number; unitPrice: number; total: number; unit: string }>()
    dets.forEach(det => {
      const prod = det.getElementsByTagName('prod')[0]
      const name = prod?.getElementsByTagName('xProd')[0]?.textContent || 'Produto sem nome'
      const cod = prod?.getElementsByTagName('cProd')[0]?.textContent || name
      const quantity = parseFloat(prod?.getElementsByTagName('qCom')[0]?.textContent || '0')
      const total = parseFloat(prod?.getElementsByTagName('vProd')[0]?.textContent || '0')
      const unit = prod?.getElementsByTagName('uCom')[0]?.textContent || 'UN'
      const key = `${cod}-${name}`
      
      if (parsedProductsMap.has(key)) {
        const existing = parsedProductsMap.get(key)!
        const newQuant = existing.quantity + quantity
        const newTotal = existing.total + total
        parsedProductsMap.set(key, {
            ...existing,
            quantity: parseFloat(newQuant.toFixed(4)),
            total: parseFloat(newTotal.toFixed(2)),
            unitPrice: newQuant > 0 ? parseFloat((newTotal / newQuant).toFixed(4)) : 0
        })
      } else {
        parsedProductsMap.set(key, {
            name, 
            quantity: parseFloat(quantity.toFixed(4)), 
            total: parseFloat(total.toFixed(2)), 
            unit, 
            unitPrice: quantity > 0 ? parseFloat((total / quantity).toFixed(4)) : 0
        })
      }
    })
    const parsedProducts = Array.from(parsedProductsMap.values())

    // Data de Emissão (dhEmi)
    const ide = infNFe.getElementsByTagName('ide')[0]
    const dhEmi = ide?.getElementsByTagName('dhEmi')[0]?.textContent || ''
    const issueDate = dhEmi ? dhEmi.substring(0, 10) : new Date().toISOString().slice(0, 10)

    const totalInvoice = parseFloat(infNFe.getElementsByTagName('vNF')[0]?.textContent || '0')

    // Cobrança: Exportar o valor total da nota para o contas a pagar com vcto da emissão da nota
    const parsedInstallments = [{
      number: '1',
      dueDate: issueDate,
      amount: totalInvoice
    }]

    setParsedData({
      supplier: { name: supplierName, document: supplierCnpj },
      products: parsedProducts,
      installments: parsedInstallments,
      totalInvoice
    })
  }

  const handleProcess = async () => {
    if (!parsedData) return
    setProcessing(true)

    try {
      // 1. Processar Fornecedor
      let supplier = entities.find(e => e.type === 'supplier' && (e.document === parsedData.supplier.document || e.name === parsedData.supplier.name))
      
      if (!supplier) {
        supplier = await insertEntity({
          name: parsedData.supplier.name,
          type: 'supplier',
          document: parsedData.supplier.document
        })
      }

      // 2. Processar Produtos
      for (const item of parsedData.products) {
        const existing = products.find(p => p.nome.toLowerCase() === item.name.toLowerCase())
        
        if (existing) {
          // Atualiza estoque e custo médio
          const currentStock = existing.estoque || 0
          const currentAvgCost = existing.custo_medio || 0
          
          const newTotalValue = (currentStock * currentAvgCost) + (item.quantity * item.unitPrice)
          const newTotalStock = currentStock + item.quantity
          const newAvgCost = newTotalStock > 0 ? newTotalValue / newTotalStock : item.unitPrice

          await updateProduct(existing.id!, {
            estoque: newTotalStock,
            custo_medio: parseFloat(newAvgCost.toFixed(2)),
            ultimo_valor_comprado: parseFloat(item.unitPrice.toFixed(2)),
            fornecedor_id: supplier?.id,
            fornecedor: supplier?.name
          })
        } else {
          // Cria novo produto
          await insertProduct({
            nome: item.name,
            tipo: 'material',
            estoque: item.quantity,
            unidade: item.unit,
            fornecedor: supplier?.name || '',
            fornecedor_id: supplier?.id,
            estoqueMinimo: 0,
            custo_medio: parseFloat(item.unitPrice.toFixed(2)),
            ultimo_valor_comprado: parseFloat(item.unitPrice.toFixed(2))
          })
        }
      }

      // 3. Processar Cobrança (Contas a Pagar)
      // Buscar categoria de estoque/compras
      const defaultCategory = categories.find(c => c.nome.toLowerCase().includes('estoque') || c.nome.toLowerCase().includes('compra') || c.nome.toLowerCase().includes('fornecedor'))
      
      for (const inst of parsedData.installments) {
        // Verifica se a data é válida (já deve vir do XML como YYYY-MM-DD, se correto)
        let safeDate = inst.dueDate
        if (!safeDate || safeDate.length < 10) {
          safeDate = new Date().toISOString().slice(0, 10)
        }

        await insertBill({
          descricao: `NF ${parsedData.supplier.name} - Parcela ${inst.number}`,
          categoria: defaultCategory?.nome || 'Compras/NF-e',
          category_id: defaultCategory?.id || '',
          valor: inst.amount,
          vencimento: safeDate,
          status: 'pendente'
        })
      }

      alert('NF-e processada com sucesso! Produtos, fornecedor e Contas a Pagar atualizados.')
      setParsedData(null)
    } catch (e) {
      console.error(e)
      alert('Erro ao processar as informações no banco de dados.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar NF-e</h1>
        <p className="text-muted-foreground">Faça upload do XML para automatizar o cadastro e atualizar estoque + finanças</p>
      </div>

      {!parsedData ? (
        <Card className="p-12 border-dashed flex flex-col justify-center items-center gap-4 bg-muted/10">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <UploadCloud className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Selecione o arquivo XML da Nota Fiscal</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              O sistema irá ler as informações do fornecedor, calcular o custo médio dos produtos para o estoque e lançar no contas a pagar.
            </p>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-4 justify-center items-center">
            <div>
              <Label htmlFor="xml-upload" className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 py-2 px-4 rounded-md font-medium text-sm transition-colors flex items-center gap-2">
                {loadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {loadingFile ? 'Lendo Arquivo...' : 'Localizar Arquivo XML'}
              </Label>
              <Input id="xml-upload" type="file" accept=".xml" className="hidden" onChange={handleFileUpload} />
            </div>
            <span className="text-muted-foreground text-sm font-medium">OU</span>
            <Button variant="outline" onClick={() => setSearchDialogOpen(true)} className="gap-2">
              <Search className="h-4 w-4" /> Buscar NF-e por CNPJ
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Card className="p-6">
             <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-6 w-6" />
                  <h3 className="font-bold text-lg">XML Lido com Sucesso!</h3>
                </div>
                <Button variant="ghost" onClick={() => setParsedData(null)}>Cancelar e Enviar Outro</Button>
             </div>

             <div className="grid md:grid-cols-2 gap-6 bg-muted/30 p-4 rounded-lg border mb-6">
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Fornecedor Identificado</p>
                  <p className="font-semibold text-lg">{parsedData.supplier.name}</p>
                  <p className="text-sm text-muted-foreground">CNPJ: {parsedData.supplier.document}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Resumo Financeiro</p>
                  <p className="font-semibold text-lg">Total NF: {formatCurrency(parsedData.totalInvoice)}</p>
                  <p className="text-sm text-muted-foreground">{parsedData.installments.length} Parcela(s) identificada(s)</p>
                </div>
             </div>

             <div className="mb-6">
                <h4 className="font-bold mb-3">Detalhes dos Produtos ({parsedData.products.length})</h4>
                <div className="max-h-[300px] overflow-y-auto border rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Produto</th>
                        <th className="p-2 text-center">Und</th>
                        <th className="p-2 text-right">Qtd</th>
                        <th className="p-2 text-right">Custo Unit.</th>
                        <th className="p-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsedData.products.map((p, idx) => (
                        <tr key={idx} className="hover:bg-muted/50">
                          <td className="p-2 font-medium">{p.name}</td>
                          <td className="p-2 text-center"><Badge variant="outline">{p.unit}</Badge></td>
                          <td className="p-2 text-right font-semibold">{p.quantity}</td>
                          <td className="p-2 text-right">{formatCurrency(p.unitPrice)}</td>
                          <td className="p-2 text-right text-primary font-medium">{formatCurrency(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>

             <div className="mb-6">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  Previsão p/ Contas a Pagar 
                  <Badge variant="secondary" className="font-normal">Geração Automática</Badge>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {parsedData.installments.map((inst, idx) => (
                    <div key={idx} className="p-3 border rounded-lg bg-orange-50/50 border-orange-100">
                      <p className="text-[10px] text-orange-600 font-bold uppercase">Parcela {inst.number}</p>
                      <p className="font-bold text-lg">{formatCurrency(inst.amount)}</p>
                      <p className="text-xs text-muted-foreground">Venc: {formatDate(inst.dueDate)}</p>
                    </div>
                  ))}
                </div>
             </div>

             <div className="flex gap-4 p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200">
               <AlertTriangle className="h-5 w-5 shrink-0" />
               <div className="text-sm">
                 Ao processar, o sistema de forma automática irá <strong>cadastrar/atualizar</strong> o fornecedor e todos os produtos (recalculando também o novo custo médio de estoque). Além disso, as parcelas serão direcionadas para o seu <strong>Contas a Pagar</strong>.
               </div>
             </div>

             <div className="mt-8 flex justify-end">
               <Button size="lg" className="gap-2" onClick={handleProcess} disabled={processing}>
                 {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="h-5 w-5" /> Processar e Finalizar NF-e</>}
               </Button>
             </div>
          </Card>
        </div>
      )}

      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogHeader>
          <DialogTitle>Buscar Notas Fiscais</DialogTitle>
          <DialogClose onClose={() => setSearchDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Meu CNPJ</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="00.000.000/0000-00" 
                  value={searchCnpj}
                  onChange={(e) => setSearchCnpj(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Busca as notas fiscais (NF-e) emitidas contra este CNPJ nos últimos 30 dias na base da SEFAZ.
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSearchDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSearchNfe} disabled={searchingNfe || !searchCnpj} className="gap-2">
            {searchingNfe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searchingNfe ? 'Buscando...' : 'Consultar SEFAZ'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
