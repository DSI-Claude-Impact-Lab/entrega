import type { AreaReport } from './api'

const DIA_LABELS: Record<string, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
  dom: 'Domingo',
}

function formatMonth(m: { ano: number; mes: number; n: number } | null) {
  if (!m) return '—'
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ]
  const label = meses[(m.mes - 1) % 12] ?? m.mes
  return `${label}/${m.ano} (${m.n.toLocaleString('pt-BR')} ocorrências)`
}

function formatDelta(delta: number | null): string {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

function formatDia(dia: string | null): string {
  if (!dia) return '—'
  return DIA_LABELS[dia.toLowerCase()] ?? dia
}

function formatHourHistogram(buckets: { hour: number; n: number }[]): string {
  if (!buckets || buckets.length === 0) return ''
  const max = Math.max(...buckets.map((b) => b.n)) || 1
  const totalSlots = 24
  const padded = Array.from({ length: totalSlots }, (_, h) => {
    const found = buckets.find((b) => b.hour === h)
    return { hour: h, n: found?.n ?? 0 }
  })
  return padded
    .map((b) => {
      const bars = Math.round((b.n / max) * 18)
      const bar = '█'.repeat(bars).padEnd(18, '·')
      return `${String(b.hour).padStart(2, '0')}h ${bar} ${b.n.toLocaleString('pt-BR')}`
    })
    .join('\n')
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function formatAreaReportMarkdown(report: AreaReport, geradoEm = new Date()): string {
  const lines: string[] = []
  lines.push(`# Relatório CompStat — ${report.name}`)
  lines.push('')
  lines.push(`_Gerado em ${geradoEm.toLocaleString('pt-BR')}._`)
  lines.push('')

  lines.push('## Resumo')
  lines.push(`- Total de ocorrências: **${report.total_ocorrencias.toLocaleString('pt-BR')}**`)
  lines.push(`- Último mês: ${formatMonth(report.last_month)}`)
  lines.push(`- Mês anterior: ${formatMonth(report.previous_month)}`)
  lines.push(`- Variação mês-a-mês: **${formatDelta(report.delta_pct)}**`)
  lines.push(
    `- Pico horário: **${report.peak_hour != null ? `${String(report.peak_hour).padStart(2, '0')}h` : '—'}**${
      report.peak_hour_n != null ? ` (${report.peak_hour_n.toLocaleString('pt-BR')} ocorrências)` : ''
    }`,
  )
  lines.push(`- Dia de pico: **${formatDia(report.dia_pico)}**`)
  lines.push(`- Fatores urbanos catalogados: ${report.n_fatores_total.toLocaleString('pt-BR')}`)
  lines.push('')

  if (report.dinamica) {
    lines.push('## Dinâmica criminal')
    lines.push(report.dinamica.trim())
    lines.push('')
  }

  if (report.top_delitos?.length) {
    lines.push('## Top tipos de crime')
    for (const d of report.top_delitos) {
      lines.push(`- ${d.delito}: ${d.n.toLocaleString('pt-BR')}`)
    }
    lines.push('')
  }

  if (report.top_logradouros?.length) {
    lines.push('## Top logradouros')
    for (const l of report.top_logradouros) {
      lines.push(`- ${l.logradouro}: ${l.n.toLocaleString('pt-BR')}`)
    }
    lines.push('')
  }

  if (report.fatores_ranking?.length) {
    lines.push('## Fatores urbanos por órgão')
    for (const f of report.fatores_ranking) {
      lines.push(`- ${f.orgao} — ${f.tipo} (${f.n.toLocaleString('pt-BR')}x)`)
    }
    lines.push('')
  }

  if (report.bingos?.length) {
    lines.push('## Bingos (sobreposição logradouro × fator)')
    lines.push('')
    lines.push('| Logradouro | Fator | Órgão | Ocorrências | Fatores |')
    lines.push('|---|---|---|---:|---:|')
    for (const b of report.bingos) {
      lines.push(
        `| ${b.logradouro} | ${b.fator} | ${b.orgao} | ${b.ocorrencias.toLocaleString('pt-BR')} | ${b.n_fatores} |`,
      )
    }
    lines.push('')
  }

  if (report.hour_distribution?.length) {
    lines.push('## Distribuição horária')
    lines.push('```')
    lines.push(formatHourHistogram(report.hour_distribution))
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

export function reportFileName(report: AreaReport, ext = 'md'): string {
  return `relatorio-${slugify(report.name)}.${ext}`
}
