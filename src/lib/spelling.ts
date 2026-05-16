/**
 * Utilitário para correção ortográfica e formatação de texto em Português (Brasil).
 * Focado em erros comuns em laudos técnicos e correções de pontuação/espaçamento.
 */

const commonTypos: Record<string, string> = {
  'recebiba': 'recebida',
  'ccom': 'com',
  'extende': 'estende',
  'lsao': 'lesão',
  'lsão': 'lesão',
  'conpanhada': 'acompanhada',
  'companhada': 'acompanhada',
  'hemorrida': 'hemorroida',
  'medico': 'médico',
  'saude': 'saúde',
  'paciente': 'paciente',
  'instiuição': 'instituição',
  'instituiçao': 'instituição',
  'relatou': 'relatou',
  'cirurgico': 'cirúrgico',
  'hipertensão': 'hipertensão',
  'coracao': 'coração',
  'coraçao': 'coração',
  'fistula': 'fístula',
  'evolucao': 'evolução',
  'evolucão': 'evolução',
  'evoluçao': 'evolução',
  'diagnostico': 'diagnóstico',
  'remedio': 'remédio',
  'farmacia': 'farmácia',
  'clinica': 'clínica',
  'tecnico': 'técnico',
  'está': 'está',
  'esta': 'está', // Depende do contexto, mas em laudos geralmente é "está"
}

/**
 * Corrige o texto preservando o caso (CAIXA ALTA ou baixa) se possível.
 */
export function fixSpelling(text: string): string {
  if (!text) return ''

  let fixed = text

  // 1. Corrigir espaçamento de pontuação
  // Remove espaços antes de vírgula, ponto, ponto e vírgula
  fixed = fixed.replace(/\s+([,.!;?])/g, '$1')
  // Adiciona espaço após vírgula, ponto, etc, se não houver
  fixed = fixed.replace(/([,.!;?])(?=[^\s\d])/g, '$1 ')
  // Remove espaços duplos
  fixed = fixed.replace(/\s\s+/g, ' ')

  // 2. Corrigir erros comuns (Case-Insensitive)
  const words = fixed.split(/(\s+|[,.!;?])/g)
  const processedWords = words.map(word => {
    const cleanWord = word.toLowerCase().trim()
    if (commonTypos[cleanWord]) {
      const correction = commonTypos[cleanWord]
      
      // Preservar CAIXA ALTA se a palavra original estava em CAIXA ALTA
      if (word === word.toUpperCase() && word.length > 1) {
        return correction.toUpperCase()
      }
      // Preservar Capitalize
      if (word.charAt(0) === word.charAt(0).toUpperCase() && word.length > 1) {
        return correction.charAt(0).toUpperCase() + correction.slice(1)
      }
      return correction
    }
    return word
  })

  fixed = processedWords.join('')

  // 3. Garantir espaço após pontuação que pode ter sido colada
  fixed = fixed.replace(/([.!?])([A-ZÀ-Ú])/g, '$1 $2')

  return fixed
}

/**
 * Normaliza o texto de CAIXA ALTA para frase (Sentence case)
 */
export function normalizeCase(text: string): string {
  if (!text) return ''
  
  // Se não estiver em caixa alta, não faz nada (evita estragar nomes próprios no meio do texto)
  // Mas o usuário quer "independentemente se está em caixa alta ou baixa"
  // Vou criar uma lógica que converte tudo para minúsculo e depois capitaliza o início das frases.
  
  const lower = text.toLowerCase()
  return lower.replace(/(^\s*|[.!?]\s+)([a-zà-ú])/g, (match) => match.toUpperCase())
}
