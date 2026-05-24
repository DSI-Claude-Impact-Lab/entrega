import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

import type { AreaReport } from './api'

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR')
}

function P(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 80 },
  })
}

function H(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 220, after: 100 },
  })
}

function Bold(text: string): Paragraph {
  return P(text, { bold: true })
}

function tableCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  })
}

function tableHead(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
      }),
    ],
    shading: { fill: '0F1419' },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  })
}

export async function buildAreaReportDocxBlob(report: AreaReport): Promise<Blob> {
  const indicadores = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [tableHead('Indicador'), tableHead('Valor')] }),
      new TableRow({
        children: [
          tableCell('Volume de ocorrências'),
          tableCell(fmtInt(report.total_ocorrencias)),
        ],
      }),
      new TableRow({
        children: [
          tableCell('Variação vs mês anterior'),
          tableCell(fmtPct(report.delta_pct)),
        ],
      }),
      new TableRow({
        children: [
          tableCell('Último mês'),
          tableCell(
            report.last_month
              ? `${fmtInt(report.last_month.n)} ocorrências (${String(
                  report.last_month.mes,
                ).padStart(2, '0')}/${report.last_month.ano})`
              : '—',
          ),
        ],
      }),
      new TableRow({
        children: [
          tableCell('Mês anterior'),
          tableCell(
            report.previous_month
              ? `${fmtInt(report.previous_month.n)} ocorrências (${String(
                  report.previous_month.mes,
                ).padStart(2, '0')}/${report.previous_month.ano})`
              : '—',
          ),
        ],
      }),
      new TableRow({
        children: [
          tableCell('Hora de pico'),
          tableCell(
            report.peak_hour != null
              ? `${String(report.peak_hour).padStart(2, '0')}h${
                  report.peak_hour_n != null
                    ? ` · ${fmtInt(report.peak_hour_n)} ocorrências`
                    : ''
                }`
              : '—',
          ),
        ],
      }),
      new TableRow({
        children: [
          tableCell('Dia de pico'),
          tableCell(report.dia_pico || '—'),
        ],
      }),
      new TableRow({
        children: [
          tableCell('Fatores urbanos mapeados'),
          tableCell(fmtInt(report.n_fatores_total)),
        ],
      }),
    ],
  })

  const totalDelitos = (report.top_delitos ?? []).reduce(
    (sum, d) => sum + (d.n || 0),
    0,
  )
  const tiposRows: TableRow[] = [
    new TableRow({
      children: [tableHead('Tipo'), tableHead('Quantidade'), tableHead('%')],
    }),
  ]
  for (const d of report.top_delitos ?? []) {
    const pct = totalDelitos > 0 ? ((d.n / totalDelitos) * 100).toFixed(1) : '—'
    tiposRows.push(
      new TableRow({
        children: [tableCell(d.delito), tableCell(fmtInt(d.n)), tableCell(`${pct}%`)],
      }),
    )
  }
  const tiposTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tiposRows,
  })

  const logradourosRows: TableRow[] = [
    new TableRow({
      children: [tableHead('Logradouro'), tableHead('Ocorrências')],
    }),
  ]
  for (const l of (report.top_logradouros ?? []).slice(0, 10)) {
    logradourosRows.push(
      new TableRow({
        children: [tableCell(l.logradouro), tableCell(fmtInt(l.n))],
      }),
    )
  }
  const logradourosTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: logradourosRows,
  })

  const fatoresRows: TableRow[] = [
    new TableRow({
      children: [
        tableHead('Fator urbano'),
        tableHead('Órgão responsável'),
        tableHead('Ocorrências'),
      ],
    }),
  ]
  for (const f of (report.fatores_ranking ?? []).slice(0, 12)) {
    fatoresRows.push(
      new TableRow({
        children: [tableCell(f.tipo), tableCell(f.orgao), tableCell(fmtInt(f.n))],
      }),
    )
  }
  const fatoresTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: fatoresRows,
  })

  const scorePct = Math.round((report.peak_hour ?? 0) * 0) // placeholder, removed
  void scorePct

  const bingoParagraphs: Paragraph[] =
    (report.bingos ?? []).length > 0
      ? report.bingos.map((b) =>
          P(
            `• ${b.logradouro} — ${b.fator} [${b.orgao}] (${fmtInt(
              b.ocorrencias,
            )} ocs · ${fmtInt(b.n_fatores)} fatores)`,
          ),
        )
      : [P('Nenhuma coincidência identificada.', { italics: true })]

  const doc = new Document({
    creator: 'Hórus — CompStat Rio',
    title: `Relatório Analítico — ${report.name}`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'RELATÓRIO ANALÍTICO DE ÁREA',
                bold: true,
                size: 32,
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Hórus — CompStat Rio · Prefeitura do Rio de Janeiro',
                size: 22,
                color: '666666',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          H('1. Identificação da Área', HeadingLevel.HEADING_1),
          Bold(report.name),
          P(`Data do relatório: ${new Date().toLocaleDateString('pt-BR')}`),

          H('2. Resumo Executivo', HeadingLevel.HEADING_1),
          P(report.dinamica || '—'),

          H('3. Indicadores do Período', HeadingLevel.HEADING_1),
          indicadores,

          H('4. Distribuição por Tipo de Ocorrência', HeadingLevel.HEADING_1),
          tiposTable,

          H('5. Análise Temporal', HeadingLevel.HEADING_1),
          P(
            `Pico criminal observado às ${
              report.peak_hour != null ? `${report.peak_hour}h` : '—'
            }${report.dia_pico ? `, com maior concentração em ${report.dia_pico}` : ''}.`,
          ),
          P(
            'A curva horária (hora × dia da semana) está representada no painel interativo. As janelas mais críticas concentram-se nos finais de tarde e início de noite.',
          ),

          H('6. Dinâmica Criminal', HeadingLevel.HEADING_1),
          P(report.dinamica || '—'),

          H('7. Top Logradouros', HeadingLevel.HEADING_1),
          P('Logradouros com maior incidência de ocorrências:'),
          logradourosTable,

          H('8. Fatores de Incidência Criminal', HeadingLevel.HEADING_1),
          P('Inventário de fatores urbanos por órgão responsável:'),
          fatoresTable,

          H('9. Painel de Coincidências (Bingos)', HeadingLevel.HEADING_1),
          P('Logradouros onde se sobrepõem ocorrências criminais e fatores urbanos prioritários:'),
          ...bingoParagraphs,

          new Paragraph({
            children: [new TextRun({ text: ' ' })],
            spacing: { before: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Documento gerado automaticamente em ${new Date().toLocaleString(
                  'pt-BR',
                )} pela plataforma Hórus — CompStat Rio.`,
                italics: true,
                size: 18,
                color: '888888',
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  })

  return Packer.toBlob(doc)
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}
