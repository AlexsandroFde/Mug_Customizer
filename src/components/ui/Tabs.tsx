import type { KeyboardEvent, ReactNode } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
}

interface TabsProps<T extends string> {
  label: string
  /** Prefixo dos ids, compartilhado com os painéis (veja TabPanel). */
  idPrefix: string
  tabs: ReadonlyArray<TabItem<T>>
  active: T
  onChange(tab: T): void
}

const tabId = (prefix: string, id: string) => `${prefix}-${id}-tab`
const panelId = (prefix: string, id: string) => `${prefix}-${id}-panel`

interface TabPanelProps {
  /** O mesmo prefixo passado às abas. */
  idPrefix: string
  /** Aba à qual o painel corresponde. */
  id: string
  className?: string
  children: ReactNode
}

/** Painel ligado à aba correspondente, para leitores de tela. */
export function TabPanel({ idPrefix, id, className, children }: TabPanelProps) {
  return (
    <div role="tabpanel" id={panelId(idPrefix, id)} aria-labelledby={tabId(idPrefix, id)} tabIndex={-1} className={className}>
      {children}
    </div>
  )
}

/** Abas com navegação pelo teclado (setas, Home e End), no padrão WAI-ARIA de ativação automática. */
export function Tabs<T extends string>({ label, idPrefix, tabs, active, onChange }: TabsProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active)
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1
    if (target < 0) return
    event.preventDefault()
    onChange(tabs[target].id)
    document.getElementById(tabId(idPrefix, tabs[target].id))?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
