import type { Ref } from 'react'
import type {
  ChangeKind,
  CustomizationActions,
  CustomizationState,
  PrintSummary,
} from '../../hooks/useMugCustomization'
import { formatCm } from '../../lib/format'
import type { PrintSide, PrintTransform } from '../../lib/printMapping'
import { ImageUploader, type ImageUploaderHandle } from '../ImageUploader/ImageUploader'
import { TabPanel, Tabs, type TabItem } from '../ui/Tabs'
import { MugColorEditor } from './MugColorEditor'
import { PrintAreaControls } from './PrintAreaControls'
import { PrintImageControls } from './PrintImageControls'
import { PrintLayoutEditor } from './PrintLayoutEditor'

export type PanelTab = 'image' | 'area' | 'colors'

interface CustomizationPanelProps {
  state: CustomizationState
  summary: PrintSummary | null
  actions: CustomizationActions
  uploaderRef: Ref<ImageUploaderHandle>
  tab: PanelTab
  onTabChange(tab: PanelTab): void
  onTransformChange(patch: Partial<PrintTransform>, kind: ChangeKind): void
  onAreaSideChange(side: PrintSide): void
  onRequestUpload(): void
  onLayoutDraggingChange(dragging: boolean): void
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
  uploaderRef,
  tab,
  onTabChange,
  onTransformChange,
  onAreaSideChange,
  onRequestUpload,
  onLayoutDraggingChange,
}: CustomizationPanelProps) {
  const { image, transform, area, upload } = state
  const target = tab === 'area' ? 'area' : 'image'

  return (
    <div className="panel">
      <header className="panel__header">
        <p className="panel__eyebrow">Caneca de cerâmica · 325 ml</p>
        <h1 className="panel__title">Personalize sua caneca</h1>
        <p className="panel__lead">Envie uma imagem, defina onde ela será impressa e confira o resultado em 3D.</p>
      </header>

      <section className="panel__section" aria-labelledby="section-image">
        <h2 id="section-image" className="section-title">
          Imagem
        </h2>
        <ImageUploader
          ref={uploaderRef}
          image={image}
          status={upload}
          onFile={actions.loadFile}
          onRemove={actions.removeImage}
          onDismissError={actions.dismissError}
        />
      </section>

      <section className="panel__section" aria-labelledby="section-layout">
        <div className="section-heading">
          <h2 id="section-layout" className="section-title">
            Caneca desenrolada
          </h2>
          <span className="section-meta" aria-label="Dimensões da área de impressão">
            Área: {formatCm(area.width)} × {formatCm(area.height)}
          </span>
        </div>
        <PrintLayoutEditor
          image={image}
          transform={transform}
          area={area}
          target={target}
          onImageMove={onTransformChange}
          onAreaChange={actions.setArea}
          onDraggingChange={onLayoutDraggingChange}
        />
        <ul className="layout-legend" aria-label="Legenda">
          <li>
            <span className="legend-swatch legend-swatch--area" aria-hidden="true" />
            Área de impressão
          </li>
          {image && (
            <li>
              <span className="legend-swatch legend-swatch--image" aria-hidden="true" />
              Imagem
            </li>
          )}
          <li>
            <span className="legend-swatch legend-swatch--limit" aria-hidden="true" />
            No limite
          </li>
          <li>
            <span className="legend-swatch legend-swatch--blocked" aria-hidden="true" />
            Sem impressão
          </li>
        </ul>
        <p className="field-help">
          {target === 'area'
            ? 'Arraste a área para movê-la ou puxe os quadradinhos para redimensioná-la.'
            : image
              ? 'Arraste a imagem para posicioná-la dentro da área. Para mudar a própria área, use a aba Área.'
              : 'A imagem será impressa dentro da área tracejada. Ajuste-a na aba Área.'}
        </p>
      </section>

      <div className="panel__tabs">
        <Tabs label="Opções de personalização" idPrefix={TABS_ID} tabs={TABS} active={tab} onChange={onTabChange} />
      </div>

      <TabPanel idPrefix={TABS_ID} id={tab} className="panel__section panel__section--tab">
        {tab === 'image' && (
          <PrintImageControls
            image={image}
            transform={transform}
            area={area}
            summary={summary}
            onTransformChange={onTransformChange}
            onFitChange={actions.setFit}
            onCenter={actions.center}
            onReset={actions.reset}
            onRequestUpload={onRequestUpload}
          />
        )}
        {tab === 'area' && (
          <PrintAreaControls
            area={area}
            onShapeChange={actions.setAreaShape}
            onSizeChange={actions.setAreaSize}
            onMove={actions.moveArea}
            onSideChange={onAreaSideChange}
            onCenter={actions.centerArea}
            onReset={actions.resetArea}
          />
        )}
        {tab === 'colors' && <MugColorEditor colors={state.colors} onChange={actions.setColor} onReset={actions.resetColor} />}
      </TabPanel>
    </div>
  )
}
