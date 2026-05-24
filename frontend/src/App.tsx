import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ClipboardList,
  Flag,
  Map,
  MessageCircle,
} from 'lucide-react'

const kpis = [
  { label: 'Fontes integradas', value: '5', sub: 'PMERJ · Disk · Fatores · RELINT · Câmeras' },
  { label: 'Ocorrências', value: '115.318', sub: '2020–2024 · georreferenciadas' },
  { label: 'Câmeras FM', value: '985', sub: '9 áreas cobertas' },
  { label: 'Polígonos ORCRIM', value: '1.229', sub: 'CV · Milícia · TCP · ADA' },
]

const evidenceCards = [
  {
    icon: BarChart3,
    title: 'Ocorrências',
    text: 'Furtos e roubos georreferenciados indicam concentração, horário e recorrência.',
  },
  {
    icon: AlertTriangle,
    title: 'Fatores urbanos',
    text: 'Iluminação, vegetação, obstrução e mobiliário abandonado entram como causas acionáveis.',
  },
  {
    icon: ClipboardList,
    title: 'RELINT e denúncias',
    text: 'Contexto qualitativo explica dinâmicas, rotas de fuga e vulnerabilidades.',
  },
]

import { MapView } from './components/MapView'
import { MeetingsCRM } from './components/MeetingsCRM'
import { PlanningView } from './components/PlanningView'
import { cn } from './lib/utils'

type Route = {
  path: string
  label: string
  title: string
  eyebrow: string
  summary: string
}

const routes: Route[] = [
  {
    path: '/mapa',
    label: 'Mapa',
    title: 'Mapa de calor · ocorrências',
    eyebrow: 'Geo',
    summary:
      'Concentração de ocorrências com camadas opcionais de câmeras FM e domínio ORCRIM.',
  },
  {
    path: '/reunioes',
    label: 'Reuniões',
    title: 'CRM de reuniões CompStat',
    eyebrow: 'Organização',
    summary:
      'Cadastre reuniões, anexe relatórios, RELINTs e dossiês; o chat usa esse contexto para responder.',
  },
  {
    path: '/planejamento',
    label: 'Planejamento',
    title: 'Plano de ação consolidado',
    eyebrow: 'Acompanhamento',
    summary:
      'Metas, decisões e ações de todas as reuniões com prazo, status e carga por órgão.',
  },
]

function getRouteFromHash(): string {
  const path = window.location.hash.replace(/^#/, '') || '/mapa'
  return routes.some((r) => r.path === path) ? path : '/mapa'
}

function App() {
  const [activePath, setActivePath] = useState(getRouteFromHash)

  useEffect(() => {
    const handler = () => {
      setActivePath(getRouteFromHash())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const route = useMemo(
    () => routes.find((r) => r.path === activePath) ?? routes[0],
    [activePath],
  )

  const isFullBleed = activePath === '/mapa'

  return (
    <div className="min-h-screen text-ink-0">
      <TopBar activePath={activePath} />
      {isFullBleed ? (
        <MapView />
      ) : (
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          <RouteHeader route={route} />
          <RouteContent activePath={activePath} />
        </main>
      )}
    </div>
  )
}

function TopBar({ activePath }: { activePath: string }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <header className="sticky top-0 z-40 h-12 border-b border-bg-4 bg-bg-1/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5">
          <a href="#/mapa" className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded bg-gradient-to-br from-accent-orange to-accent-red text-xs font-bold text-white">
              CR
            </div>
            <div className="text-[13px] font-semibold leading-none">Hórus — CompStat Rio</div>
          </a>
          <div className="hidden h-7 w-px bg-bg-4 md:block" />
          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
            {routes.map((r) => (
              <a
                key={r.path}
                href={`#${r.path}`}
                className={cn(
                  'font-mono rounded px-2.5 py-1 text-[10.5px] uppercase tracking-wider transition',
                  activePath === r.path
                    ? 'bg-bg-3 text-ink-0'
                    : 'text-ink-2 hover:bg-bg-2 hover:text-ink-1',
                )}
              >
                {r.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-right md:block">
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
              Reunião CompStat
            </div>
            <div className="font-mono text-[11.5px] text-ink-1">{dateStr}</div>
          </div>
          <div className="hidden h-7 w-px bg-bg-4 md:block" />
          <div className="flex items-center gap-2">
            <span className="pulse-dot" />
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">
              online
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

function RouteHeader({ route }: { route: Route }) {
  return (
    <div className="mb-6 border-b border-bg-4 pb-5">
      <div className="font-mono mb-1.5 text-[10px] uppercase tracking-widest text-accent-orange">
        {route.eyebrow}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-0 sm:text-3xl">
        {route.title}
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{route.summary}</p>
    </div>
  )
}

function RouteContent({ activePath }: { activePath: string }) {
  if (activePath === '/reunioes') return <MeetingsCRM />
  if (activePath === '/planejamento') return <PlanningView />
  return <DashboardView />
}

function DashboardView() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KPICard key={k.label} label={k.label} value={k.value} sub={k.sub} />
        ))}
      </div>

      <Panel
        eyebrow="Atalhos"
        title="Fluxo principal"
        icon={<Activity className="size-3.5" />}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <FlowLink href="#/mapa" icon={<Map className="size-4" />}>
            Mapa de calor
          </FlowLink>
          <FlowLink href="#/reunioes" icon={<MessageCircle className="size-4" />}>
            Reuniões CompStat
          </FlowLink>
          <FlowLink href="#/planejamento" icon={<Flag className="size-4" />}>
            Planejamento
          </FlowLink>
        </div>
      </Panel>

      <Panel
        eyebrow="Evidência"
        title="Fontes integradas"
        icon={<ClipboardList className="size-3.5" />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {evidenceCards.map((c) => (
            <div key={c.title} className="rounded border border-bg-4 bg-bg-2 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-accent-orange">
                <c.icon className="size-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  {c.title}
                </span>
              </div>
              <p className="text-[11.5px] leading-5 text-ink-2">{c.text}</p>
            </div>
          ))}
        </div>
      </Panel>

    </div>
  )
}


function KPICard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded border border-bg-4 bg-bg-2 px-3.5 py-2.5 transition hover:border-bg-4/60 hover:bg-bg-3">
      <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
        {label}
      </div>
      <div className="num-mono mt-1 text-[20px] font-semibold leading-tight text-ink-0">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10.5px] text-ink-2">{sub}</div>
      ) : null}
    </div>
  )
}

function FlowLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between rounded border border-bg-4 bg-bg-2 px-3 py-2.5 text-[12px] text-ink-1 transition hover:border-accent-orange/40 hover:bg-bg-3 hover:text-ink-0"
    >
      <span className="flex items-center gap-2.5">
        <span className="text-accent-orange">{icon}</span>
        {children}
      </span>
      <ArrowRight className="size-3.5 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-accent-orange" />
    </a>
  )
}

function Panel({
  eyebrow,
  title,
  icon,
  children,
  bodyClassName,
}: {
  eyebrow?: string
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  bodyClassName?: string
}) {
  return (
    <section className="rounded border border-bg-4 bg-bg-1/70">
      <div className="border-b border-bg-4 px-4 py-2.5">
        {eyebrow ? (
          <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-3">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-ink-0">
          {icon ? <span className="text-accent-orange">{icon}</span> : null}
          {title}
        </div>
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export default App
