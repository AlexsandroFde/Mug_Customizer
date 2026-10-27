import type { MugColorRegion, MugPart } from '../../config/mugColors'
import type {
  AreaDimension,
  ChangeKind,
  CustomizationState,
  PrintSummary,
} from '../../hooks/useMugCustomization'
import type { AreaShape, PrintArea } from '../../lib/printArea'
import type { FitMode, PrintSide, PrintTransform } from '../../lib/printMapping'
import { ImageUploader } from '../ImageUploader/ImageUploader'
import { Icon } from '../ui/Icon'
import { TabPanel, Tabs, type TabItem } from '../ui/Tabs'
import { MugColorEditor } from './MugColorEditor'
import { PrintAreaControls } from './PrintAreaControls'
import { PrintImageControls } from './PrintImageControls'
import { PrintLayoutEditor } from './PrintLayoutEditor'

export type PanelTab = 'image' | 'area' | 'colors'

/** Ações que o painel dispara; cada uma corresponde a uma ação do estado de personalização. */
export interface PanelActions {
  removeImage(): void
  dismissError(): void
  setFit(fit: FitMode): void
  center(): void
  reset(): void
  setArea(area: PrintArea, kind?: ChangeKind): void
  setAreaShape(shape: AreaShape): void
  setAreaSize(dimension: AreaDimension, value: number): void
  moveArea(offset: { offsetX?: number; offsetY?: number }, kind?: ChangeKind): void
  centerArea(): void
  resetArea(): void
  setBodyColor(color: string): void
  resetBodyColor(): void
  setPartColor(region: MugColorRegion, color: string): void
  linkPart(region: MugColorRegion): void
  linkAllParts(): void
}

interface CustomizationPanelProps {
  state: CustomizationState
  summary: PrintSummary | null
  actions: PanelActions
  tab: PanelTab
  onTabChange(tab: PanelTab): void
  selectedPart: MugPart
  onSelectPart(part: MugPart): void
  onTransformChange(patch: Partial<PrintTransform>, kind: ChangeKind): void
  onAreaSideChange(side: PrintSide): void
  onOpenFilePicker(): void
  onLayoutDraggingChange(dragging: boolean): void
  /** Ações gerais, no rodapé. */
  pristine: boolean
  onResetAll(): void
  exporting: boolean
  onExport(): void
}

const TABS: ReadonlyArray<TabItem<PanelTab>> = [
  { id: 'image', label: 'Estampa' },
  { id: 'area', label: 'Área' },
  { id: 'colors', label: 'Cores' },
]

const TABS_ID = 'customization'

export function CustomizationPanel({
  state,
  summary,
  actions,
  tab,
  onTabChange,
  selectedPart,
  onSelectPart,
  onTransformChange,
  onAreaSideChange,
  onOpenFilePicker,
  onLayoutDraggingChange,
  pristine,
  onResetAll,
  exporting,
  onExport,
}: CustomizationPanelProps) {
  const { image, transform, area, upload, colors } = state

  const layout = (target: 'image' | 'area') => (
    <PrintLayoutEditor
      image={image}
      transform={transform}
      area={area}
      target={target}
      wallColor={colors.body}
      onImageMove={onTransformChange}
      onAreaChange={actions.setArea}
      onDraggingChange={onLayoutDraggingChange}
    />
  )

  return (
    <div className="panel">
      <header className="panel__header">
        <h1 className="panel__title">Personalizar caneca</h1>
        <p className="panel__subtitle">Cerâmica · 325 ml</p>
      </header>

      <div className="panel__tabs">
        <Tabs label="Seções da personalização" idPrefix={TABS_ID} tabs={TABS} active={tab} onChange={onTabChange} />
      </div>

      <TabPanel idPrefix={TABS_ID} id={tab} className="panel__body">
        {tab === 'image' && (
          <>
            <ImageUploader
              image={image}
              status={upload}
              onOpen={onOpenFilePicker}
              onRemove={actions.removeImage}
              onDismissError={actions.dismissError}
            />
            {image && summary ? (
              <>
                <figure className="layout-figure">
                  {layout('image')}
                  <figcaption className="field-hint">Arraste a imagem para posicioná-la dentro da área tracejada.</figcaption>
                </figure>
                <PrintImageControls
                  image={image}
                  transform={transform}
                  area={area}
                  summary={summary}
                  bodyColor={colors.body}
                  onTransformChange={onTransformChange}
                  onFitChange={actions.setFit}
                  onCenter={actions.center}
                  onReset={actions.reset}
                />
              </>
            ) : (
              <p className="empty-note">
                Se preferir, comece pelas{' '}
                <button type="button" className="link-button" onClick={() => onTabChange('colors')}>
                  cores da caneca
                </button>{' '}
                e adicione a imagem depois.
              </p>
            )}
          </>
        )}

        {tab === 'area' && (
          <>
            <figure className="layout-figure">
              {layout('area')}
              <figcaption className="layout-legend">
                <span>
                  <span className="legend-mark legend-mark--area" aria-hidden="true" />
                  Área
                </span>
                {image && (
                  <span>
                    <span className="legend-mark legend-mark--image" aria-hidden="true" />
                    Imagem
                  </span>
                )}
                <span>
                  <span className="legend-mark legend-mark--limit" aria-hidden="true" />
                  No limite
                </span>
                <span>
                  <span className="legend-mark legend-mark--blocked" aria-hidden="true" />
                  Sem impressão
                </span>
              </figcaption>
            </figure>
            <p className="field-hint">Arraste a área para movê-la ou puxe os quadradinhos para redimensioná-la.</p>
            <PrintAreaControls
              area={area}
              onShapeChange={actions.setAreaShape}
              onSizeChange={actions.setAreaSize}
              onMove={actions.moveArea}
              onSideChange={onAreaSideChange}
              onCenter={actions.centerArea}
              onReset={actions.resetArea}
            />
          </>
        )}

        {tab === 'colors' && (
          <MugColorEditor
            colors={colors}
            selected={selectedPart}
            onSelect={onSelectPart}
            onBodyColor={actions.setBodyColor}
            onResetBody={actions.resetBodyColor}
            onApplyToAll={actions.linkAllParts}
            onPartColor={actions.setPartColor}
            onLinkPart={actions.linkPart}
          />
        )}
      </TabPanel>

      <footer className="panel__footer">
        <button type="button" className="button button--ghost" onClick={onResetAll} disabled={pristine}>
          <Icon name="reset" size={18} />
          Redefinir
        </button>
        <button type="button" className="button button--primary" onClick={onExport} disabled={exporting} aria-busy={exporting}>
          {exporting ? <span className="spinner spinner--sm spinner--inverse" aria-hidden="true" /> : <Icon name="download" size={18} />}
          {exporting ? 'Gerando imagem…' : 'Baixar imagem'}
        </button>
      </footer>
    </div>
  )
}
